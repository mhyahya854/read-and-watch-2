# Our Readest Changes

Baseline: upstream `main` at
`6df90139dc7b72246572ab33b12d485b281ca6e6`.

## Task 3

- Added `UPSTREAM.md` to record the exact upstream state and local branch.
- Added this change ledger.
- No Readest UI or runtime source files were modified.
- Built the pinned Windows/Tauri application in release portable mode; the
  verified executable is copied to the parent project's
  `runtime/readest/bin/readest.exe`.
- The parent application integrates through Readest's existing command-line
  desktop `Open with` flow. The stable-ID resolver and launch bridge remain
  outside this fork under the parent project's `app/` directory.

Only integration-related changes will be recorded here. Reader typography,
toolbar, navigation, settings, colors, spacing, panels, icons, and reading
controls remain upstream-first during Task 3.

Build-generated permission-manifest and submodule working-tree changes were
verified as content-identical to `HEAD` and removed from the integration diff.
