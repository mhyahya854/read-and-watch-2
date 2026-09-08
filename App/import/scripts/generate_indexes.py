#!/usr/bin/env python3
"""Generate compact master indexes and a UI catalog from verified library items."""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from typing import Any

import import_library
import verify_library
from project_paths import DATA_APP_ROOT


LIBRARY_ROOT = DATA_APP_ROOT / "library"
PLAN_PATH = DATA_APP_ROOT / "import" / "manifests" / "import-plan.json"
IMPORT_STATE_PATH = DATA_APP_ROOT / "import" / "checkpoints" / "import-state.json"
VERIFICATION_PATH = (
    DATA_APP_ROOT / "import" / "checkpoints" / "library-verification.json"
)
CATALOG_PATH = LIBRARY_ROOT / "catalog.json"
USER_ADDED_PATH = DATA_APP_ROOT / "import" / "manifests" / "user-added-items.json"
COLLECTIONS = ("Read", "Watch")


class IndexError(RuntimeError):
    pass


def load_json(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise IndexError(f"Cannot read valid JSON {path}: {error}") from error


def write_if_changed(path: Path, data: bytes) -> bool:
    if path.exists() and path.read_bytes() == data:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp")
    temporary.write_bytes(data)
    os.replace(temporary, path)
    return True


def section(markdown: str, name: str) -> str:
    match = re.search(
        rf"(?ms)^## {re.escape(name)}\s*$\n(.*?)(?=^## |\Z)", markdown
    )
    return match.group(1).strip() if match else ""


def plain_overview(markdown: str) -> str:
    overview = section(markdown, "Overview")
    return import_library.plain_summary(overview)


def load_user_added_items() -> list[dict[str, Any]]:
    if not USER_ADDED_PATH.is_file():
        return []
    manifest = load_json(USER_ADDED_PATH)
    if manifest.get("schema_version") != 1 or not isinstance(manifest.get("items"), list):
        raise IndexError("Unsupported user-added item manifest")
    return manifest["items"]


def build_catalog_item(
    item: dict[str, Any], member_to_id: dict[str, str]
) -> dict[str, Any]:
    folder = LIBRARY_ROOT / item["collection"] / item["folder_name"]
    item_path = folder / "item.md"
    if not item_path.is_file():
        raise IndexError(f"Missing verified item.md: {item_path}")
    markdown = item_path.read_text(encoding="utf-8")
    front = verify_library.parse_front_matter(markdown)
    type_value = front.get("type") or ("Book" if item["collection"] == "Read" else "")
    preview = front.get("preview")
    preview_path = (
        f'{item["collection"]}/{item["folder_name"]}/{preview.removeprefix("./")}'
        if isinstance(preview, str) and preview
        else None
    )
    if preview_path and not (LIBRARY_ROOT / Path(preview_path)).is_file():
        raise IndexError(f"Broken catalog preview path: {preview_path}")
    media = [
        {
            "name": attachment["filename"],
            "path": f'{item["collection"]}/{item["folder_name"]}/{attachment["output_path"]}',
            "extension": attachment["extension"],
        }
        for attachment in item["attachments"]
    ]
    return {
        "id": item["id"],
        "title": item["title"],
        "collection": item["collection"].casefold(),
        "itemPath": f'{item["collection"]}/{item["folder_name"]}/item.md',
        "type": type_value,
        "status": front.get("status") or "",
        "added": front.get("added") or "",
        "tags": [],
        "summary": plain_overview(markdown),
        "cover": front.get("cover"),
        "preview": preview_path,
        "notionProperties": item["notion_properties"],
        "media": media,
        "relationshipIds": [
            member_to_id[member] for member in item["relations"] if member in member_to_id
        ],
    }


def index_text(collection: str, items: list[dict[str, Any]]) -> str:
    lines = [
        f"# {collection}",
        "",
        f"Items: {len(items)}",
        "",
        "This is a compact navigation index. Open an item's `item.md` for full metadata, notes, media, and provenance.",
        "",
    ]
    for item in items:
        path = f'./{collection}/{item["folder_name"]}/item.md'
        catalog = item["catalog"]
        lines.extend(
            [
                f'## {item["title"]}',
                f'ID: {item["id"]}',
                f"Path: {path}",
                f'Type: {catalog["type"]}',
                f'Status: {catalog["status"]}',
                f'Added: {catalog["added"]}',
                f'Tags: {", ".join(catalog["tags"])}',
                f'Summary: {catalog["summary"]}',
                "",
            ]
        )
    return "\n".join(lines)


def main() -> int:
    try:
        plan = load_json(PLAN_PATH)
        import_state = load_json(IMPORT_STATE_PATH)
        verification = load_json(VERIFICATION_PATH)
        if plan.get("preflight_status") != "PASS":
            raise IndexError("Import preflight is not PASS")
        if import_state.get("status") != "complete":
            raise IndexError("Import checkpoint is not complete")
        if verification.get("status") != "PASS":
            raise IndexError("Full library verification is not PASS")

        user_added_items = load_user_added_items()
        all_items = [*plan["items"], *user_added_items]
        ids = [item["id"] for item in all_items]
        if len(ids) != len(set(ids)):
            raise IndexError("Imported and user-added item IDs conflict")
        member_to_id = {item["page_member"]: item["id"] for item in plan["items"]}
        catalog_items = [
            build_catalog_item(item, member_to_id) for item in all_items
        ]
        catalog_by_id = {item["id"]: item for item in catalog_items}
        changed: list[str] = []
        for collection in COLLECTIONS:
            selected: list[dict[str, Any]] = []
            for item in all_items:
                if item["collection"] == collection:
                    selected.append({**item, "catalog": catalog_by_id[item["id"]]})
            output = LIBRARY_ROOT / f"{collection.upper()}.md"
            if write_if_changed(output, index_text(collection, selected).encode("utf-8")):
                changed.append(output.name)

        catalog = {
            "schemaVersion": 1,
            "generatedFromImportUtc": import_state["started_at_utc"],
            "counts": {
                "read": sum(item["collection"] == "read" for item in catalog_items),
                "watch": sum(item["collection"] == "watch" for item in catalog_items),
                "total": len(catalog_items),
            },
            "items": catalog_items,
        }
        if write_if_changed(
            CATALOG_PATH,
            (json.dumps(catalog, ensure_ascii=False, indent=2) + "\n").encode("utf-8"),
        ):
            changed.append(CATALOG_PATH.name)
        print(
            f'Indexes: Read={catalog["counts"]["read"]}, '
            f'Watch={catalog["counts"]["watch"]}, changed={len(changed)}'
        )
        return 0
    except (OSError, UnicodeDecodeError, KeyError, IndexError, verify_library.VerificationError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
