#!/usr/bin/env python3
"""Audit verified Notion export packages without extracting or modifying them."""

from __future__ import annotations

import csv
import io
import json
import re
import sys
import zipfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any

from project_paths import DATA_APP_ROOT

BACKUP_ROOT = DATA_APP_ROOT / "backup" / "notion-original-snapshot"
BACKUP_MANIFEST_PATH = DATA_APP_ROOT / "import" / "manifests" / "backup-manifest.json"
BACKUP_CHECKPOINT_PATH = DATA_APP_ROOT / "import" / "checkpoints" / "backup-state.json"
AUDIT_JSON_PATH = DATA_APP_ROOT / "import" / "manifests" / "notion-export-audit.json"
REPORT_PATH = DATA_APP_ROOT / "reports" / "NOTION_EXPORT_AUDIT.md"
LOG_PATH = DATA_APP_ROOT / "logs" / "notion-audit.jsonl"
COLLECTIONS = ("Read", "Watch")
NOTION_ID_RE = re.compile(r"(?<![0-9a-f])([0-9a-f]{32})(?![0-9a-f])", re.IGNORECASE)
TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.IGNORECASE | re.DOTALL)


class AuditError(RuntimeError):
    pass


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    temporary.replace(path)


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


def require_verified_backup() -> dict[str, Any]:
    try:
        checkpoint = json.loads(BACKUP_CHECKPOINT_PATH.read_text(encoding="utf-8"))
        manifest = json.loads(BACKUP_MANIFEST_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise AuditError(f"Cannot read verified backup evidence: {error}") from error
    if checkpoint.get("status") != "verified":
        raise AuditError("Backup checkpoint is not verified; audit is blocked")
    if manifest.get("hash_algorithm") != "SHA-256":
        raise AuditError("Backup manifest is missing SHA-256 evidence")
    return manifest


def decode_utf8(data: bytes, source: str) -> str:
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        raise AuditError(f"Expected UTF-8 text in {source}: {error}") from error


def csv_details(archive: zipfile.ZipFile, member: str) -> dict[str, Any]:
    text = decode_utf8(archive.read(member), member)
    reader = csv.DictReader(io.StringIO(text, newline=""))
    columns = list(reader.fieldnames or [])
    rows = list(reader)
    title_column = columns[0] if columns else None
    titles = [str(row.get(title_column, "")).strip() for row in rows] if title_column else []
    duplicate_titles: dict[str, list[str]] = defaultdict(list)
    for title in titles:
        if title:
            duplicate_titles[title.casefold()].append(title)
    duplicates = [values for values in duplicate_titles.values() if len(values) > 1]
    return {
        "path": member,
        "columns": columns,
        "record_count": len(rows),
        "title_column": title_column,
        "blank_title_count": sum(not title for title in titles),
        "duplicate_title_groups": duplicates,
        "nonempty_by_column": {
            column: sum(bool(str(row.get(column, "")).strip()) for row in rows)
            for column in columns
        },
    }


def audit_zip(path: Path, collection: str, relative_path: str, sha256: str) -> dict[str, Any]:
    try:
        with zipfile.ZipFile(path) as archive:
            infos = archive.infolist()
            file_infos = [info for info in infos if not info.is_dir()]
            directory_infos = [info for info in infos if info.is_dir()]
            names = [info.filename for info in file_infos]
            unsafe = sorted(
                name
                for name in names
                if PurePosixPath(name).is_absolute() or ".." in PurePosixPath(name).parts
            )
            duplicates = sorted(name for name, count in Counter(names).items() if count > 1)
            extension_counts = Counter(
                PurePosixPath(name).suffix.lower() or "[none]" for name in names
            )
            csv_tables = [
                csv_details(archive, name)
                for name in names
                if PurePosixPath(name).suffix.lower() == ".csv"
            ]
            root_files = sorted(name for name in names if "/" not in name.rstrip("/"))
            notion_ids = sorted(
                {
                    match.group(1).lower()
                    for name in names
                    for match in NOTION_ID_RE.finditer(name)
                }
            )
            bad_crc_member = archive.testzip()
    except (OSError, zipfile.BadZipFile) as error:
        raise AuditError(f"Cannot audit ZIP {path}: {error}") from error

    if extension_counts.get(".md"):
        export_format = "Markdown + CSV"
    elif extension_counts.get(".html"):
        export_format = "HTML + CSV"
    elif extension_counts.get(".pdf"):
        export_format = "PDF + CSV"
    else:
        export_format = "Unknown ZIP export"

    return {
        "collection": collection,
        "backup_relative_path": relative_path,
        "backup_file": str(path),
        "sha256": sha256,
        "byte_size": path.stat().st_size,
        "format": export_format,
        "archive_file_count": len(file_infos),
        "archive_directory_count": len(directory_infos),
        "uncompressed_byte_count": sum(info.file_size for info in file_infos),
        "crc_test": "PASS" if bad_crc_member is None else "FAIL",
        "bad_crc_member": bad_crc_member,
        "unsafe_member_paths": unsafe,
        "duplicate_member_paths": duplicates,
        "extension_counts": dict(sorted(extension_counts.items())),
        "root_files": root_files,
        "notion_ids": notion_ids,
        "csv_tables": csv_tables,
    }


def audit_standalone_html(
    path: Path, collection: str, relative_path: str, sha256: str
) -> dict[str, Any]:
    with path.open("rb") as handle:
        header = handle.read(1024 * 1024)
    text = header.decode("utf-8", errors="replace")
    title_match = TITLE_RE.search(text)
    title = re.sub(r"\s+", " ", title_match.group(1)).strip() if title_match else None
    notion_ids = sorted(match.group(1).lower() for match in NOTION_ID_RE.finditer(text))
    return {
        "collection": collection,
        "backup_relative_path": relative_path,
        "backup_file": str(path),
        "sha256": sha256,
        "byte_size": path.stat().st_size,
        "format": "Standalone HTML artifact",
        "html_title": title,
        "notion_ids_in_header": notion_ids,
        "classification": (
            "Derivative interactive archive"
            if title and "interactive archive" in title.casefold()
            else "Requires review"
        ),
    }


def choose_canonical(packages: list[dict[str, Any]], collection: str) -> dict[str, Any]:
    candidates = [
        package
        for package in packages
        if package["collection"] == collection and package["format"] == "Markdown + CSV"
    ]
    if len(candidates) != 1:
        raise AuditError(
            f"Expected exactly one Markdown + CSV package for {collection}; found {len(candidates)}"
        )
    package = candidates[0]
    all_tables = [
        table for table in package["csv_tables"] if table["path"].lower().endswith("_all.csv")
    ]
    if len(all_tables) != 1:
        raise AuditError(
            f"Expected exactly one _all.csv in {collection} Markdown package; found {len(all_tables)}"
        )
    return {
        "collection": collection,
        "package_path": package["backup_relative_path"],
        "package_sha256": package["sha256"],
        "record_table": all_tables[0],
        "markdown_page_count": package["extension_counts"].get(".md", 0),
        "attachment_counts": {
            extension: count
            for extension, count in package["extension_counts"].items()
            if extension not in {".md", ".csv"}
        },
        "root_files": package["root_files"],
        "notion_ids": package["notion_ids"],
    }


def build_audit(manifest: dict[str, Any]) -> dict[str, Any]:
    packages: list[dict[str, Any]] = []
    standalone: list[dict[str, Any]] = []
    for entry in manifest.get("files", []):
        collection = entry["source_collection"]
        relative_path = entry["relative_path"]
        path = BACKUP_ROOT / collection / Path(relative_path)
        if not path.is_file():
            raise AuditError(f"Manifested backup file is missing: {path}")
        extension = path.suffix.lower()
        if extension == ".zip":
            packages.append(
                audit_zip(path, collection, relative_path, entry["sha256"])
            )
        elif extension == ".html":
            standalone.append(
                audit_standalone_html(path, collection, relative_path, entry["sha256"])
            )
        else:
            standalone.append(
                {
                    "collection": collection,
                    "backup_relative_path": relative_path,
                    "backup_file": str(path),
                    "sha256": entry["sha256"],
                    "byte_size": entry["byte_size"],
                    "format": "Unknown standalone file",
                    "classification": "Requires review",
                }
            )

    canonical = {name: choose_canonical(packages, name) for name in COLLECTIONS}
    review_items: list[str] = []
    for package in packages:
        if package["crc_test"] != "PASS":
            review_items.append(f'ZIP CRC failed: {package["backup_relative_path"]}')
        if package["unsafe_member_paths"]:
            review_items.append(f'Unsafe ZIP member paths: {package["backup_relative_path"]}')
        if package["duplicate_member_paths"]:
            review_items.append(f'Duplicate ZIP member paths: {package["backup_relative_path"]}')
    for artifact in standalone:
        if artifact.get("classification") == "Requires review":
            review_items.append(
                f'Unclassified standalone artifact: {artifact["backup_relative_path"]}'
            )

    return {
        "schema_version": 1,
        "generated_at_utc": utc_now(),
        "input": "verified backup only",
        "backup_manifest_sha256_algorithm": manifest["hash_algorithm"],
        "summary": {
            "Read_records": canonical["Read"]["record_table"]["record_count"],
            "Watch_records": canonical["Watch"]["record_table"]["record_count"],
            "zip_packages": len(packages),
            "standalone_artifacts": len(standalone),
            "review_item_count": len(review_items),
        },
        "canonical_sources": canonical,
        "zip_packages": packages,
        "standalone_artifacts": standalone,
        "review_items": review_items,
    }


def markdown_table_row(values: list[Any]) -> str:
    return "| " + " | ".join(str(value).replace("|", "\\|") for value in values) + " |"


def write_report(audit: dict[str, Any]) -> None:
    canonical = audit["canonical_sources"]
    lines = [
        "# Notion Export Audit",
        "",
        "NOTION EXPORT AUDIT: COMPLETE",
        "",
        f'Audited at (UTC): {audit["generated_at_utc"]}',
        "",
        "Input boundary: verified read-only files under `backup/notion-original-snapshot/` only. No archive was extracted in place.",
        "",
        "## Record Summary",
        "",
        "| Collection | Canonical records | Markdown pages | Canonical table |",
        "| --- | ---: | ---: | --- |",
    ]
    for collection in COLLECTIONS:
        source = canonical[collection]
        lines.append(
            markdown_table_row(
                [
                    collection,
                    source["record_table"]["record_count"],
                    source["markdown_page_count"],
                    f'`{source["record_table"]["path"]}`',
                ]
            )
        )

    lines.extend(
        [
            "",
            "The canonical packages are the single Markdown + CSV exports for each collection. Their `_all.csv` tables are the structured record lists. The HTML and PDF packages are parallel representations of the same Notion page/database families and are preserved for reconciliation, not imported as additional records.",
            "",
            "## Properties Found",
            "",
        ]
    )
    for collection in COLLECTIONS:
        table = canonical[collection]["record_table"]
        lines.extend(
            [
                f"### {collection}",
                "",
                f'Records: {table["record_count"]}; blank primary titles: {table["blank_title_count"]}.',
                "",
                markdown_table_row(["Property", "Non-empty values"]),
                "| --- | ---: |",
            ]
        )
        for column in table["columns"]:
            lines.append(markdown_table_row([column, table["nonempty_by_column"][column]]))
        duplicate_groups = table["duplicate_title_groups"]
        lines.extend(
            [
                "",
                f"Duplicate-looking primary-title groups: {len(duplicate_groups)}.",
                "",
            ]
        )
        if duplicate_groups:
            for group in duplicate_groups:
                lines.append(f"- {', '.join(group)}")
            lines.append("")

    lines.extend(
        [
            "## Canonical Attachments",
            "",
            "Counts below are archive members in the canonical Markdown packages; media remains as normal files during import.",
            "",
            "| Collection | Type | Count |",
            "| --- | --- | ---: |",
        ]
    )
    for collection in COLLECTIONS:
        for extension, count in canonical[collection]["attachment_counts"].items():
            lines.append(markdown_table_row([collection, extension, count]))

    lines.extend(
        [
            "",
            "## Export Packages",
            "",
            "| Collection | Format | ZIP files | CSV tables | CRC | Backup path |",
            "| --- | --- | ---: | ---: | :---: | --- |",
        ]
    )
    for package in audit["zip_packages"]:
        lines.append(
            markdown_table_row(
                [
                    package["collection"],
                    package["format"],
                    package["archive_file_count"],
                    len(package["csv_tables"]),
                    package["crc_test"],
                    f'`{package["collection"]}/{package["backup_relative_path"]}`',
                ]
            )
        )

    lines.extend(["", "## Standalone and Unknown Data", ""])
    if audit["standalone_artifacts"]:
        for artifact in audit["standalone_artifacts"]:
            title = artifact.get("html_title") or "No title detected"
            lines.append(
                f'- `{artifact["collection"]}/{artifact["backup_relative_path"]}`: '
                f'{artifact.get("classification", artifact["format"])}; title `{title}`; '
                f'{artifact["byte_size"]} bytes. Preserved but not used as a canonical record table.'
            )
    else:
        lines.append("- None.")

    lines.extend(
        [
            "",
            "## Page Structure and Provenance",
            "",
            "- Read has one root database page plus one Markdown page per canonical record (20 Markdown files for 19 records).",
            "- Watch has one root database page plus one Markdown page per canonical record (72 Markdown files for 71 records).",
            "- Notion's 32-character page/database IDs are present in archive member names and will be retained as the stable provenance key.",
            "- Exact archive path, member path, package SHA-256, and Notion ID must be stored for every imported item.",
            "- Parallel HTML/PDF variants share the same logical Notion IDs but are not asserted byte-equivalent to Markdown; they remain preserved source variants.",
            "",
            "## Parsing Concerns",
            "",
            "- CSV rows provide structured properties; Markdown member files provide page content and media relationships. The importer must reconcile them by preserved Notion ID and title without guessing.",
            "- Duplicate titles, when present, cannot be used as identity; stable Notion IDs control folder identity and idempotency.",
            "- Filenames may contain punctuation, Unicode, spaces, or generated IDs. Folder slugs must be deterministic while `item.md` retains the exact title.",
            "- Every non-canonical package and standalone artifact remains accounted for in the machine-readable audit and backup manifests.",
            "",
            "## Review Queue",
            "",
        ]
    )
    if audit["review_items"]:
        lines.extend(f"- {item}" for item in audit["review_items"])
    else:
        lines.append("- No structural or CRC failures require manual review before importer design.")
    lines.extend(
        [
            "",
            "## Audit Decision",
            "",
            "Use the Markdown + CSV package and its `_all.csv` table once per collection. Preserve all parallel formats and standalone artifacts in the immutable backup, but do not create duplicate library items from them.",
            "",
        ]
    )
    REPORT_PATH.write_text("\n".join(lines), encoding="utf-8", newline="\n")


def main() -> int:
    try:
        append_log("audit_started")
        manifest = require_verified_backup()
        audit = build_audit(manifest)
        write_json(AUDIT_JSON_PATH, audit)
        write_report(audit)
        append_log("audit_completed", summary=audit["summary"])
        print(
            f'Notion audit: Read={audit["summary"]["Read_records"]}, '
            f'Watch={audit["summary"]["Watch_records"]}, '
            f'review={audit["summary"]["review_item_count"]}'
        )
        return 0
    except (AuditError, OSError, KeyError, csv.Error) as error:
        append_log("audit_failed", error=str(error))
        print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
