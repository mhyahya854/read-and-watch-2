#!/usr/bin/env python3
"""Validate the small durable master-plan/run-state contract."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


VALID_STATUSES = {"NOT_STARTED", "IN_PROGRESS", "BLOCKED", "COMPLETE", "SUPERSEDED"}
EXPECTED_PHASES = [f"PHASE-{number:02d}" for number in range(21)]
ROOT = Path(__file__).resolve().parents[1]


def fail(errors: list[str], message: str) -> None:
    errors.append(message)


def main() -> int:
    errors: list[str] = []
    master = (ROOT / "docs/project/MASTER_PLAN.md").read_text(encoding="utf-8")
    run_state = json.loads((ROOT / "docs/project/RUN_STATE.json").read_text(encoding="utf-8"))
    phase_index = json.loads((ROOT / "docs/project/PHASE_INDEX.json").read_text(encoding="utf-8"))

    headings = list(re.finditer(r"^## (PHASE-\d{2}) - (.+)$", master, re.MULTILINE))
    phase_ids = [match.group(1) for match in headings]
    if phase_ids != EXPECTED_PHASES:
        fail(errors, f"master phases must be exactly {EXPECTED_PHASES}; got {phase_ids}")

    phases: dict[str, dict[str, object]] = {}
    all_work_ids: list[str] = []
    for index, heading in enumerate(headings):
        phase_id, title = heading.group(1), heading.group(2).strip()
        end = headings[index + 1].start() if index + 1 < len(headings) else len(master)
        block = master[heading.end() : end]
        status_match = re.search(r"^Status: `([A-Z_]+)`$", block, re.MULTILINE)
        if not status_match:
            fail(errors, f"{phase_id} has no valid status line")
            continue
        status = status_match.group(1)
        if status not in VALID_STATUSES:
            fail(errors, f"{phase_id} has invalid status {status}")
        work = re.findall(r"^- \[([ xX])\] (P\d{2}-[TG]\d{3})\b", block, re.MULTILINE)
        ids = [work_id for _, work_id in work]
        all_work_ids.extend(ids)
        if not any(work_id.startswith(phase_id.replace("PHASE-", "P") + "-T") for work_id in ids):
            fail(errors, f"{phase_id} has no task IDs")
        if not any(work_id.startswith(phase_id.replace("PHASE-", "P") + "-G") for work_id in ids):
            fail(errors, f"{phase_id} has no gate IDs")
        if status == "COMPLETE" and any(mark.casefold() != "x" for mark, _ in work):
            fail(errors, f"{phase_id} is COMPLETE but has unchecked work")
        first_incomplete = next((work_id for mark, work_id in work if mark == " "), None)
        phases[phase_id] = {"title": title, "status": status, "first_incomplete": first_incomplete}

    duplicates = sorted({work_id for work_id in all_work_ids if all_work_ids.count(work_id) > 1})
    if duplicates:
        fail(errors, f"duplicate task/gate IDs: {duplicates}")

    entries = phase_index.get("phases", [])
    index_ids = [entry.get("phase_id") for entry in entries]
    if index_ids != EXPECTED_PHASES:
        fail(errors, "PHASE_INDEX phase order or coverage differs from MASTER_PLAN")
    statuses = {entry.get("phase_id"): entry.get("status") for entry in entries}
    for entry in entries:
        phase_id = entry.get("phase_id")
        if phase_id not in phases:
            continue
        if entry.get("title") != phases[phase_id]["title"]:
            fail(errors, f"{phase_id} title mismatch")
        if entry.get("status") != phases[phase_id]["status"]:
            fail(errors, f"{phase_id} status mismatch")
        if entry.get("first_incomplete_task_id") != phases[phase_id]["first_incomplete"]:
            fail(errors, f"{phase_id} first incomplete task mismatch")
        for dependency in entry.get("dependencies", []):
            if dependency not in phases:
                fail(errors, f"{phase_id} has unknown dependency {dependency}")
            if entry.get("status") == "COMPLETE" and statuses.get(dependency) != "COMPLETE":
                fail(errors, f"{phase_id} is complete before dependency {dependency}")

    current_phase = run_state.get("current_phase_id")
    if current_phase not in phases:
        fail(errors, "RUN_STATE current phase does not exist")
    else:
        if run_state.get("current_phase_status") != phases[current_phase]["status"]:
            fail(errors, "RUN_STATE current phase status mismatch")
        if run_state.get("current_task_id") != phases[current_phase]["first_incomplete"]:
            fail(errors, "RUN_STATE current task is not the phase's first incomplete task")

    actionable = next(
        (
            entry["phase_id"]
            for entry in entries
            if entry.get("status") not in {"COMPLETE", "SUPERSEDED"}
            and all(statuses.get(dep) == "COMPLETE" for dep in entry.get("dependencies", []))
        ),
        None,
    )
    if not run_state.get("active_blockers") and current_phase != actionable:
        fail(errors, f"RUN_STATE current phase {current_phase} is not first actionable phase {actionable}")

    if errors:
        print("Project governance validation: FAIL")
        for error in errors:
            print(f"- {error}")
        return 1
    print(f"Project governance validation: PASS ({len(phases)} phases, {len(all_work_ids)} task/gate IDs)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
