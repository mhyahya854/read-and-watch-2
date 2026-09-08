# Project State

Current Phase: One-time repository separation complete
Current Task: STOP; wait for explicit product-development authorization

Completed:
- Exported all protected/personal/runtime/generated content to the sibling local-data root and verified 800 files / 4,663,682,393 bytes by relative path, size, and SHA-256.
- Preserved recoverable copies of every relocated source and both pre-cleanup Git repositories; both Git bundles verify.
- Replaced the nested Readest repository with a provenance-documented, hash-verified vendored source tree pinned at `294693348548361b0d5671f44d446ede5a83a892`; no nested `.git` directories remain.
- Added one `READ_WATCH_DATA_ROOT` boundary used by the UI, import tools, library, user data, and reader runtime. The default is the repository sibling `Read and Watch - Local Data`.
- Added repository-hygiene enforcement and tests. Parent app tests (28/28), lint, TypeScript, production build, npm audit, and library/backup verification pass.

Final verification:
- Public remote `mhyahya854/read-and-watch-2` contains one clean `master` commit, no LFS paths, and software/provenance files only.
- A short-path fresh clone passed parent install/tests/lint/types/build/audit and Readest install/vendor setup/lint/web build.
- External backup and library verification pass after relocation.

Exact next action: STOP and wait for explicit instruction. The original `read-and-watch` remote was left unchanged when the user selected the new `read-and-watch-2` destination.

Scope boundary: Stop after this migration. Task 4 annotations, Mermaid, AI, graphs, embeddings, and recommendations are not authorized by this operation.
