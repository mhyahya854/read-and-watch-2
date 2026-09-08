#!/usr/bin/env python3
"""Fail when Git tracks private data or recreatable project output."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


FORBIDDEN_PREFIXES = (
    "Read/",
    "Watch/",
    "App/backup/",
    "App/library/",
    "App/user-data/",
    "App/runtime/",
    "App/logs/",
    "App/reports/",
    "App/graphify-out/",
    "App/tmp/",
    "App/import/manifests/",
    "App/import/checkpoints/",
    "App/import/staging/",
    "App/app/node_modules/",
    "App/app/dist/",
    "App/app/.vite/",
    "App/app/.vinext/",
    "App/app/.wrangler/",
    "App/app/coverage/",
    "App/app/graphify-out/",
    "App/forks/readest/node_modules/",
    "App/forks/readest/target/",
)
FORBIDDEN_EXACT = {
    ".gitattributes",
    "App/config/source-paths.json",
    "App/app/tsconfig.tsbuildinfo",
}
PRIVATE_BINARY_SUFFIXES = {".db", ".epub", ".exe", ".pdf", ".sqlite", ".zip"}
PRIVATE_MARKERS = (
    "c:\\users\\",
    "c:/users/",
    "cooking with marshmello",
    "947441ba60bd602ec2da860839c7d143",
)


def path_violations(paths: list[str]) -> list[tuple[str, str]]:
    violations: list[tuple[str, str]] = []
    for path in paths:
        normalized = path.replace("\\", "/")
        lower = normalized.casefold()
        if normalized in FORBIDDEN_EXACT or any(
            lower.startswith(prefix.casefold()) for prefix in FORBIDDEN_PREFIXES
        ):
            violations.append((normalized, "forbidden tracked path"))
            continue
        if "/.git/" in f"/{lower}/" or lower.endswith("/.git"):
            violations.append((normalized, "nested Git metadata"))
            continue
        if lower.endswith(".bundle") or lower.endswith(".pyc"):
            violations.append((normalized, "recovery/generated file"))
            continue
        suffix = Path(normalized).suffix.casefold()
        if suffix in PRIVATE_BINARY_SUFFIXES and not lower.startswith(
            "app/forks/readest/"
        ):
            violations.append((normalized, "private/archive binary outside vendored source"))
    return violations


def content_violations(repository_root: Path, paths: list[str]) -> list[tuple[str, str]]:
    violations: list[tuple[str, str]] = []
    for path in paths:
        normalized = path.replace("\\", "/")
        if normalized == "App/scripts/check_repository_hygiene.py":
            continue
        if normalized.casefold().startswith("app/forks/readest/"):
            continue
        file = repository_root / Path(normalized)
        try:
            if not file.is_file() or file.stat().st_size > 2_000_000:
                continue
            text = file.read_text(encoding="utf-8").casefold()
        except (OSError, UnicodeDecodeError):
            continue
        if any(marker in text for marker in PRIVATE_MARKERS):
            violations.append((normalized, "private or machine-specific content marker"))
    return violations


def tracked_paths(repository_root: Path) -> list[str]:
    output = subprocess.check_output(
        ["git", "ls-files", "-z"], cwd=repository_root
    ).decode("utf-8")
    return [path for path in output.split("\0") if path]


def main() -> int:
    repository_root = Path(__file__).resolve().parents[2]
    paths = tracked_paths(repository_root)
    violations = path_violations(paths) + content_violations(repository_root, paths)
    if violations:
        print("Repository hygiene: FAIL")
        for path, category in sorted(set(violations)):
            print(f"- {path}: {category}")
        return 1
    print(f"Repository hygiene: PASS ({len(paths)} tracked paths)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
