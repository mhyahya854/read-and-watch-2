# Configuration

The committed repository contains configuration guidance only. Machine-specific
`source-paths.json` lives under the external data root at
`App/config/source-paths.json` and is never committed.

All code resolves private paths from `READ_WATCH_DATA_ROOT`. If the variable is
unset, the default is the repository sibling `Read and Watch - Local Data`.
