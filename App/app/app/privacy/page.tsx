import Link from 'next/link';
import { StaticProductPage } from '@/components/static-product-page';
import {
  APP_VERSION,
  LEGAL_DOCUMENT_VERSION,
  LEGAL_EFFECTIVE_DATE,
} from '@/lib/legal-metadata';

export default function PrivacyPage() {
  const sections = [
    { id: 'overview', title: '1. Overview and Core Privacy Principle' },
    { id: 'local-storage', title: '2. Information Stored Locally' },
    { id: 'source-publications', title: '3. Source Publications and Immutability' },
    { id: 'user-authored-content', title: '4. User-Authored Content' },
    { id: 'search-index', title: '5. Search and Derived Data' },
    { id: 'desktop-architecture', title: '6. Desktop Architecture and Local Service' },
    { id: 'permissions', title: '7. Desktop Permissions' },
    { id: 'network-behavior', title: '8. Network Behavior and External Links' },
    { id: 'third-party-software', title: '9. Third-Party Software Runtime' },
    { id: 'accounts-cloud', title: '10. Accounts and Cloud Services' },
    { id: 'cookies-web-storage', title: '11. Cookies and Web Storage' },
    { id: 'clipboard', title: '12. Clipboard Handling' },
    { id: 'backups-exports', title: '13. Backups and Exports' },
    { id: 'updates', title: '14. Application Updates' },
    { id: 'retention-deletion', title: '15. Data Retention, Deletion, and Uninstall' },
    { id: 'security-responsibility', title: '16. Local Device Security Responsibility' },
    { id: 'jurisdiction-disclaimer', title: '17. Jurisdictional Notice and Legal Scope' },
    { id: 'changes', title: '18. Changes to this Policy' },
  ];

  return (
    <StaticProductPage title="Privacy Policy" eyebrow="Local-first data governance">
      <div className="space-y-8">
        {/* Document Metadata Bar */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border border-border bg-surface px-4 py-3 text-xs text-muted-foreground">
          <div>
            <span className="font-medium text-foreground">Effective Date:</span>{' '}
            {LEGAL_EFFECTIVE_DATE}
          </div>
          <div>
            <span className="font-medium text-foreground">Application Version:</span>{' '}
            {APP_VERSION}
          </div>
          <div>
            <span className="font-medium text-foreground">Policy Version:</span>{' '}
            {LEGAL_DOCUMENT_VERSION}
          </div>
        </div>

        {/* Short Executive Summary */}
        <div className="rounded-md border border-border bg-surface p-4 text-sm text-foreground">
          <p className="font-medium">Summary in Plain Language</p>
          <p className="mt-1 text-muted-foreground">
            Read &amp; Watch is a local application. Your books, notes, highlights,
            canvases, and reading positions are stored on your computer in your configured
            data folder. The application does not require an account, does not run background
            analytics or telemetry, and does not upload your library to any remote server.
          </p>
        </div>

        {/* Table of Contents */}
        <nav aria-label="Table of Contents" className="rounded-md border border-border bg-surface px-5 py-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Contents
          </h2>
          <ol className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
            {sections.map(({ id, title }) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="text-muted-foreground hover:text-foreground hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* Policy Body */}
        <div className="space-y-10 text-sm leading-relaxed text-foreground">
          {/* 1. Overview */}
          <section id="overview" className="scroll-mt-16 space-y-3">
            <h2 className="font-editorial text-xl font-semibold text-foreground">
              1. Overview and Core Privacy Principle
            </h2>
            <p className="text-muted-foreground">
              Read &amp; Watch is designed from the ground up on a local-first privacy model.
              Personal reading, study, and research data belong entirely to the user. The application
              operates locally on your device without reliance on remote cloud infrastructure or
              third-party surveillance services.
            </p>
          </section>

          {/* 2. Local Storage */}
          <section id="local-storage" className="scroll-mt-16 space-y-3">
            <h2 className="font-editorial text-xl font-semibold text-foreground">
              2. Information Stored Locally
            </h2>
            <p className="text-muted-foreground">
              Read &amp; Watch stores your application data locally in the folder designated as
              your local data root. Stored information includes:
            </p>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>Library catalog metadata (titles, authors, tags, ratings, summaries, and added dates)</li>
              <li>Reading state (current reading progress, active page numbers, and EPUB CFI locations)</li>
              <li>Reader preferences (font family, font size, line spacing, margins, and theme selection)</li>
              <li>Annotations (highlights, underlines, strikes, comments, and freehand drawing marks)</li>
              <li>Reading bookmarks (page markers, progression percentages, and text snippets)</li>
              <li>Item notes and thoughts (Markdown files associated with catalog items)</li>
              <li>Visual canvas notes (freehand diagrams, shapes, text, and embedded canvas assets)</li>
              <li>Knowledge graphs and text-based diagrams (concept nodes, relational edges, and Mermaid definitions)</li>
            </ul>
            <p className="text-muted-foreground">
              All records are persisted in a local SQLite database and atomic crash-recovery mirror
              files inside your local data directory.
            </p>
          </section>

          {/* 3. Source Publications */}
          <section id="source-publications" className="scroll-mt-16 space-y-3">
            <h2 className="font-editorial text-xl font-semibold text-foreground">
              3. Source Publications and Immutability
            </h2>
            <p className="text-muted-foreground">
              Source publication files (such as EPUB, PDF, MOBI, AZW, and CBZ documents) remain
              stored on your computer under your control. When you add a publication to Read &amp; Watch:
            </p>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>The application reads the publication file using read-only access.</li>
              <li>The application calculates a cryptographic SHA-256 digest of the file to verify document identity and detect accidental changes.</li>
              <li>The application never alters, rewrites, renames, moves, or deletes your source publication files.</li>
              <li>Exporting an annotated PDF generates a new, separate PDF document at a path of your choosing; it never overwrites the original source file.</li>
            </ul>
          </section>

          {/* 4. User-Authored Content */}
          <section id="user-authored-content" className="scroll-mt-16 space-y-3">
            <h2 className="font-editorial text-xl font-semibold text-foreground">
              4. User-Authored Content
            </h2>
            <p className="text-muted-foreground">
              You retain full ownership of all notes, thoughts, highlights, comments, drawings,
              canvases, and knowledge diagrams you create. Read &amp; Watch does not claim any
              intellectual property rights or licensing rights in your content.
            </p>
          </section>

          {/* 5. Search Index */}
          <section id="search-index" className="scroll-mt-16 space-y-3">
            <h2 className="font-editorial text-xl font-semibold text-foreground">
              5. Search and Derived Data
            </h2>
            <p className="text-muted-foreground">
              The application provides full-text search across your library catalog, notes,
              bookmarks, and annotations using an embedded SQLite FTS5 search index.
            </p>
            <p className="text-muted-foreground">
              This search index is entirely derived from your local canonical data. It operates
              strictly on your computer and is never transmitted to an external search provider.
              The index can be rebuilt at any time from your primary data files without data loss.
            </p>
          </section>

          {/* 6. Desktop Architecture */}
          <section id="desktop-architecture" className="scroll-mt-16 space-y-3">
            <h2 className="font-editorial text-xl font-semibold text-foreground">
              6. Desktop Architecture and Local Service
            </h2>
            <p className="text-muted-foreground">
              On the desktop, Read &amp; Watch runs within a secure Electron application shell.
              To provide robust database transactions and local file management, the desktop app
              runs an internal HTTP service bound strictly to the local loopback address (127.0.0.1)
              on an ephemeral port.
            </p>
            <p className="text-muted-foreground">
              This loopback service is not a cloud server. It is completely inaccessible to other
              computers on your network and the internet. All communication between the app
              window and the loopback service is authenticated using an in-memory session token
              generated freshly on each launch.
            </p>
          </section>

          {/* 7. Permissions */}
          <section id="permissions" className="scroll-mt-16 space-y-3">
            <h2 className="font-editorial text-xl font-semibold text-foreground">
              7. Desktop Permissions
            </h2>
            <p className="text-muted-foreground">
              The desktop application enforces a strict least-privilege boundary:
            </p>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>File reading is limited to files and directories you explicitly select using standard system dialogs or Windows Open-With actions.</li>
              <li>File writing is strictly confined to your designated Read &amp; Watch local data root and explicit export destinations you choose.</li>
              <li>The application does not request or use camera, microphone, geolocation, or system notification permissions.</li>
              <li>The application does not execute arbitrary shell commands, scripts, or system utilities.</li>
            </ul>
          </section>

          {/* 8. Network Behavior */}
          <section id="network-behavior" className="scroll-mt-16 space-y-3">
            <h2 className="font-editorial text-xl font-semibold text-foreground">
              8. Network Behavior and External Links
            </h2>
            <p className="text-muted-foreground">
              Read &amp; Watch does not include application analytics, tracking SDKs, crash
              telemetry, or usage beacons in the measured current build.
            </p>
            <p className="text-muted-foreground">
              The application does not download fonts, scripts, or stylesheets from remote
              content delivery networks (CDNs) during normal execution. All user interface
              assets are bundled locally.
            </p>
            <p className="text-muted-foreground">
              If you click an external web link (such as a citation URL or an external reference
              in your notes), the link is opened in your default operating system browser. Once
              opened, the external website operates under its own privacy policy and terms.
              Read &amp; Watch does not track external link clicks.
            </p>
          </section>

          {/* 9. Third-Party Software */}
          <section id="third-party-software" className="scroll-mt-16 space-y-3">
            <h2 className="font-editorial text-xl font-semibold text-foreground">
              9. Third-Party Software Runtime
            </h2>
            <p className="text-muted-foreground">
              The application incorporates vetted open-source libraries that execute locally:
            </p>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>Foliate-JS and PDF.js parse and display publications locally in your window.</li>
              <li>Excalidraw, React Flow, and Mermaid render diagrams and canvases locally.</li>
              <li>Lucide provides local vector icons.</li>
            </ul>
            <p className="text-muted-foreground">
              None of these third-party components transmit your publications, notes, or reading
              activity to their maintainers or third parties.
            </p>
          </section>

          {/* 10. Accounts and Cloud Services */}
          <section id="accounts-cloud" className="scroll-mt-16 space-y-3">
            <h2 className="font-editorial text-xl font-semibold text-foreground">
              10. Accounts and Cloud Services
            </h2>
            <p className="text-muted-foreground">
              The current product does not require, offer, or provide a Read &amp; Watch user account.
              There is no sign-in, cloud sync, social sharing, or online collaboration service.
            </p>
          </section>

          {/* 11. Cookies and Web Storage */}
          <section id="cookies-web-storage" className="scroll-mt-16 space-y-3">
            <h2 className="font-editorial text-xl font-semibold text-foreground">
              11. Cookies and Web Storage
            </h2>
            <p className="text-muted-foreground">
              Read &amp; Watch does not use HTTP cookies, tracking cookies, or advertising identifiers.
              Canonical application state is maintained in local SQLite and file storage rather than
              browser storage.
            </p>
          </section>

          {/* 12. Clipboard Handling */}
          <section id="clipboard" className="scroll-mt-16 space-y-3">
            <h2 className="font-editorial text-xl font-semibold text-foreground">
              12. Clipboard Handling
            </h2>
            <p className="text-muted-foreground">
              When you use the Copy action in the reader or diagram editor, the application places
              the selected text or SVG markup onto your operating system clipboard. The application
              never automatically inspects, reads, or transmits your system clipboard contents.
            </p>
          </section>

          {/* 13. Backups and Exports */}
          <section id="backups-exports" className="scroll-mt-16 space-y-3">
            <h2 className="font-editorial text-xl font-semibold text-foreground">
              13. Backups and Exports
            </h2>
            <p className="text-muted-foreground">
              The application provides built-in tools to export your notes (Markdown), annotations
              (JSON and Markdown), canvases (.rwcanvas), and full application state (.rwbackup).
            </p>
            <p className="text-muted-foreground">
              Export and backup files are saved directly to locations you select. Backup archives
              contain your library catalog, annotations, notes, bookmarks, and canvases, but do
              not include original source book files. You remain responsible for keeping secure
              copies of your source books.
            </p>
          </section>

          {/* 14. Updates */}
          <section id="updates" className="scroll-mt-16 space-y-3">
            <h2 className="font-editorial text-xl font-semibold text-foreground">
              14. Application Updates
            </h2>
            <p className="text-muted-foreground">
              Read &amp; Watch maintains a strict policy against silent, unconfirmed background
              updates. Application binaries will not update without your knowledge. Any update
              mechanism requires user initiation or confirmation before new versions are installed.
            </p>
          </section>

          {/* 15. Retention and Deletion */}
          <section id="retention-deletion" className="scroll-mt-16 space-y-3">
            <h2 className="font-editorial text-xl font-semibold text-foreground">
              15. Data Retention, Deletion, and Uninstall
            </h2>
            <p className="text-muted-foreground">
              Your data remains on your computer for as long as you choose to keep it. You can
              delete individual items, notes, highlights, or canvases directly from within the
              application interface, or by removing the corresponding files from your data folder.
            </p>
            <p className="text-muted-foreground">
              Uninstalling Read &amp; Watch removes the application binaries and shortcuts, but
              preserves your configured data directory and library records by default, preventing
              accidental loss of your reading history and notes.
            </p>
          </section>

          {/* 16. Security Responsibility */}
          <section id="security-responsibility" className="scroll-mt-16 space-y-3">
            <h2 className="font-editorial text-xl font-semibold text-foreground">
              16. Local Device Security Responsibility
            </h2>
            <p className="text-muted-foreground">
              Because Read &amp; Watch operates locally, the security of your library depends on
              the security of your computer and operating system account. You are responsible for
              maintaining device access controls, disk encryption where appropriate, and regular
              backups of important data.
            </p>
          </section>

          {/* 17. Jurisdictional Notice */}
          <section id="jurisdiction-disclaimer" className="scroll-mt-16 space-y-3">
            <h2 className="font-editorial text-xl font-semibold text-foreground">
              17. Jurisdictional Notice and Legal Scope
            </h2>
            <p className="text-muted-foreground">
              This document describes the measured technical behavior and data architecture of
              Read &amp; Watch version {APP_VERSION}. It does not constitute a claim of formal
              certification under specific regional regulatory regimes. Qualified legal counsel
              should review jurisdiction-specific clauses before wide public distribution.
            </p>
          </section>

          {/* 18. Changes to this Policy */}
          <section id="changes" className="scroll-mt-16 space-y-3">
            <h2 className="font-editorial text-xl font-semibold text-foreground">
              18. Changes to this Policy
            </h2>
            <p className="text-muted-foreground">
              If the technical data flows or storage architecture of Read &amp; Watch change in
              future releases, this policy will be updated with an incremented policy version
              and a revised effective date.
            </p>
          </section>
        </div>

        {/* Footer Navigation */}
        <div className="flex flex-wrap items-center justify-between border-t border-border pt-6 text-sm text-muted-foreground">
          <Link
            href="/terms"
            className="hover:text-foreground hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Read the Terms &amp; Conditions &rarr;
          </Link>
          <Link
            href="/settings"
            className="hover:text-foreground hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Open Settings
          </Link>
        </div>
      </div>
    </StaticProductPage>
  );
}
