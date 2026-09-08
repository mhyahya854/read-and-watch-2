#!/usr/bin/env python3
"""Preflight and import verified Notion records into the file-first library."""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import os
import posixpath
import re
import sys
import unicodedata
import zipfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any
from urllib.parse import unquote, urlsplit

from project_paths import DATA_APP_ROOT

BACKUP_ROOT = DATA_APP_ROOT / "backup" / "notion-original-snapshot"
LIBRARY_ROOT = DATA_APP_ROOT / "library"
STAGING_ROOT = DATA_APP_ROOT / "import" / "staging"
AUDIT_PATH = DATA_APP_ROOT / "import" / "manifests" / "notion-export-audit.json"
BACKUP_CHECKPOINT_PATH = DATA_APP_ROOT / "import" / "checkpoints" / "backup-state.json"
PLAN_PATH = DATA_APP_ROOT / "import" / "manifests" / "import-plan.json"
IMPORT_CHECKPOINT_PATH = DATA_APP_ROOT / "import" / "checkpoints" / "import-state.json"
PREFLIGHT_REPORT_PATH = DATA_APP_ROOT / "reports" / "IMPORT_PREFLIGHT.md"
IMPORT_REPORT_PATH = DATA_APP_ROOT / "reports" / "IMPORT_REPORT.md"
NEEDS_REVIEW_PATH = DATA_APP_ROOT / "reports" / "NEEDS_REVIEW.md"
LOG_PATH = DATA_APP_ROOT / "logs" / "import-operations.jsonl"
IMPORTER_VERSION = "1.0.0"
COLLECTIONS = ("Read", "Watch")
PAGE_ID_RE = re.compile(r" ([0-9a-f]{32})\.md$", re.IGNORECASE)
IMAGE_EXTENSIONS = {".avif", ".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"}
RESERVED_WINDOWS_NAMES = {
    "con",
    "prn",
    "aux",
    "nul",
    *(f"com{number}" for number in range(1, 10)),
    *(f"lpt{number}" for number in range(1, 10)),
}


class ImportSafetyError(RuntimeError):
    pass


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def write_json_atomic(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    os.replace(temporary, path)


def write_text_atomic(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp")
    temporary.write_text(text, encoding="utf-8", newline="\n")
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


def load_json(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ImportSafetyError(f"Cannot read valid JSON {path}: {error}") from error


def require_verified_inputs() -> dict[str, Any]:
    checkpoint = load_json(BACKUP_CHECKPOINT_PATH)
    audit = load_json(AUDIT_PATH)
    if checkpoint.get("status") != "verified":
        raise ImportSafetyError("Backup is not verified; import is blocked")
    if audit.get("input") != "verified backup only":
        raise ImportSafetyError("Notion audit does not declare the verified backup boundary")
    return audit


def safe_slug(value: str, max_length: int = 80) -> str:
    normalized = unicodedata.normalize("NFKC", value).strip()
    characters: list[str] = []
    separator_pending = False
    for character in normalized:
        if character.isalnum():
            if separator_pending and characters:
                characters.append("-")
            characters.append(character)
            separator_pending = False
        else:
            separator_pending = True
    slug = "".join(characters).strip("-. ") or "Untitled"
    slug = slug[:max_length].rstrip("-. ") or "Untitled"
    if slug.casefold() in RESERVED_WINDOWS_NAMES:
        slug = f"Item-{slug}"
    return slug


def safe_media_name(filename: str, index: int) -> str:
    path = PurePosixPath(filename)
    suffix = "".join(character for character in path.suffix if character.isalnum() or character == ".")
    stem = safe_slug(path.stem, max_length=52)
    return f"{index:03d}-{stem}{suffix.lower()}"


def normalized_title(value: str) -> str:
    stripped = unicodedata.normalize("NFC", value).strip()
    return (stripped or "Untitled").casefold()


def iter_markdown_links(text: str) -> list[dict[str, Any]]:
    """Return link targets while honoring balanced parentheses in Notion paths."""
    links: list[dict[str, Any]] = []
    cursor = 0
    while True:
        marker = text.find("](", cursor)
        if marker < 0:
            break
        content_start = marker + 2
        index = content_start
        depth = 1
        escaped = False
        while index < len(text):
            character = text[index]
            if escaped:
                escaped = False
            elif character == "\\":
                escaped = True
            elif character == "(":
                depth += 1
            elif character == ")":
                depth -= 1
                if depth == 0:
                    break
            index += 1
        if depth != 0:
            cursor = content_start
            continue
        content = text[content_start:index].strip()
        if content.startswith("<") and ">" in content:
            target = content[: content.index(">") + 1]
        else:
            title_match = re.search(r"\s+[\"'][^\"']*[\"']\s*$", content)
            target = content[: title_match.start()].rstrip() if title_match else content
        relative_start = text.find(target, content_start, index)
        if target and relative_start >= 0:
            links.append(
                {
                    "target": target,
                    "target_start": relative_start,
                    "target_end": relative_start + len(target),
                }
            )
        cursor = index + 1
    return links


def rewrite_markdown_links(text: str, replacements: dict[str, str]) -> str:
    output: list[str] = []
    cursor = 0
    for link in iter_markdown_links(text):
        output.append(text[cursor : link["target_start"]])
        output.append(replacements.get(link["target"], link["target"]))
        cursor = link["target_end"]
    output.append(text[cursor:])
    return "".join(output)


def parse_page_markdown(
    raw: bytes, member: str, property_columns: list[str]
) -> dict[str, Any]:
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        raise ImportSafetyError(f"Page is not valid UTF-8: {member}: {error}") from error
    lines = text.splitlines()
    heading_index = next(
        (index for index, line in enumerate(lines) if line.startswith("# ")), None
    )
    if heading_index is None:
        raise ImportSafetyError(f"Page has no level-one heading: {member}")
    title = lines[heading_index][2:].strip()
    keys = {column.casefold(): column for column in property_columns}
    properties: dict[str, str] = {}
    index = heading_index + 1
    while index < len(lines) and not lines[index].strip():
        index += 1
    while index < len(lines):
        line = lines[index]
        if not line.strip():
            index += 1
            continue
        key, separator, value = line.partition(":")
        canonical = keys.get(key.strip().casefold()) if separator else None
        if canonical is None:
            break
        properties[canonical] = value.strip()
        index += 1
    body = "\n".join(lines[index:]).strip()
    match = PAGE_ID_RE.search(PurePosixPath(member).name)
    if not match:
        raise ImportSafetyError(f"Page filename has no trailing Notion ID: {member}")
    return {
        "member": member,
        "notion_page_id": match.group(1).lower(),
        "title": title,
        "page_properties": properties,
        "body": body,
        "page_sha256": sha256_bytes(raw),
    }


def map_rows_to_pages(
    rows: list[dict[str, str]],
    pages: list[dict[str, Any]],
    title_column: str,
    property_columns: list[str],
) -> tuple[list[tuple[int, dict[str, str], dict[str, Any]]], list[str]]:
    row_groups: dict[str, list[tuple[int, dict[str, str]]]] = defaultdict(list)
    page_groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for index, row in enumerate(rows, start=2):
        row_groups[normalized_title(row.get(title_column, ""))].append((index, row))
    for page in pages:
        page_groups[normalized_title(page["title"])].append(page)

    review: list[str] = []
    mapped: list[tuple[int, dict[str, str], dict[str, Any]]] = []
    for key in sorted(set(row_groups) | set(page_groups)):
        grouped_rows = row_groups.get(key, [])
        grouped_pages = page_groups.get(key, [])
        if len(grouped_rows) != len(grouped_pages):
            review.append(
                f"Title group {key!r} has {len(grouped_rows)} CSV rows and "
                f"{len(grouped_pages)} Markdown pages"
            )
            continue
        if len(grouped_rows) == 1:
            mapped.append((grouped_rows[0][0], grouped_rows[0][1], grouped_pages[0]))
            continue

        rows_by_fingerprint: dict[tuple[str, ...], list[tuple[int, dict[str, str]]]] = defaultdict(list)
        pages_by_fingerprint: dict[tuple[str, ...], list[dict[str, Any]]] = defaultdict(list)
        for row_number, row in grouped_rows:
            fingerprint = tuple(str(row.get(column, "")).strip() for column in property_columns)
            rows_by_fingerprint[fingerprint].append((row_number, row))
        for page in grouped_pages:
            fingerprint = tuple(
                str(page["page_properties"].get(column, "")).strip()
                for column in property_columns
            )
            pages_by_fingerprint[fingerprint].append(page)
        for fingerprint in sorted(set(rows_by_fingerprint) | set(pages_by_fingerprint)):
            matching_rows = rows_by_fingerprint.get(fingerprint, [])
            matching_pages = pages_by_fingerprint.get(fingerprint, [])
            if len(matching_rows) == len(matching_pages) == 1:
                mapped.append((matching_rows[0][0], matching_rows[0][1], matching_pages[0]))
            else:
                review.append(
                    f"Title group {key!r} has an ambiguous property fingerprint: "
                    f"{len(matching_rows)} rows and {len(matching_pages)} pages"
                )
    mapped.sort(key=lambda item: item[0])
    return mapped, review


def resolve_local_target(page_member: str, raw_target: str) -> str | None:
    target = raw_target.strip().strip("<>")
    parsed = urlsplit(target)
    if parsed.scheme or target.startswith("//") or target.startswith("#"):
        return None
    decoded = unquote(parsed.path).replace("\\", "/")
    if not decoded:
        return None
    resolved = posixpath.normpath(
        posixpath.join(str(PurePosixPath(page_member).parent), decoded)
    )
    if resolved.startswith("../") or resolved.startswith("/"):
        raise ImportSafetyError(f"Local Markdown link escapes the archive root: {raw_target}")
    return resolved


def package_path(collection: str, relative_path: str) -> Path:
    path = BACKUP_ROOT / collection / Path(relative_path)
    if not path.is_file():
        raise ImportSafetyError(f"Canonical package is missing: {path}")
    return path


def build_collection_plan(
    audit: dict[str, Any], collection: str
) -> tuple[list[dict[str, Any]], dict[str, Any], list[str]]:
    source = audit["canonical_sources"][collection]
    archive_path = package_path(collection, source["package_path"])
    if sha256_file(archive_path) != source["package_sha256"]:
        raise ImportSafetyError(f"Canonical {collection} package hash changed")
    review: list[str] = []
    with zipfile.ZipFile(archive_path) as archive:
        names = [info.filename for info in archive.infolist() if not info.is_dir()]
        name_set = set(names)
        table_member = source["record_table"]["path"]
        try:
            table_text = archive.read(table_member).decode("utf-8-sig")
        except (KeyError, UnicodeDecodeError) as error:
            raise ImportSafetyError(f"Cannot read canonical table {table_member}: {error}") from error
        reader = csv.DictReader(io.StringIO(table_text, newline=""))
        columns = list(reader.fieldnames or [])
        rows = [{key: value or "" for key, value in row.items()} for row in reader]
        if not columns:
            raise ImportSafetyError(f"Canonical {collection} table has no columns")
        title_column = columns[0]
        property_columns = columns[1:]
        page_members = [
            name
            for name in names
            if PurePosixPath(name).suffix.lower() == ".md"
            and PAGE_ID_RE.search(PurePosixPath(name).name)
            and "/" in name
        ]
        pages = [
            parse_page_markdown(archive.read(member), member, property_columns)
            for member in page_members
        ]
        mapped, mapping_review = map_rows_to_pages(
            rows, pages, title_column, property_columns
        )
        review.extend(mapping_review)
        if len(mapped) != len(rows) or len(mapped) != len(pages):
            review.append(
                f"{collection} mapped {len(mapped)} of {len(rows)} rows and {len(pages)} pages"
            )

        base_slugs = {
            page["notion_page_id"]: safe_slug(page["title"]) for _, _, page in mapped
        }
        slug_counts = Counter(slug.casefold() for slug in base_slugs.values())
        folder_names: dict[str, str] = {}
        for page_id, base in base_slugs.items():
            folder_names[page_id] = (
                f"{base[:69].rstrip('-')}--{page_id[:8]}"
                if slug_counts[base.casefold()] > 1
                else base
            )

        page_to_folder = {
            page["member"]: folder_names[page["notion_page_id"]]
            for _, _, page in mapped
        }
        used_assets: set[str] = set()
        items: list[dict[str, Any]] = []
        unresolved_links: list[str] = []
        for row_number, row, page in mapped:
            raw = archive.read(page["member"])
            text = raw.decode("utf-8-sig")
            attachment_members: list[str] = []
            relation_members: list[str] = []
            unresolved_for_item: list[str] = []
            link_targets: list[dict[str, str]] = []
            for link_match in iter_markdown_links(text):
                raw_target = link_match["target"]
                resolved = resolve_local_target(page["member"], raw_target)
                if resolved is None:
                    continue
                if resolved not in name_set:
                    unresolved_for_item.append(raw_target)
                    continue
                extension = PurePosixPath(resolved).suffix.lower()
                if extension == ".md":
                    if resolved in page_to_folder:
                        relation_members.append(resolved)
                        link_targets.append(
                            {
                                "raw_target": raw_target,
                                "kind": "relationship",
                                "source_member": resolved,
                            }
                        )
                    else:
                        unresolved_for_item.append(raw_target)
                elif extension != ".csv":
                    if resolved not in attachment_members:
                        attachment_members.append(resolved)
                    link_targets.append(
                        {
                            "raw_target": raw_target,
                            "kind": "attachment",
                            "source_member": resolved,
                        }
                    )
            if unresolved_for_item:
                unresolved_links.extend(
                    f'{page["member"]}: {target}' for target in unresolved_for_item
                )

            attachments: list[dict[str, Any]] = []
            attachment_output: dict[str, str] = {}
            for index, member in enumerate(attachment_members, start=1):
                data = archive.read(member)
                output = f"media/{safe_media_name(PurePosixPath(member).name, index)}"
                attachments.append(
                    {
                        "source_member": member,
                        "output_path": output,
                        "filename": PurePosixPath(member).name,
                        "extension": PurePosixPath(member).suffix.lower(),
                        "byte_size": len(data),
                        "sha256": sha256_bytes(data),
                    }
                )
                attachment_output[member] = output
                used_assets.add(member)
            for link in link_targets:
                if link["kind"] == "attachment":
                    link["output_path"] = attachment_output[link["source_member"]]
                else:
                    link["target_folder"] = page_to_folder[link["source_member"]]

            collection_key = collection.casefold()
            item_id = f'{collection_key}-{page["notion_page_id"]}'
            items.append(
                {
                    "id": item_id,
                    "collection": collection,
                    "title": page["title"],
                    "folder_name": folder_names[page["notion_page_id"]],
                    "notion_page_id": page["notion_page_id"],
                    "notion_properties": row,
                    "page_properties": page["page_properties"],
                    "csv_member": table_member,
                    "csv_row_number": row_number,
                    "package_relative_path": source["package_path"],
                    "package_sha256": source["package_sha256"],
                    "page_member": page["member"],
                    "page_sha256": page["page_sha256"],
                    "attachments": attachments,
                    "relations": sorted(set(relation_members)),
                    "link_targets": link_targets,
                    "unresolved_links": unresolved_for_item,
                }
            )

        all_assets = {
            name
            for name in names
            if PurePosixPath(name).suffix.lower() not in {".md", ".csv"}
        }
        unassigned_assets = sorted(all_assets - used_assets)
        if unassigned_assets:
            review.append(
                f"{collection} has {len(unassigned_assets)} canonical attachments not linked by an item page"
            )
        if unresolved_links:
            review.append(
                f"{collection} has {len(unresolved_links)} unresolved local Markdown links"
            )
    items.sort(key=lambda item: (item["csv_row_number"], item["id"]))
    summary = {
        "csv_records": len(rows),
        "markdown_pages": len(pages),
        "mapped_items": len(items),
        "linked_attachment_files": sum(len(item["attachments"]) for item in items),
        "unique_linked_attachment_files": len(used_assets),
        "canonical_attachment_files": len(all_assets),
        "unassigned_assets": unassigned_assets,
        "unresolved_links": unresolved_links,
        "title_column": title_column,
        "property_columns": property_columns,
    }
    return items, summary, review


def build_import_plan() -> dict[str, Any]:
    audit = require_verified_inputs()
    all_items: list[dict[str, Any]] = []
    collection_summaries: dict[str, Any] = {}
    review_items: list[str] = []
    for collection in COLLECTIONS:
        items, summary, review = build_collection_plan(audit, collection)
        all_items.extend(items)
        collection_summaries[collection] = summary
        review_items.extend(review)
    ids = [item["id"] for item in all_items]
    destination_keys = [
        f'{item["collection"]}/{item["folder_name"]}'.casefold() for item in all_items
    ]
    if len(ids) != len(set(ids)):
        review_items.append("Stable item IDs are not unique")
    if len(destination_keys) != len(set(destination_keys)):
        review_items.append("Case-insensitive destination folders are not unique")
    expected_records = sum(
        summary["csv_records"] for summary in collection_summaries.values()
    )
    status = "PASS" if not review_items and len(all_items) == expected_records else "FAIL"
    return {
        "schema_version": 1,
        "importer_version": IMPORTER_VERSION,
        "generated_at_utc": utc_now(),
        "input": "verified backup canonical Markdown packages only",
        "preflight_status": status,
        "summary": {
            "records": expected_records,
            "mapped_items": len(all_items),
            "unique_ids": len(set(ids)),
            "unique_destinations": len(set(destination_keys)),
            "attachment_references": sum(
                len(item["attachments"]) for item in all_items
            ),
            "review_item_count": len(review_items),
        },
        "collections": collection_summaries,
        "items": all_items,
        "review_items": review_items,
    }


def write_preflight_report(plan: dict[str, Any]) -> None:
    lines = [
        "# Import Preflight",
        "",
        f'IMPORT PREFLIGHT: {plan["preflight_status"]}',
        "",
        f'Generated at (UTC): {plan["generated_at_utc"]}',
        "",
        "No library item was written by this preflight.",
        "",
        "## Coverage",
        "",
        "| Collection | CSV records | Pages | Mapped | Canonical attachments | Accounted attachments | Unresolved links |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for collection in COLLECTIONS:
        summary = plan["collections"][collection]
        lines.append(
            f'| {collection} | {summary["csv_records"]} | {summary["markdown_pages"]} | '
            f'{summary["mapped_items"]} | {summary["canonical_attachment_files"]} | '
            f'{summary["unique_linked_attachment_files"]} | {len(summary["unresolved_links"])} |'
        )
    lines.extend(
        [
            "",
            f'- Total mapped items: {plan["summary"]["mapped_items"]}',
            f'- Unique stable IDs: {plan["summary"]["unique_ids"]}',
            f'- Unique case-insensitive destinations: {plan["summary"]["unique_destinations"]}',
            f'- Attachment references: {plan["summary"]["attachment_references"]}',
            "",
            "## Review Items",
            "",
        ]
    )
    if plan["review_items"]:
        lines.extend(f"- {item}" for item in plan["review_items"])
    else:
        lines.append("- None. Every row, page, stable ID, destination, attachment, and local link is accounted for.")
    lines.extend(
        [
            "",
            "## Gate",
            "",
            (
                "Library writes are permitted through the staged importer."
                if plan["preflight_status"] == "PASS"
                else "Library writes are blocked until every review item is resolved."
            ),
            "",
        ]
    )
    write_text_atomic(PREFLIGHT_REPORT_PATH, "\n".join(lines))


def command_preflight() -> None:
    append_log("preflight_started")
    plan = build_import_plan()
    write_json_atomic(PLAN_PATH, plan)
    write_preflight_report(plan)
    append_log("preflight_completed", status=plan["preflight_status"], summary=plan["summary"])
    print(
        f'IMPORT PREFLIGHT: {plan["preflight_status"]} '
        f'({plan["summary"]["mapped_items"]}/{plan["summary"]["records"]} items)'
    )
    if plan["preflight_status"] != "PASS":
        raise ImportSafetyError("Preflight failed; no library items were written")


def load_or_create_import_state(plan: dict[str, Any]) -> dict[str, Any]:
    if IMPORT_CHECKPOINT_PATH.exists():
        state = load_json(IMPORT_CHECKPOINT_PATH)
        if state.get("importer_version") != IMPORTER_VERSION:
            raise ImportSafetyError("Existing import checkpoint uses a different importer version")
        return state
    state = {
        "schema_version": 1,
        "importer_version": IMPORTER_VERSION,
        "started_at_utc": utc_now(),
        "updated_at_utc": utc_now(),
        "status": "in_progress",
        "total_items": plan["summary"]["mapped_items"],
        "collections": {name: "not_started" for name in COLLECTIONS},
        "items": {},
        "conflicts": [],
    }
    write_json_atomic(IMPORT_CHECKPOINT_PATH, state)
    return state


def yaml_value(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def plain_summary(body: str, limit: int = 240) -> str:
    for line in body.splitlines():
        text = line.strip()
        if not text or text.startswith(("!", "[", "#", "<")):
            continue
        text = re.sub(r"[*_`~]", "", text)
        text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
        text = re.sub(r"\s+", " ", text).strip()
        if text:
            return text[:limit]
    return ""


def render_item_markdown(
    item: dict[str, Any], page: dict[str, Any], imported_at: str
) -> str:
    attachment_by_member = {
        attachment["source_member"]: attachment for attachment in item["attachments"]
    }
    replacement_by_target: dict[str, str] = {}
    for link in item["link_targets"]:
        if link["kind"] == "attachment":
            replacement_by_target[link["raw_target"]] = f'./{link["output_path"]}'
        else:
            replacement_by_target[link["raw_target"]] = (
                f'../{link["target_folder"]}/item.md'
            )

    body = rewrite_markdown_links(page["body"], replacement_by_target)
    category = item["notion_properties"].get("Category", "").strip() or None
    added = (
        item["notion_properties"].get("Added On", "").strip()
        or item["notion_properties"].get("Added on", "").strip()
        or None
    )
    preview = next(
        (
            f'./{attachment["output_path"]}'
            for attachment in item["attachments"]
            if attachment["extension"] in IMAGE_EXTENSIONS
        ),
        None,
    )
    source = {
        "package": item["package_relative_path"],
        "package_sha256": item["package_sha256"],
        "archive_member": item["page_member"],
        "page_sha256": item["page_sha256"],
        "notion_page_id": item["notion_page_id"],
        "csv_member": item["csv_member"],
        "csv_row_number": item["csv_row_number"],
    }
    lines = [
        "---",
        f'id: {yaml_value(item["id"])}',
        f'title: {yaml_value(item["title"])}',
        f'collection: {yaml_value(item["collection"].casefold())}',
        f"type: {yaml_value(category)}",
        "status: null",
        f"added: {yaml_value(added)}",
        'source: "notion"',
        "cover: null",
        f"preview: {yaml_value(preview)}",
        f"original_source: {yaml_value(source)}",
        f'notion_properties: {yaml_value(item["notion_properties"])}',
        f'importer_version: {yaml_value(IMPORTER_VERSION)}',
        f'imported_at_utc: {yaml_value(imported_at)}',
        "---",
        "",
        f'# {item["title"]}',
        "",
        "## Overview",
        "",
        body,
        "",
        "## My Thoughts",
        "",
        "## Notes",
        "",
        "## Relationships",
        "",
    ]
    if item["relations"]:
        relation_targets = {
            link["source_member"]: link["target_folder"]
            for link in item["link_targets"]
            if link["kind"] == "relationship"
        }
        for member in item["relations"]:
            label = re.sub(
                r" [0-9a-f]{32}\.md$", "", PurePosixPath(member).name, flags=re.I
            )
            lines.append(f'- [{label}](../{relation_targets[member]}/item.md)')
    lines.extend(["", "## Media", ""])
    for attachment in item["attachments"]:
        lines.append(
            f'- [{attachment["filename"]}](./{attachment["output_path"]}) '
            f'(`{attachment["sha256"]}`)'
        )
    lines.extend(["", "## Metadata", ""])
    for key, value in item["notion_properties"].items():
        lines.append(f"- **{key}:** {value}")
    lines.extend(
        [
            "",
            "## Import Information",
            "",
            f'- Stable ID: `{item["id"]}`',
            f'- Notion page ID: `{item["notion_page_id"]}`',
            f'- Original page: [`source/original.md`](./source/original.md)',
            f'- Exact CSV row: [`source/notion-row.json`](./source/notion-row.json)',
            f'- Provenance: [`source/provenance.json`](./source/provenance.json)',
            f'- Imported at (UTC): {imported_at}',
            "",
        ]
    )
    return "\n".join(lines)


def write_verified_file(path: Path, data: bytes) -> str:
    expected_hash = sha256_bytes(data)
    if path.exists():
        if not path.is_file() or sha256_file(path) != expected_hash:
            raise ImportSafetyError(f"Staging conflict was not overwritten: {path}")
        return expected_hash
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp")
    if temporary.exists():
        raise ImportSafetyError(f"Interrupted temporary file requires review: {temporary}")
    temporary.write_bytes(data)
    if sha256_file(temporary) != expected_hash:
        temporary.unlink(missing_ok=True)
        raise ImportSafetyError(f"Staged file failed immediate verification: {path}")
    os.replace(temporary, path)
    return expected_hash


def validate_imported_folder(path: Path, item_id: str) -> tuple[bool, str | None]:
    manifest_path = path / "_import.json"
    if not manifest_path.is_file():
        return False, "missing _import.json"
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        return False, f"invalid _import.json: {error}"
    if manifest.get("status") != "complete" or manifest.get("item_id") != item_id:
        return False, "import identity/status mismatch"
    for output in manifest.get("outputs", []):
        output_path = path / Path(output["path"])
        if not output_path.is_file():
            return False, f'missing {output["path"]}'
        if output_path.stat().st_size != output["byte_size"]:
            return False, f'size mismatch {output["path"]}'
        if sha256_file(output_path) != output["sha256"]:
            return False, f'hash mismatch {output["path"]}'
    return True, None


def import_one_item(
    item: dict[str, Any], archive: zipfile.ZipFile, imported_at: str
) -> tuple[str, dict[str, Any]]:
    destination = LIBRARY_ROOT / item["collection"] / item["folder_name"]
    if destination.exists():
        valid, reason = validate_imported_folder(destination, item["id"])
        if valid:
            return "skipped_verified", {"destination": str(destination)}
        return "conflict", {"destination": str(destination), "reason": reason}

    stage = STAGING_ROOT / item["collection"] / item["id"]
    stage.mkdir(parents=True, exist_ok=True)
    raw = archive.read(item["page_member"])
    property_columns = [key for key in item["notion_properties"] if key not in {"Book", "Show"}]
    page = parse_page_markdown(raw, item["page_member"], property_columns)
    if page["page_sha256"] != item["page_sha256"]:
        raise ImportSafetyError(f'Page hash changed for {item["id"]}')

    row_evidence = {
        "csv_member": item["csv_member"],
        "csv_row_number": item["csv_row_number"],
        "values": item["notion_properties"],
    }
    provenance = {
        "item_id": item["id"],
        "notion_page_id": item["notion_page_id"],
        "backup_collection": item["collection"],
        "backup_package": item["package_relative_path"],
        "package_sha256": item["package_sha256"],
        "page_member": item["page_member"],
        "page_sha256": item["page_sha256"],
        "csv_member": item["csv_member"],
        "csv_row_number": item["csv_row_number"],
        "page_properties": item["page_properties"],
        "attachments": item["attachments"],
    }
    item_markdown = render_item_markdown(item, page, imported_at).encode("utf-8")
    files: list[tuple[str, bytes]] = [
        ("item.md", item_markdown),
        ("source/original.md", raw),
        (
            "source/notion-row.json",
            (json.dumps(row_evidence, ensure_ascii=False, indent=2) + "\n").encode("utf-8"),
        ),
        (
            "source/provenance.json",
            (json.dumps(provenance, ensure_ascii=False, indent=2) + "\n").encode("utf-8"),
        ),
    ]
    for attachment in item["attachments"]:
        data = archive.read(attachment["source_member"])
        if len(data) != attachment["byte_size"] or sha256_bytes(data) != attachment["sha256"]:
            raise ImportSafetyError(f'Attachment changed: {attachment["source_member"]}')
        files.append((attachment["output_path"], data))

    outputs: list[dict[str, Any]] = []
    for relative, data in files:
        output_hash = write_verified_file(stage / Path(relative), data)
        outputs.append(
            {"path": relative, "byte_size": len(data), "sha256": output_hash}
        )
    output_manifest = {
        "schema_version": 1,
        "status": "complete",
        "item_id": item["id"],
        "notion_page_id": item["notion_page_id"],
        "destination": f'{item["collection"]}/{item["folder_name"]}',
        "importer_version": IMPORTER_VERSION,
        "imported_at_utc": imported_at,
        "outputs": outputs,
    }
    write_verified_file(
        stage / "_import.json",
        (json.dumps(output_manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8"),
    )
    valid, reason = validate_imported_folder(stage, item["id"])
    if not valid:
        raise ImportSafetyError(f"Staged item failed verification: {item['id']}: {reason}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    os.replace(stage, destination)
    valid, reason = validate_imported_folder(destination, item["id"])
    if not valid:
        raise ImportSafetyError(f"Promoted item failed verification: {item['id']}: {reason}")
    return "imported", {
        "destination": str(destination),
        "output_files": len(outputs) + 1,
        "attachment_files": len(item["attachments"]),
    }


def write_import_report(plan: dict[str, Any], state: dict[str, Any]) -> None:
    statuses = Counter(record.get("status") for record in state["items"].values())
    completed = statuses["imported"] + statuses["skipped_verified"]
    conflicts = statuses["conflict"]
    pending = plan["summary"]["mapped_items"] - completed - conflicts
    result = "PASS" if completed == plan["summary"]["mapped_items"] and conflicts == 0 else "IN PROGRESS"
    lines = [
        "# Import Report",
        "",
        f"IMPORT RESULT: {result}",
        "",
        f'Updated at (UTC): {state["updated_at_utc"]}',
        "",
        "| Metric | Count |",
        "| --- | ---: |",
        f'| Records found | {plan["summary"]["records"]} |',
        f'| Items accounted as imported/verified | {completed} |',
        f'| Newly imported this project | {statuses["imported"]} |',
        f'| Existing verified items skipped | {statuses["skipped_verified"]} |',
        f"| Conflicts | {conflicts} |",
        f"| Pending | {pending} |",
        f'| Imported attachment files | {sum(record.get("attachment_files", 0) for record in state["items"].values())} |',
        "",
        "## Collection Status",
        "",
    ]
    for collection in COLLECTIONS:
        lines.append(f'- {collection}: {state["collections"][collection]}')
    lines.extend(["", "## Conflicts and Review", ""])
    if state["conflicts"]:
        lines.extend(
            f'- `{conflict["id"]}`: {conflict["reason"]}'
            for conflict in state["conflicts"]
        )
    else:
        lines.append("- None recorded.")
    lines.append("")
    write_text_atomic(IMPORT_REPORT_PATH, "\n".join(lines))
    if state["conflicts"]:
        review_lines = [
            "# Needs Review",
            "",
            "The importer did not overwrite these conflicts:",
            "",
            *(
                f'- `{conflict["id"]}` at `{conflict["destination"]}`: {conflict["reason"]}'
                for conflict in state["conflicts"]
            ),
            "",
        ]
        write_text_atomic(NEEDS_REVIEW_PATH, "\n".join(review_lines))


def command_import(collection: str) -> None:
    plan = load_json(PLAN_PATH)
    if plan.get("preflight_status") != "PASS":
        raise ImportSafetyError("Import plan does not have a PASS preflight")
    require_verified_inputs()
    state = load_or_create_import_state(plan)
    selected = [item for item in plan["items"] if item["collection"] == collection]
    state["collections"][collection] = "in_progress"
    state["updated_at_utc"] = utc_now()
    write_json_atomic(IMPORT_CHECKPOINT_PATH, state)
    append_log("collection_import_started", collection=collection, items=len(selected))
    source = load_json(AUDIT_PATH)["canonical_sources"][collection]
    archive_path = package_path(collection, source["package_path"])
    if sha256_file(archive_path) != source["package_sha256"]:
        raise ImportSafetyError(f"Canonical {collection} package hash changed before import")
    with zipfile.ZipFile(archive_path) as archive:
        for item in selected:
            previous = state["items"].get(item["id"])
            if previous and previous.get("status") in {"imported", "skipped_verified"}:
                destination = LIBRARY_ROOT / item["collection"] / item["folder_name"]
                valid, reason = validate_imported_folder(destination, item["id"])
                if valid:
                    continue
                previous = {"status": "conflict", "reason": reason, "destination": str(destination)}
            try:
                status, details = import_one_item(item, archive, state["started_at_utc"])
            except (OSError, KeyError, ImportSafetyError) as error:
                status, details = "conflict", {
                    "destination": str(LIBRARY_ROOT / item["collection"] / item["folder_name"]),
                    "reason": str(error),
                }
            record = {
                "status": status,
                "collection": collection,
                "updated_at_utc": utc_now(),
                **details,
            }
            state["items"][item["id"]] = record
            state["conflicts"] = [
                conflict for conflict in state["conflicts"] if conflict["id"] != item["id"]
            ]
            if status == "conflict":
                state["conflicts"].append({"id": item["id"], **details})
            state["updated_at_utc"] = utc_now()
            write_json_atomic(IMPORT_CHECKPOINT_PATH, state)

    collection_statuses = [
        state["items"].get(item["id"], {}).get("status") for item in selected
    ]
    state["collections"][collection] = (
        "complete"
        if all(status in {"imported", "skipped_verified"} for status in collection_statuses)
        else "needs_review"
    )
    all_complete = all(state["collections"][name] == "complete" for name in COLLECTIONS)
    state["status"] = "complete" if all_complete and not state["conflicts"] else "in_progress"
    state["updated_at_utc"] = utc_now()
    write_json_atomic(IMPORT_CHECKPOINT_PATH, state)
    write_import_report(plan, state)
    append_log(
        "collection_import_completed",
        collection=collection,
        status=state["collections"][collection],
        conflicts=len(state["conflicts"]),
    )
    print(
        f'{collection} import: {state["collections"][collection]}, '
        f'{len(selected)} planned, {len(state["conflicts"])} total conflicts'
    )
    if state["collections"][collection] != "complete":
        raise ImportSafetyError(f"{collection} import requires review")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("preflight", help="Map and verify without writing library items")
    import_parser = subparsers.add_parser("import", help="Import one verified collection")
    import_parser.add_argument("collection", choices=COLLECTIONS)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        if args.command == "preflight":
            command_preflight()
        else:
            command_import(args.collection)
        return 0
    except (OSError, KeyError, csv.Error, zipfile.BadZipFile, ImportSafetyError) as error:
        append_log("operation_failed", command=args.command, error=str(error))
        print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
