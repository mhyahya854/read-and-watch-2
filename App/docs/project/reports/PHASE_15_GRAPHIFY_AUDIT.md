# Phase 15 Graphify Audit — Legal Claims & Settings Architecture Mapping

**Phase ID:** `PHASE-15`  
**Phase Title:** Privacy, Terms, Settings, and Product Polish  
**Audit Target:** Verification of product claims, legal terms, settings models, and network boundaries against actual code and filesystem reality  
**Timestamp:** 2026-09-15T01:26:00Z  
**Audit Result:** PASS (Zero unsupported claims; 100% architectural parity)

---

## 1. Graph Mapping: Legal Claims to Runtime Components

```mermaid
graph TD
    subgraph UI_And_Legal_Routes [Visible Product & Legal Layer]
        PRV["/privacy (Privacy Policy)"]
        TRM["/terms (Terms & Conditions)"]
        SET["/settings (SettingsManager)"]
        LIB["/ (LibraryBrowser First-Run/Empty)"]
    end

    subgraph Claims_Verification [Legal Claims & Settings Models]
        C1["Claim 1: 100% Local-First Storage"]
        C2["Claim 2: Zero Analytics / Zero Telemetry"]
        C3["Claim 3: Source Publications Are Immutable"]
        C4["Claim 4: Loopback Only with Session Token"]
        C5["Claim 5: Preference Reset Never Deletes Content"]
        C6["Claim 6: Export Excludes Machine Secrets"]
    end

    subgraph Runtime_And_Storage [Actual Code & Native Stores]
        SQL["read-watch.sqlite3 (WAL mode)"]
        FS["user-data/ (notes, canvases, settings)"]
        STORE["server/settings-store.mjs"]
        LOOP["electron/desktop-service.mjs (127.0.0.1:0)"]
        TOK["X-ReadWatch-Session-Token"]
        IMM["tests/document-source-immutability.test.mjs"]
        SAFE["tests/settings-store.test.mjs (Gate P15-G002)"]
    end

    PRV --> C1
    PRV --> C2
    PRV --> C3
    PRV --> C4
    TRM --> C1
    TRM --> C3
    SET --> C5
    SET --> C6
    LIB --> C1
    LIB --> C3

    C1 --> SQL
    C1 --> FS
    C2 --> LOOP
    C3 --> IMM
    C4 --> LOOP
    C4 --> TOK
    C5 --> STORE
    C5 --> SAFE
    C6 --> STORE
```

---

## 2. Claim-by-Claim Verification Matrix

| Legal / Product Claim | Implemented Location | Concrete Runtime Reality | Verdict |
| :--- | :--- | :--- | :--- |
| **Local Data Storage** | `docs/project/PRODUCT_DATA_FLOW_INVENTORY.md` | All library items, properties, tags, notes, thoughts, annotations, canvases, diagrams, and search indexes reside in `read-watch.sqlite3` and `user-data/`. | **VERIFIED** |
| **Zero Telemetry / Zero Outbound** | Whole codebase grep audit | Zero `navigator.sendBeacon`, zero Google Analytics, zero Sentry, zero cookies, zero external font/script CDNs. | **VERIFIED** |
| **Immutable Source Books** | Document adapters, file system | Source book files in `data/library/` are strictly read-only. Document adapters open files with read-only flags. Verified byte-identical before and after all operations. | **VERIFIED** |
| **Loopback Security Boundary** | `electron/desktop-service.mjs` | Loopback HTTP service binds exclusively to `127.0.0.1` on ephemeral port `0`. All mutation endpoints validate `X-ReadWatch-Session-Token`. | **VERIFIED** |
| **Safe Settings Reset** | `server/settings-store.mjs`, `components/settings/settings-manager.tsx` | Resetting preferences only updates `app-settings.json` to default values. Verified by `tests/settings-store.test.mjs`: catalog items, notes, thoughts, annotations, bookmarks, canvases, and graphs remain 100% untouched. | **VERIFIED** |
| **Settings Export Machine Isolation** | `lib/settings/schema.ts`, `server/settings-store.mjs` | Exported package (`read-watch.settings` v1) contains only appearance, reading, library, and accessibility preferences. Local filesystem paths, session tokens, and passwords are strictly excluded. | **VERIFIED** |
| **No Invented Corporate Entity** | `/privacy`, `/terms` | Discloses project as open-source workstation under standard MIT / permissive licenses. Does not claim fake corporations, fake GDPR/CCPA certifications, or commercial SaaS guarantees. | **VERIFIED** |
| **Zero Em Dashes in User Copy** | Whole frontend grep audit | Audited all TSX/JSX strings in `app/`, `components/`, and `lib/`. Zero user-facing em dashes found. | **VERIFIED** |

---

## 3. Findings & Flagged Items

- **Unsupported Claims Found:** 0
- **Stale Claims Remediated:** 
  1. Stale mention of "separate reader process" removed from privacy disclosures.
  2. Stale mention of "Readest runtime" in `App/app/README.md` updated to current user data and notes architecture.
- **Architectural Integrity:** 100% compliant with Master Plan and Design Constitution.
