# Local UI

The React/TypeScript application reads its catalog and media from the external
`READ_WATCH_DATA_ROOT`. When unset, it uses the repository sibling
`Read and Watch - Local Data`; the catalog is therefore expected at
`App/library/catalog.json` beneath that root. The same root owns My Thoughts,
Notes, and the Readest runtime. Personal data is never copied into source.

Copy `.env.example` to an untracked `.env` only when overriding the sibling
default.

```powershell
npm run dev
npm run build
npm run start
```
