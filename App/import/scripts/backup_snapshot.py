#!/usr/bin/env python3
"""Create and verify a non-destructive snapshot of the configured exports."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import stat
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from project_paths import DATA_APP_ROOT, REPOSITORY_ROOT

CONFIG_PATH = DATA_APP_ROOT / "config" / "source-paths.json"
MANIFEST_DIR = DATA_APP_ROOT / "import" / "manifests"
SOURCE_MANIFEST_PATH = MANIFEST_DIR / "source-manifest.json"
BACKUP_MANIFEST_PATH = MANIFEST_DIR / "backup-manifest.json"
BACKUP_ROOT = DATA_APP_ROOT / "backup" / "notion-original-snapshot"
CHECKPOINT_PATH = DATA_APP_ROOT / "import" / "checkpoints" / "backup-state.json"
REPORT_PATH = DATA_APP_ROOT / "reports" / "BACKUP_VERIFICATION.md"
LOG_PATH = DATA_APP_ROOT / "logs" / "backup-operations.jsonl"
BUFFER_SIZE = 1024 * 1024
COLLECTIONS = ("Read", "Watch")


class SafetyError(RuntimeError):
    """Raised when continuing could corrupt or ambiguously copy user data."""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def write_json_atomic(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    os.replace(temporary, path)


def append_log(event: str, **details: Any) -> None:
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    record = {"timestamp": utc_now(), "event": event, **details}
    with LOG_PATH.open("a", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def load_source_roots() -> dict[str, Path]:
    try:
        config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        configured = config["collections"]
    except (OSError, KeyError, json.JSONDecodeError) as error:
        raise SafetyError(f"Cannot read valid source configuration: {error}") from error

    roots: dict[str, Path] = {}
    for collection in COLLECTIONS:
        raw = configured.get(collection)
        if not isinstance(raw, str) or not raw.strip():
            raise SafetyError(f"Missing configured source path for {collection}")
        root = Path(raw).resolve(strict=True)
        if not root.is_dir():
            raise SafetyError(f"Configured {collection} source is not a directory: {root}")
        if root == REPOSITORY_ROOT or REPOSITORY_ROOT in root.parents:
            raise SafetyError(f"Source must be outside the Git repository: {root}")
        roots[collection] = root

    if roots["Read"] == roots["Watch"]:
        raise SafetyError("Read and Watch cannot point to the same source directory")
    return roots


def is_reparse_point(path: Path) -> bool:
    metadata = path.lstat()
    attributes = getattr(metadata, "st_file_attributes", 0)
    reparse_flag = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0)
    return path.is_symlink() or bool(attributes & reparse_flag)


def iter_tree(root: Path) -> tuple[list[Path], list[Path]]:
    directories: list[Path] = []
    files: list[Path] = []
    for current, dir_names, file_names in os.walk(root, followlinks=False):
        current_path = Path(current)
        dir_names.sort(key=str.casefold)
        file_names.sort(key=str.casefold)
        for name in dir_names:
            directory = current_path / name
            if is_reparse_point(directory):
                raise SafetyError(f"Reparse point or symlink requires review: {directory}")
            directories.append(directory)
        for name in file_names:
            file_path = current_path / name
            if is_reparse_point(file_path):
                raise SafetyError(f"Reparse point or symlink requires review: {file_path}")
            if not file_path.is_file():
                raise SafetyError(f"Unsupported non-file entry requires review: {file_path}")
            files.append(file_path)
    return directories, files


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(BUFFER_SIZE):
            digest.update(chunk)
    return digest.hexdigest()


def scan_roots(roots: dict[str, Path], manifest_kind: str) -> dict[str, Any]:
    entries: list[dict[str, Any]] = []
    directory_entries: list[dict[str, str]] = []
    per_collection: dict[str, dict[str, int]] = {}
    for collection in COLLECTIONS:
        root = roots[collection]
        directories, files = iter_tree(root)
        for directory in directories:
            directory_entries.append(
                {
                    "relative_path": directory.relative_to(root).as_posix(),
                    "source_collection": collection,
                }
            )
        byte_total = 0
        for path in files:
            size = path.stat().st_size
            byte_total += size
            relative = path.relative_to(root).as_posix()
            entries.append(
                {
                    "relative_path": relative,
                    "filename": path.name,
                    "extension": path.suffix,
                    "byte_size": size,
                    "sha256": sha256_file(path),
                    "source_collection": collection,
                }
            )
        per_collection[collection] = {
            "file_count": len(files),
            "directory_count": len(directories),
            "byte_count": byte_total,
        }

    entries.sort(key=lambda item: (item["source_collection"], item["relative_path"]))
    directory_entries.sort(
        key=lambda item: (item["source_collection"], item["relative_path"])
    )
    return {
        "schema_version": 1,
        "manifest_kind": manifest_kind,
        "hash_algorithm": "SHA-256",
        "generated_at_utc": utc_now(),
        "collection_roots": {name: str(path) for name, path in roots.items()},
        "summary": {
            "file_count": len(entries),
            "directory_count": len(directory_entries),
            "byte_count": sum(item["byte_size"] for item in entries),
            "collections": per_collection,
        },
        "directories": directory_entries,
        "files": entries,
    }


def entry_map(manifest: dict[str, Any]) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for entry in manifest.get("files", []):
        key = f'{entry["source_collection"]}/{entry["relative_path"]}'
        if key in result:
            raise SafetyError(f"Duplicate manifest path: {key}")
        result[key] = entry
    return result


def compare_manifests(
    expected: dict[str, Any], actual: dict[str, Any]
) -> dict[str, list[Any]]:
    expected_map = entry_map(expected)
    actual_map = entry_map(actual)
    missing = sorted(set(expected_map) - set(actual_map))
    extra = sorted(set(actual_map) - set(expected_map))
    expected_directories = {
        f'{entry["source_collection"]}/{entry["relative_path"]}'
        for entry in expected.get("directories", [])
    }
    actual_directories = {
        f'{entry["source_collection"]}/{entry["relative_path"]}'
        for entry in actual.get("directories", [])
    }
    changed: list[dict[str, Any]] = []
    for key in sorted(set(expected_map) & set(actual_map)):
        left = expected_map[key]
        right = actual_map[key]
        differences = {
            field: {"expected": left.get(field), "actual": right.get(field)}
            for field in ("filename", "extension", "byte_size", "sha256")
            if left.get(field) != right.get(field)
        }
        if differences:
            changed.append({"path": key, "differences": differences})
    return {
        "missing": missing,
        "extra": extra,
        "changed": changed,
        "missing_directories": sorted(expected_directories - actual_directories),
        "extra_directories": sorted(actual_directories - expected_directories),
    }


def has_mismatches(comparison: dict[str, list[Any]]) -> bool:
    return any(
        comparison[name]
        for name in (
            "missing",
            "extra",
            "changed",
            "missing_directories",
            "extra_directories",
        )
    )


def load_manifest(path: Path) -> dict[str, Any]:
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise SafetyError(f"Cannot read manifest {path}: {error}") from error
    if manifest.get("hash_algorithm") != "SHA-256":
        raise SafetyError(f"Unsupported or missing hash algorithm in {path}")
    entry_map(manifest)
    return manifest


def write_checkpoint(status: str, **details: Any) -> None:
    write_json_atomic(
        CHECKPOINT_PATH,
        {"schema_version": 1, "status": status, "updated_at_utc": utc_now(), **details},
    )


def command_manifest_source() -> None:
    roots = load_source_roots()
    append_log("source_manifest_started", roots={k: str(v) for k, v in roots.items()})
    manifest = scan_roots(roots, "source")
    if SOURCE_MANIFEST_PATH.exists():
        existing = load_manifest(SOURCE_MANIFEST_PATH)
        comparison = compare_manifests(existing, manifest)
        if has_mismatches(comparison):
            append_log("source_manifest_rewrite_blocked", comparison=comparison)
            raise SafetyError(
                "Existing source manifest differs from the live sources and was not overwritten"
            )
        append_log("source_manifest_unchanged", summary=existing["summary"])
        print(
            f'Source manifest already matches: {existing["summary"]["file_count"]} '
            f'files, {existing["summary"]["byte_count"]} bytes'
        )
        return
    write_json_atomic(SOURCE_MANIFEST_PATH, manifest)
    write_checkpoint(
        "source_manifest_created",
        source_file_count=manifest["summary"]["file_count"],
        source_byte_count=manifest["summary"]["byte_count"],
    )
    append_log("source_manifest_completed", summary=manifest["summary"])
    print(
        f'Source manifest: {manifest["summary"]["file_count"]} files, '
        f'{manifest["summary"]["byte_count"]} bytes'
    )


def verified_checkpoint_exists() -> bool:
    if not CHECKPOINT_PATH.exists():
        return False
    try:
        return json.loads(CHECKPOINT_PATH.read_text(encoding="utf-8")).get("status") == "verified"
    except (OSError, json.JSONDecodeError):
        return False


def command_copy() -> None:
    if verified_checkpoint_exists():
        append_log("copy_skipped_already_verified")
        print("Backup is already verified; copy made no changes.")
        return

    expected = load_manifest(SOURCE_MANIFEST_PATH)
    source_roots = load_source_roots()
    live_source = scan_roots(source_roots, "source-pre-copy-check")
    source_check = compare_manifests(expected, live_source)
    if has_mismatches(source_check):
        write_checkpoint("blocked_source_changed", comparison=source_check)
        append_log("copy_blocked_source_changed", comparison=source_check)
        raise SafetyError("Source differs from source-manifest.json; copy was not started")

    copied = 0
    skipped = 0
    append_log("backup_copy_started", expected_summary=expected["summary"])
    for collection in COLLECTIONS:
        source_root = source_roots[collection]
        destination_root = BACKUP_ROOT / collection
        destination_root.mkdir(parents=True, exist_ok=True)
        directories, files = iter_tree(source_root)
        for directory in directories:
            (destination_root / directory.relative_to(source_root)).mkdir(
                parents=True, exist_ok=True
            )
        for source_file in files:
            relative = source_file.relative_to(source_root)
            destination = destination_root / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            expected_entry = entry_map(expected)[f"{collection}/{relative.as_posix()}"]
            if destination.exists():
                if not destination.is_file() or is_reparse_point(destination):
                    raise SafetyError(f"Unsafe existing backup destination: {destination}")
                if (
                    destination.stat().st_size == expected_entry["byte_size"]
                    and sha256_file(destination) == expected_entry["sha256"]
                ):
                    skipped += 1
                    continue
                raise SafetyError(
                    f"Conflicting backup file was not overwritten: {destination}"
                )

            temporary = destination.with_name(f".{destination.name}.copying")
            if temporary.exists():
                raise SafetyError(f"Interrupted temporary copy requires review: {temporary}")
            shutil.copy2(source_file, temporary)
            if (
                temporary.stat().st_size != expected_entry["byte_size"]
                or sha256_file(temporary) != expected_entry["sha256"]
            ):
                temporary.unlink(missing_ok=True)
                raise SafetyError(f"Copied file failed immediate verification: {source_file}")
            os.replace(temporary, destination)
            copied += 1

        for directory in sorted(directories, key=lambda path: len(path.parts), reverse=True):
            shutil.copystat(
                directory,
                destination_root / directory.relative_to(source_root),
                follow_symlinks=False,
            )
        shutil.copystat(source_root, destination_root, follow_symlinks=False)

    write_checkpoint(
        "copied_unverified",
        files_copied=copied,
        matching_files_skipped=skipped,
        expected_file_count=expected["summary"]["file_count"],
    )
    append_log("backup_copy_completed", files_copied=copied, matching_skipped=skipped)
    print(f"Backup copy: {copied} copied, {skipped} already matching; verification required")


def report_lines_for_comparison(
    heading: str, comparison: dict[str, list[Any]]
) -> list[str]:
    lines = [f"## {heading}", ""]
    lines.append(f'- Missing paths: {len(comparison["missing"])}')
    lines.append(f'- Extra paths: {len(comparison["extra"])}')
    lines.append(f'- Changed files: {len(comparison["changed"])}')
    lines.append(f'- Missing directories: {len(comparison["missing_directories"])}')
    lines.append(f'- Extra directories: {len(comparison["extra_directories"])}')
    if has_mismatches(comparison):
        lines.extend(["", "### Mismatches", "", "```json"])
        lines.append(json.dumps(comparison, ensure_ascii=False, indent=2))
        lines.append("```")
    lines.append("")
    return lines


def write_verification_report(
    passed: bool,
    recorded_source: dict[str, Any],
    live_source: dict[str, Any],
    backup: dict[str, Any],
    source_stability: dict[str, list[Any]],
    backup_comparison: dict[str, list[Any]],
    locked_files: int,
) -> None:
    status = "PASS" if passed else "FAIL"
    source_summary = live_source["summary"]
    backup_summary = backup["summary"]
    lines = [
        "# Backup Verification",
        "",
        f"BACKUP VERIFIED: {status}",
        "",
        f"Verified at (UTC): {utc_now()}",
        "",
        "## Totals",
        "",
        "| Check | Source | Backup | Match |",
        "| --- | ---: | ---: | :---: |",
        f'| Directories | {source_summary["directory_count"]} | {backup_summary["directory_count"]} | {"YES" if source_summary["directory_count"] == backup_summary["directory_count"] else "NO"} |',
        f'| Files | {source_summary["file_count"]} | {backup_summary["file_count"]} | {"YES" if source_summary["file_count"] == backup_summary["file_count"] else "NO"} |',
        f'| Bytes | {source_summary["byte_count"]} | {backup_summary["byte_count"]} | {"YES" if source_summary["byte_count"] == backup_summary["byte_count"] else "NO"} |',
        "",
        "Verification compared every collection-relative path, filename, extension, byte size, and SHA-256 checksum.",
        "",
        f'- Recorded source manifest files: {recorded_source["summary"]["file_count"]}',
        f"- Backup files made read-only after PASS: {locked_files}",
        "",
    ]
    lines += report_lines_for_comparison("Source Stability", source_stability)
    lines += report_lines_for_comparison("Source to Backup", backup_comparison)
    lines.extend(
        [
            "## Gate Result",
            "",
            (
                "Import from the verified backup is permitted. The original sources and backup remain read-only inputs."
                if passed
                else "Import is blocked. Resolve every mismatch safely and rerun verification."
            ),
            "",
        ]
    )
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text("\n".join(lines), encoding="utf-8", newline="\n")


def make_backup_files_read_only() -> int:
    locked = 0
    for collection in COLLECTIONS:
        root = BACKUP_ROOT / collection
        _, files = iter_tree(root)
        for file_path in files:
            os.chmod(file_path, stat.S_IREAD)
            locked += 1
    return locked


def command_verify() -> None:
    recorded_source = load_manifest(SOURCE_MANIFEST_PATH)
    source_roots = load_source_roots()
    backup_roots = {name: (BACKUP_ROOT / name).resolve(strict=True) for name in COLLECTIONS}
    append_log("backup_verification_started")

    live_source = scan_roots(source_roots, "source-verification")
    backup = scan_roots(backup_roots, "backup")
    write_json_atomic(BACKUP_MANIFEST_PATH, backup)
    source_stability = compare_manifests(recorded_source, live_source)
    backup_comparison = compare_manifests(recorded_source, backup)
    passed = not has_mismatches(source_stability) and not has_mismatches(
        backup_comparison
    )
    locked_files = make_backup_files_read_only() if passed else 0
    write_verification_report(
        passed,
        recorded_source,
        live_source,
        backup,
        source_stability,
        backup_comparison,
        locked_files,
    )
    write_checkpoint(
        "verified" if passed else "verification_failed",
        source_file_count=live_source["summary"]["file_count"],
        source_byte_count=live_source["summary"]["byte_count"],
        backup_file_count=backup["summary"]["file_count"],
        backup_byte_count=backup["summary"]["byte_count"],
        source_stability=source_stability,
        source_to_backup=backup_comparison,
        read_only_files=locked_files,
    )
    append_log(
        "backup_verification_completed",
        result="PASS" if passed else "FAIL",
        source_summary=live_source["summary"],
        backup_summary=backup["summary"],
    )
    print(f"BACKUP VERIFIED: {'PASS' if passed else 'FAIL'}")
    if not passed:
        raise SafetyError("Backup verification failed; import remains blocked")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "command",
        choices=("manifest-source", "copy", "verify"),
        help="Run one explicit backup phase",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        if args.command == "manifest-source":
            command_manifest_source()
        elif args.command == "copy":
            command_copy()
        else:
            command_verify()
    except (OSError, SafetyError) as error:
        append_log("operation_failed", command=args.command, error=str(error))
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
