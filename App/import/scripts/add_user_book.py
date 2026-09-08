#!/usr/bin/env python3
"""Copy manifest-declared personal books into the library without overwrites."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from project_paths import DATA_APP_ROOT, REPOSITORY_ROOT

LIBRARY_ROOT = DATA_APP_ROOT / "library"
STAGING_ROOT = DATA_APP_ROOT / "import" / "staging" / "user-added"
MANIFEST_PATH = DATA_APP_ROOT / "import" / "manifests" / "user-added-items.json"
IMPORT_PLAN_PATH = DATA_APP_ROOT / "import" / "manifests" / "import-plan.json"
LOG_PATH = DATA_APP_ROOT / "logs" / "user-added-library.jsonl"
ITEM_ID_RE = re.compile(r"^read-[0-9a-f]{32}$")
SUPPORTED_EXTENSIONS = {".epub", ".pdf", ".mobi", ".azw", ".azw3", ".fb2", ".fbz", ".cbz", ".txt", ".md", ".markdown"}


class UserBookError(RuntimeError):
    pass


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_manifest() -> dict[str, Any]:
    try:
        value = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise UserBookError(f"Cannot read user-added manifest: {error}") from error
    if value.get("schema_version") != 1 or not isinstance(value.get("items"), list):
        raise UserBookError("Unsupported user-added manifest")
    return value


def ensure_relative(value: str, label: str) -> Path:
    path = Path(value)
    if path.is_absolute() or not value or ".." in path.parts:
        raise UserBookError(f"Unsafe {label}: {value}")
    return path


def validate_item(item: dict[str, Any]) -> None:
    if not ITEM_ID_RE.fullmatch(item.get("id", "")):
        raise UserBookError("Invalid stable Read item ID")
    if item.get("collection") != "Read":
        raise UserBookError("User-added book must be a Read item")
    if item.get("user_added") is not True or item.get("imported_from_notion") is not False:
        raise UserBookError("User-added/Notion provenance flags are invalid")
    if item.get("source_type") != "personal_book":
        raise UserBookError("Source type must be personal_book")
    ensure_relative(item["folder_name"], "folder name")
    attachments = item.get("attachments", [])
    if len(attachments) != 1:
        raise UserBookError("Exactly one personal book attachment is required")
    attachment = attachments[0]
    output = ensure_relative(attachment["output_path"], "attachment path")
    if output.parts[0] != "media" or attachment["extension"].casefold() not in SUPPORTED_EXTENSIONS:
        raise UserBookError("Attachment is not in a supported media location/format")
    if Path(item["source"]["original_path"]).resolve().is_relative_to(REPOSITORY_ROOT):
        raise UserBookError("The original personal book must remain outside the Git repository")


def json_bytes(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def item_markdown(item: dict[str, Any]) -> bytes:
    source = item["source"]
    attachment = item["attachments"][0]
    lines = [
        "---",
        f'id: {json.dumps(item["id"])}',
        f'title: {json.dumps(item["title"])}',
        'collection: "read"',
        f'type: {json.dumps(item["type"])}',
        f'status: {json.dumps(item["status"])}',
        f'added: {json.dumps(item["added"])}',
        'source: "personal_book"',
        "cover: null",
        "preview: null",
        f'author: {json.dumps(item["author"])}',
        f'format: {json.dumps(item["format"])}',
        f'pages: {item["pages"]}',
        "user_added: true",
        "imported_from_notion: false",
        'source_type: "personal_book"',
        "notion_properties: {}",
        "---",
        "",
        f'# {item["title"]}',
        "",
        "## Overview",
        "",
        item["summary"],
        "",
        "## My Thoughts",
        "",
        "## Notes",
        "",
        "## Relationships",
        "",
        "## Media",
        "",
        f'- [{attachment["filename"]}](./{attachment["output_path"]}) (`{attachment["sha256"]}`)',
        "",
        "## Metadata",
        "",
        f'- **Author:** {item["author"]}',
        f'- **Format:** {item["format"]}',
        f'- **Pages:** {item["pages"]}',
        f'- **Size:** {source["byte_size"]} bytes',
        "",
        "## Import Information",
        "",
        f'- Stable ID: `{item["id"]}`',
        "- User added: `true`",
        "- Imported from Notion: `false`",
        "- Source type: `personal_book`",
        f'- Original source path: `{source["original_path"]}`',
        f'- Original SHA-256: `{source["sha256"]}`',
        "- Provenance: [`source/provenance.json`](./source/provenance.json)",
        f'- Added at (UTC): {item["added_at_utc"]}',
        "",
    ]
    return "\n".join(lines).encode("utf-8")


def provenance(item: dict[str, Any]) -> dict[str, Any]:
    attachment = item["attachments"][0]
    return {
        "item_id": item["id"],
        "user_added": True,
        "imported_from_notion": False,
        "source_type": "personal_book",
        "added_at_utc": item["added_at_utc"],
        "original_source": item["source"],
        "library_copy": attachment,
    }


def write_bytes_restartable(path: Path, data: bytes) -> None:
    expected = hashlib.sha256(data).hexdigest()
    if path.exists():
        if not path.is_file() or sha256_file(path) != expected:
            raise UserBookError(f"Existing staged file conflicts: {path}")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp")
    if temporary.exists():
        if not temporary.is_file() or sha256_file(temporary) != expected:
            raise UserBookError(f"Interrupted temporary file conflicts: {temporary}")
    else:
        temporary.write_bytes(data)
    os.replace(temporary, path)


def copy_book_restartable(source: Path, destination: Path, expected_hash: str) -> None:
    if destination.exists():
        if not destination.is_file() or sha256_file(destination) != expected_hash:
            raise UserBookError(f"Existing staged book conflicts: {destination}")
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(f".{destination.name}.tmp")
    if temporary.exists():
        if not temporary.is_file() or sha256_file(temporary) != expected_hash:
            raise UserBookError(f"Interrupted temporary book conflicts: {temporary}")
    else:
        with source.open("rb") as source_handle, temporary.open("xb") as target_handle:
            shutil.copyfileobj(source_handle, target_handle, length=1024 * 1024)
    if sha256_file(temporary) != expected_hash:
        raise UserBookError("Copied book hash mismatch; staged file retained for review")
    os.replace(temporary, destination)


def expected_outputs(item: dict[str, Any]) -> dict[str, dict[str, Any]]:
    markdown = item_markdown(item)
    provenance_data = json_bytes(provenance(item))
    attachment = item["attachments"][0]
    return {
        "item.md": {"byte_size": len(markdown), "sha256": hashlib.sha256(markdown).hexdigest()},
        "source/provenance.json": {"byte_size": len(provenance_data), "sha256": hashlib.sha256(provenance_data).hexdigest()},
        attachment["output_path"]: {"byte_size": attachment["byte_size"], "sha256": attachment["sha256"]},
    }


def validate_folder(folder: Path, item: dict[str, Any]) -> None:
    manifest_path = folder / "_user_added.json"
    if not manifest_path.is_file():
        raise UserBookError(f"Missing completed item manifest: {manifest_path}")
    record = json.loads(manifest_path.read_text(encoding="utf-8"))
    if record.get("status") != "complete" or record.get("item_id") != item["id"]:
        raise UserBookError("Completed item manifest identity/status mismatch")
    outputs = expected_outputs(item)
    if record.get("outputs") != outputs:
        raise UserBookError("Completed item manifest output set mismatch")
    actual = {path.relative_to(folder).as_posix() for path in folder.rglob("*") if path.is_file()}
    expected = set(outputs) | {"_user_added.json"}
    if actual != expected:
        raise UserBookError(f"User-added item file set mismatch: {sorted(actual ^ expected)}")
    for relative, expected_file in outputs.items():
        path = folder / relative
        if path.stat().st_size != expected_file["byte_size"] or sha256_file(path) != expected_file["sha256"]:
            raise UserBookError(f"User-added output mismatch: {relative}")


def append_log(event: str, item: dict[str, Any], destination: Path) -> None:
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with LOG_PATH.open("a", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps({"timestamp": utc_now(), "event": event, "item_id": item["id"], "source": item["source"]["original_path"], "destination": str(destination)}, ensure_ascii=False) + "\n")


def import_item(item: dict[str, Any], verify_only: bool) -> str:
    validate_item(item)
    source = Path(item["source"]["original_path"])
    if not source.is_file():
        raise UserBookError(f"Original source is missing: {source}")
    source_stat = source.stat()
    if source_stat.st_size != item["source"]["byte_size"] or sha256_file(source) != item["source"]["sha256"]:
        raise UserBookError("Original source size/hash changed")
    destination = LIBRARY_ROOT / item["collection"] / item["folder_name"]
    if destination.exists():
        validate_folder(destination, item)
        if not verify_only:
            append_log("verified_existing", item, destination)
        return "verified_existing"
    if verify_only:
        raise UserBookError(f"User-added item is not imported: {item['id']}")
    stage = STAGING_ROOT / item["id"]
    stage.mkdir(parents=True, exist_ok=True)
    write_bytes_restartable(stage / "item.md", item_markdown(item))
    write_bytes_restartable(stage / "source" / "provenance.json", json_bytes(provenance(item)))
    attachment = item["attachments"][0]
    copy_book_restartable(source, stage / attachment["output_path"], attachment["sha256"])
    outputs = expected_outputs(item)
    write_bytes_restartable(stage / "_user_added.json", json_bytes({"schema_version": 1, "status": "complete", "item_id": item["id"], "outputs": outputs}))
    validate_folder(stage, item)
    destination.parent.mkdir(parents=True, exist_ok=True)
    os.replace(stage, destination)
    validate_folder(destination, item)
    append_log("imported", item, destination)
    return "imported"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify-only", action="store_true")
    args = parser.parse_args()
    try:
        manifest = load_manifest()
        import_plan = json.loads(IMPORT_PLAN_PATH.read_text(encoding="utf-8"))
        imported_ids = {item["id"] for item in import_plan["items"]}
        seen: set[str] = set()
        for item in manifest["items"]:
            if item["id"] in seen:
                raise UserBookError(f"Duplicate stable ID: {item['id']}")
            if item["id"] in imported_ids:
                raise UserBookError(f"Stable ID conflicts with a Notion item: {item['id']}")
            seen.add(item["id"])
            result = import_item(item, args.verify_only)
            print(f"{item['id']}: {result}")
        return 0
    except (OSError, KeyError, json.JSONDecodeError, UserBookError) as error:
        print(f"ERROR: {error}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
