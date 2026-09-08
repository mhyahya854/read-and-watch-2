"""Resolve all private data through one external root."""

from __future__ import annotations

import os
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
REPOSITORY_ROOT = PROJECT_ROOT.parent.resolve()
DEFAULT_DATA_ROOT = REPOSITORY_ROOT.parent / "Read and Watch - Local Data"
DATA_ROOT = Path(os.environ.get("READ_WATCH_DATA_ROOT", DEFAULT_DATA_ROOT)).expanduser().resolve()

if DATA_ROOT == REPOSITORY_ROOT or REPOSITORY_ROOT in DATA_ROOT.parents:
    raise RuntimeError("READ_WATCH_DATA_ROOT must be outside the Git repository")

DATA_APP_ROOT = DATA_ROOT / "App"
