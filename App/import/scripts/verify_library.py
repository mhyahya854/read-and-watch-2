#!/usr/bin/env python3
"""Verify imported library items, provenance, hashes, links, and structure."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlsplit

import import_library
from project_paths import DATA_APP_ROOT


LIBRARY_ROOT = DATA_APP_ROOT / "library"
PLAN_PATH = DATA_APP_ROOT / "import" / "manifests" / "import-plan.json"
IMPORT_CHECKPOINT_PATH = DATA_APP_ROOT / "import" / "checkpoints" / "import-state.json"
VERIFICATION_CHECKPOINT_PATH = (
    DATA_APP_ROOT / "import" / "checkpoints" / "library-verification.json"
)
REPORT_PATH = DATA_APP_ROOT / "reports" / "LIBRARY_VERIFICATION.md"
LOG_PATH = DATA_APP_ROOT / "logs" / "library-verification.jsonl"
USER_ADDED_PATH = DATA_APP_ROOT / "import" / "manifests" / "user-added-items.json"
COLLECTIONS = ("Read", "Watch")
REQUIRED_SECTIONS = (
    "Overview",
    "My Thoughts",
    "Notes",
    "Relationships",
    "Media",
    "Metadata",
    "Import Information",
)
BASE64_RE = re.compile(r"data:[^\s)]+;base64,", re.IGNORECASE)


class VerificationError(RuntimeError):
    pass


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def load_json(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise VerificationError(f"Cannot read valid JSON {path}: {error}") from error


def write_json_atomic(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    os.replace(temporary, path)


def append_log(event: str, **details: Any) -> None:
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with LOG_PATH.open("a", encoding="utf-8", newline="\n") as handle:
        handle.write(
            json.dumps(
                {"timestamp": utc_now(), "event": event, **details},
                ensure_ascii=False,
            )
            + "\n"
        )


def parse_front_matter(markdown: str) -> dict[str, Any]:
    if not markdown.startswith("---\n"):
        raise VerificationError("item.md has no YAML front matter")
    closing = markdown.find("\n---\n", 4)
    if closing < 0:
        raise VerificationError("item.md front matter is not closed")
    parsed: dict[str, Any] = {}
    for line in markdown[4:closing].splitlines():
        key, separator, raw = line.partition(":")
        if not separator:
            raise VerificationError(f"Malformed front-matter line: {line}")
        try:
            parsed[key] = json.loads(raw.strip())
        except json.JSONDecodeError:
            parsed[key] = raw.strip()
    return parsed


def verify_local_links(markdown: str, item_path: Path) -> list[str]:
    broken: list[str] = []
    for link in import_library.iter_markdown_links(markdown):
        target = link["target"].strip().strip("<>")
        parsed = urlsplit(target)
        if parsed.scheme or target.startswith("//") or target.startswith("#"):
            continue
        decoded = unquote(parsed.path)
        if not decoded:
            continue
        destination = (item_path.parent / Path(decoded)).resolve()
        if not destination.exists():
            broken.append(target)
    return broken


def verify_item(item: dict[str, Any]) -> dict[str, Any]:
    folder = LIBRARY_ROOT / item["collection"] / item["folder_name"]
    errors: list[str] = []
    if not folder.is_dir():
        return {
            "id": item["id"],
            "folder": str(folder),
            "status": "FAIL",
            "errors": ["item folder is missing"],
            "attachment_files": 0,
            "output_files": 0,
        }

    valid_manifest, manifest_reason = import_library.validate_imported_folder(
        folder, item["id"]
    )
    if not valid_manifest:
        errors.append(f"output manifest: {manifest_reason}")
    import_manifest = load_json(folder / "_import.json")
    expected_files = {output["path"] for output in import_manifest.get("outputs", [])}
    expected_files.add("_import.json")
    actual_files = {
        path.relative_to(folder).as_posix()
        for path in folder.rglob("*")
        if path.is_file()
    }
    extra_files = sorted(actual_files - expected_files)
    missing_files = sorted(expected_files - actual_files)
    if extra_files:
        errors.append(f"unmanifested files: {extra_files}")
    if missing_files:
        errors.append(f"missing manifested files: {missing_files}")

    item_markdown_path = folder / "item.md"
    try:
        markdown = item_markdown_path.read_text(encoding="utf-8")
        front = parse_front_matter(markdown)
    except (OSError, UnicodeDecodeError, VerificationError) as error:
        errors.append(f"item.md: {error}")
        markdown = ""
        front = {}
    if front.get("id") != item["id"]:
        errors.append("front-matter stable ID mismatch")
    if front.get("title") != item["title"]:
        errors.append("front-matter exact title mismatch")
    if front.get("collection") != item["collection"].casefold():
        errors.append("front-matter collection mismatch")
    if front.get("notion_properties") != item["notion_properties"]:
        errors.append("front-matter Notion properties differ from the import plan")
    original_source = front.get("original_source", {})
    if original_source.get("archive_member") != item["page_member"]:
        errors.append("front-matter source member mismatch")
    if original_source.get("page_sha256") != item["page_sha256"]:
        errors.append("front-matter page hash mismatch")
    for section in REQUIRED_SECTIONS:
        if f"## {section}" not in markdown:
            errors.append(f"missing required section: {section}")
    if BASE64_RE.search(markdown):
        errors.append("Base64 media blob detected in item.md")
    broken_links = verify_local_links(markdown, item_markdown_path)
    if broken_links:
        errors.append(f"broken relative links: {broken_links}")

    original_path = folder / "source" / "original.md"
    if not original_path.is_file() or import_library.sha256_file(original_path) != item["page_sha256"]:
        errors.append("byte-identical original page evidence is missing or mismatched")
    row_evidence = load_json(folder / "source" / "notion-row.json")
    if (
        row_evidence.get("csv_member") != item["csv_member"]
        or row_evidence.get("csv_row_number") != item["csv_row_number"]
        or row_evidence.get("values") != item["notion_properties"]
    ):
        errors.append("CSV row evidence mismatch")
    provenance = load_json(folder / "source" / "provenance.json")
    if (
        provenance.get("notion_page_id") != item["notion_page_id"]
        or provenance.get("package_sha256") != item["package_sha256"]
        or provenance.get("page_member") != item["page_member"]
        or provenance.get("page_sha256") != item["page_sha256"]
    ):
        errors.append("provenance evidence mismatch")
    for attachment in item["attachments"]:
        path = folder / Path(attachment["output_path"])
        if not path.is_file():
            errors.append(f'missing attachment: {attachment["output_path"]}')
        elif (
            path.stat().st_size != attachment["byte_size"]
            or import_library.sha256_file(path) != attachment["sha256"]
        ):
            errors.append(f'attachment hash/size mismatch: {attachment["output_path"]}')

    return {
        "id": item["id"],
        "folder": str(folder),
        "status": "PASS" if not errors else "FAIL",
        "errors": errors,
        "attachment_files": len(item["attachments"]),
        "output_files": len(actual_files),
    }


def load_user_added_items() -> list[dict[str, Any]]:
    if not USER_ADDED_PATH.is_file():
        return []
    manifest = load_json(USER_ADDED_PATH)
    if manifest.get("schema_version") != 1 or not isinstance(manifest.get("items"), list):
        raise VerificationError("Unsupported user-added item manifest")
    return manifest["items"]


def verify_user_added_item(item: dict[str, Any]) -> dict[str, Any]:
    folder = LIBRARY_ROOT / item["collection"] / item["folder_name"]
    errors: list[str] = []
    if not folder.is_dir():
        return {"id": item["id"], "folder": str(folder), "status": "FAIL", "errors": ["item folder is missing"], "attachment_files": 0, "output_files": 0}
    try:
        record = load_json(folder / "_user_added.json")
        outputs = record.get("outputs", {})
        if record.get("status") != "complete" or record.get("item_id") != item["id"]:
            errors.append("user-added manifest identity/status mismatch")
        actual_files = {path.relative_to(folder).as_posix() for path in folder.rglob("*") if path.is_file()}
        expected_files = set(outputs) | {"_user_added.json"}
        if actual_files != expected_files:
            errors.append(f"user-added file set mismatch: {sorted(actual_files ^ expected_files)}")
        for relative, expected in outputs.items():
            path = folder / Path(relative)
            if not path.is_file() or path.stat().st_size != expected["byte_size"] or import_library.sha256_file(path) != expected["sha256"]:
                errors.append(f"user-added output mismatch: {relative}")
        markdown = (folder / "item.md").read_text(encoding="utf-8")
        front = parse_front_matter(markdown)
        required_front = {"id": item["id"], "title": item["title"], "collection": "read", "user_added": True, "imported_from_notion": False, "source_type": "personal_book"}
        for key, value in required_front.items():
            if front.get(key) != value:
                errors.append(f"front-matter {key} mismatch")
        for section in REQUIRED_SECTIONS:
            if f"## {section}" not in markdown:
                errors.append(f"missing required section: {section}")
        if BASE64_RE.search(markdown):
            errors.append("Base64 media blob detected in item.md")
        broken_links = verify_local_links(markdown, folder / "item.md")
        if broken_links:
            errors.append(f"broken relative links: {broken_links}")
        provenance = load_json(folder / "source" / "provenance.json")
        if provenance.get("item_id") != item["id"] or provenance.get("user_added") is not True or provenance.get("imported_from_notion") is not False or provenance.get("source_type") != "personal_book":
            errors.append("user-added provenance mismatch")
    except (OSError, KeyError, UnicodeDecodeError, VerificationError) as error:
        errors.append(str(error))
        actual_files = set()
    return {"id": item["id"], "folder": str(folder), "status": "PASS" if not errors else "FAIL", "errors": errors, "attachment_files": len(item.get("attachments", [])), "output_files": len(actual_files)}


def verify_collection(plan: dict[str, Any], collection: str, user_added_items: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    items = [item for item in plan["items"] if item["collection"] == collection]
    user_items = [item for item in (user_added_items or []) if item["collection"] == collection]
    results = [verify_item(item) for item in items] + [verify_user_added_item(item) for item in user_items]
    expected_folders = {item["folder_name"].casefold() for item in [*items, *user_items]}
    collection_root = LIBRARY_ROOT / collection
    actual_folders = {
        path.name.casefold()
        for path in collection_root.iterdir()
        if path.is_dir()
    }
    extra_folders = sorted(actual_folders - expected_folders)
    missing_folders = sorted(expected_folders - actual_folders)
    staging_root = DATA_APP_ROOT / "import" / "staging" / collection
    staged_directories = (
        sorted(path.name for path in staging_root.iterdir() if path.is_dir())
        if staging_root.is_dir()
        else []
    )
    errors: list[str] = []
    if extra_folders:
        errors.append(f"unplanned item folders: {extra_folders}")
    if missing_folders:
        errors.append(f"missing item folders: {missing_folders}")
    if staged_directories:
        errors.append(f"unfinished staging directories: {staged_directories}")
    failed_items = [result for result in results if result["status"] != "PASS"]
    return {
        "collection": collection,
        "status": "PASS" if not errors and not failed_items else "FAIL",
        "expected_items": len(items) + len(user_items),
        "verified_items": len(results) - len(failed_items),
        "attachment_files": sum(result["attachment_files"] for result in results),
        "output_files": sum(result["output_files"] for result in results),
        "extra_folders": extra_folders,
        "missing_folders": missing_folders,
        "staging_directories": staged_directories,
        "errors": errors,
        "failed_items": failed_items,
    }


def verify_indexes(plan: dict[str, Any], user_added_items: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    errors: list[str] = []
    all_items = [*plan["items"], *(user_added_items or [])]
    expected_by_collection = {
        collection: [item for item in all_items if item["collection"] == collection]
        for collection in COLLECTIONS
    }
    for collection, items in expected_by_collection.items():
        index_path = LIBRARY_ROOT / f"{collection.upper()}.md"
        if not index_path.is_file():
            errors.append(f"missing {index_path.name}")
            continue
        try:
            text = index_path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as error:
            errors.append(f"cannot read {index_path.name} as UTF-8: {error}")
            continue
        ids = re.findall(r"(?m)^ID: (.+)$", text)
        paths = re.findall(r"(?m)^Path: (.+)$", text)
        expected_ids = [item["id"] for item in items]
        expected_paths = [
            f'./{collection}/{item["folder_name"]}/item.md' for item in items
        ]
        if ids != expected_ids:
            errors.append(f"{index_path.name} IDs/order differ from the import plan")
        if paths != expected_paths:
            errors.append(f"{index_path.name} paths/order differ from the import plan")
        for relative in paths:
            if not (LIBRARY_ROOT / Path(relative)).is_file():
                errors.append(f"broken index path in {index_path.name}: {relative}")
        if BASE64_RE.search(text):
            errors.append(f"Base64 blob detected in {index_path.name}")

    catalog_path = LIBRARY_ROOT / "catalog.json"
    if not catalog_path.is_file():
        errors.append("missing catalog.json")
        catalog: dict[str, Any] = {"items": [], "counts": {}}
    else:
        catalog = load_json(catalog_path)
    catalog_items = catalog.get("items", [])
    expected_items = all_items
    if len(catalog_items) != len(expected_items):
        errors.append("catalog item count differs from the import plan")
    catalog_ids = [item.get("id") for item in catalog_items]
    if catalog_ids != [item["id"] for item in expected_items]:
        errors.append("catalog IDs/order differ from the import plan")
    if len(catalog_ids) != len(set(catalog_ids)):
        errors.append("catalog IDs are not unique")
    expected_counts = {
        "read": len(expected_by_collection["Read"]),
        "watch": len(expected_by_collection["Watch"]),
        "total": len(expected_items),
    }
    if catalog.get("counts") != expected_counts:
        errors.append("catalog counts are incorrect")
    for item in catalog_items:
        item_path = item.get("itemPath")
        if not isinstance(item_path, str) or not (LIBRARY_ROOT / Path(item_path)).is_file():
            errors.append(f'broken catalog item path: {item_path}')
        preview = item.get("preview")
        if preview and not (LIBRARY_ROOT / Path(preview)).is_file():
            errors.append(f"broken catalog preview: {preview}")
        for media in item.get("media", []):
            media_path = media.get("path")
            if not isinstance(media_path, str) or not (
                LIBRARY_ROOT / Path(media_path)
            ).is_file():
                errors.append(f"broken catalog media path: {media_path}")
    return {
        "status": "PASS" if not errors else "FAIL",
        "index_items": sum(len(items) for items in expected_by_collection.values()),
        "catalog_items": len(catalog_items),
        "errors": errors,
    }


def write_report(checkpoint: dict[str, Any]) -> None:
    collections = checkpoint["collections"]
    all_run = all(name in collections for name in COLLECTIONS)
    overall_pass = all_run and all(
        collections[name]["status"] == "PASS" for name in COLLECTIONS
    ) and checkpoint.get("indexes", {}).get("status") == "PASS"
    lines = [
        "# Library Verification",
        "",
        f"LIBRARY VERIFIED: {'PASS' if overall_pass else 'IN PROGRESS'}",
        "",
        f'Updated at (UTC): {checkpoint["updated_at_utc"]}',
        "",
        "| Collection | Status | Expected items | Verified items | Attachments | Output files |",
        "| --- | :---: | ---: | ---: | ---: | ---: |",
    ]
    for name in COLLECTIONS:
        result = collections.get(name)
        if result is None:
            lines.append(f"| {name} | NOT RUN | 0 | 0 | 0 | 0 |")
        else:
            lines.append(
                f'| {name} | {result["status"]} | {result["expected_items"]} | '
                f'{result["verified_items"]} | {result["attachment_files"]} | '
                f'{result["output_files"]} |'
            )
    index_result = checkpoint.get("indexes")
    if index_result:
        lines.extend(
            [
                "",
                f'Indexes/catalog: {index_result["status"]}; '
                f'{index_result["index_items"]} indexed items and '
                f'{index_result["catalog_items"]} catalog items.',
            ]
        )
    lines.extend(
        [
            "",
            "Checks cover item count, stable IDs, exact titles, preserved Notion properties, output manifests, SHA-256 evidence, source page bytes, CSV rows, provenance, attachment hashes, UTF-8 Markdown, required sections, relative links, Base64 exclusion, destination uniqueness, and empty staging.",
            "",
            "## Failures",
            "",
        ]
    )
    failures = 0
    for name, result in collections.items():
        for error in result["errors"]:
            lines.append(f"- {name}: {error}")
            failures += 1
        for item in result["failed_items"]:
            for error in item["errors"]:
                lines.append(f'- `{item["id"]}`: {error}')
                failures += 1
    for error in checkpoint.get("indexes", {}).get("errors", []):
        lines.append(f"- Index/catalog: {error}")
        failures += 1
    if not failures:
        lines.append("- None in the collections verified so far.")
    lines.append("")
    REPORT_PATH.write_text("\n".join(lines), encoding="utf-8", newline="\n")


def command_verify(selection: str) -> None:
    plan = load_json(PLAN_PATH)
    user_added_items = load_user_added_items()
    import_state = load_json(IMPORT_CHECKPOINT_PATH)
    if plan.get("preflight_status") != "PASS":
        raise VerificationError("Import preflight is not PASS")
    checkpoint = (
        load_json(VERIFICATION_CHECKPOINT_PATH)
        if VERIFICATION_CHECKPOINT_PATH.exists()
        else {"schema_version": 1, "collections": {}}
    )
    selected = COLLECTIONS if selection == "all" else (selection,)
    append_log("verification_started", selection=selection)
    for collection in selected:
        if import_state["collections"].get(collection) != "complete":
            raise VerificationError(f"{collection} import checkpoint is not complete")
        checkpoint["collections"][collection] = verify_collection(plan, collection, user_added_items)
    if selection == "all":
        checkpoint["indexes"] = verify_indexes(plan, user_added_items)
    checkpoint["updated_at_utc"] = utc_now()
    checkpoint["status"] = (
        "PASS"
        if all(
            checkpoint["collections"].get(name, {}).get("status") == "PASS"
            for name in COLLECTIONS
        ) and checkpoint.get("indexes", {}).get("status") == "PASS"
        else "IN_PROGRESS"
    )
    write_json_atomic(VERIFICATION_CHECKPOINT_PATH, checkpoint)
    write_report(checkpoint)
    append_log("verification_completed", selection=selection, status=checkpoint["status"])
    selection_status = (
        checkpoint["status"]
        if selection == "all"
        else checkpoint["collections"][selection]["status"]
    )
    print(f"{selection} library verification: {selection_status}")
    if selection_status != "PASS":
        raise VerificationError(f"{selection} library verification failed")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("selection", choices=(*COLLECTIONS, "all"))
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        command_verify(args.selection)
        return 0
    except (OSError, KeyError, VerificationError) as error:
        append_log("verification_failed", selection=args.selection, error=str(error))
        print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
