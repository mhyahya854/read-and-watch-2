import Link from 'next/link';
import { StaticProductPage } from '@/components/static-product-page';
import {
  APP_VERSION,
  LEGAL_DOCUMENT_VERSION,
  LEGAL_EFFECTIVE_DATE,
} from '@/lib/legal-metadata';

export default function TermsPage() {
  const sections = [
    { id: 'acceptance', title: '1. Acceptance and Scope' },
    { id: 'purpose', title: '2. Purpose of the Application' },
    { id: 'user-content', title: '3. Files and Content Added by You' },
    { id: 'ownership', title: '4. Intellectual Property and Content Ownership' },
    { id: 'local-data', title: '5. Local Data, Backups, and Recovery' },
    { id: 'source-files', title: '6. Source File Handling and Immutability' },
    { id: 'exports', title: '7. Exports and Derivative Files' },
    { id: 'third-party', title: '8. Open Source and Third-Party Components' },
    { id: 'updates', title: '9. Software Updates and Availability' },
    { id: 'no-cloud', title: '10. No Cloud, Account, or Sync Commitments' },
    { id: 'warranty', title: '11. Warranty Disclaimer' },
    { id: 'liability', title: '12. Limitation of Liability' },
    { id: 'termination', title: '13. Termination, Deletion, and Uninstallation' },
    { id: 'jurisdiction', title: '14. Legal Review and Governing Principles' },
    { id: 'changes', title: '15. Changes to these Terms' },
  ];

  return (
    <StaticProductPage title="Terms & Conditions" eyebrow="Local software agreement">
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
            <span className="font-medium text-foreground">Document Version:</span>{' '}
            {LEGAL_DOCUMENT_VERSION}
          </div>
        </div>

        {/* Executive Summary */}
        <div className="rounded-md border border-border bg-surface p-4 text-sm text-foreground">
          <p className="font-medium">Summary in Plain Language</p>
          <p className="mt-1 text-muted-foreground">
            Read &amp; Watch is local personal software. You are responsible for ensuring you have
            the legal right to read and annotate the publications you add. You own your notes and
            annotations. The software does not provide online accounts, cloud storage, or
            automatic cloud backups. Keep verified backups of your important data.
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

        {/* Terms Body */}
        <div className="space-y-10 text-sm leading-relaxed text-foreground">
          {/* 1. Acceptance */}
          <section id="acceptance" className="scroll-mt-16 space-y-3">
            <h2 className="font-editorial text-xl font-semibold text-foreground">
              1. Acceptance and Scope
            </h2>
            <p className="text-muted-foreground">
              By installing, running, or using Read &amp; Watch, you agree to these Terms &amp;
              Conditions. These terms govern your local use of the software on your devices.
            </p>
          </section>

          {/* 2. Purpose */}
          <section id="purpose" className="scroll-mt-16 space-y-3">
            <h2 className="font-editorial text-xl font-semibold text-foreground">
              2. Purpose of the Application
            </h2>
            <p className="text-muted-foreground">
              Read &amp; Watch is a personal productivity, reading, and knowledge management tool.
              It enables users to organize their local library, read electronic publications, record
              notes, highlight text, draw vector annotations, and create visual concept diagrams.
            </p>
          </section>

          {/* 3. User Content */}
          <section id="user-content" className="scroll-mt-16 space-y-3">
            <h2 className="font-editorial text-xl font-semibold text-foreground">
              3. Files and Content Added by You
            </h2>
            <p className="text-muted-foreground">
              You are solely responsible for the publications, documents, media files, and text you
              add to or open within Read &amp; Watch. You represent that you possess the necessary
              legal rights, licenses, or permissions to import, view, and annotate any content you
              load into the application.
            </p>
          </section>

          {/* 4. Ownership */}
          <section id="ownership" className="scroll-mt-16 space-y-3">
            <h2 className="font-editorial text-xl font-semibold text-foreground">
              4. Intellectual Property and Content Ownership
            </h2>
            <p className="text-muted-foreground">
              You retain 100% ownership of your original notes, thoughts, annotations, bookmarks,
              canvases, and diagram documents. Read &amp; Watch does not claim copyright, title, or
              any license in the content you produce using the application.
            </p>
            <p className="text-muted-foreground">
              The Read &amp; Watch application, interface designs, logos, and code are protected
              by applicable copyright and intellectual property laws.
            </p>
          </section>

          {/* 5. Local Data and Backups */}
          <section id="local-data" className="scroll-mt-16 space-y-3">
            <h2 className="font-editorial text-xl font-semibold text-foreground">
              5. Local Data, Backups, and Recovery
            </h2>
            <p className="text-muted-foreground">
              Read &amp; Watch functions as local software. All application databases, preference
              records, notes, and indexes are stored on your local computer.
            </p>
            <p className="text-muted-foreground">
              While the application provides structured backup (.rwbackup) and export functions,
              you remain responsible for maintaining verified external backups of your important
              records. Because source publications are excluded from backup bundles, you must ensure
              your original book and media files are backed up independently.
            </p>
          </section>

          {/* 6. Source Files */}
          <section id="source-files" className="scroll-mt-16 space-y-3">
            <h2 className="font-editorial text-xl font-semibold text-foreground">
              6. Source File Handling and Immutability
            </h2>
            <p className="text-muted-foreground">
              The application accesses your source publications in read-only mode. Read &amp; Watch
              does not overwrite, rename, re-encode, or convert your original book files in place.
              Cryptographic hashes are used solely to confirm document identity and preserve reading
              location anchors.
            </p>
          </section>

          {/* 7. Exports */}
          <section id="exports" className="scroll-mt-16 space-y-3">
            <h2 className="font-editorial text-xl font-semibold text-foreground">
              7. Exports and Derivative Files
            </h2>
            <p className="text-muted-foreground">
              When you generate an export (such as an annotated PDF, Markdown note, or JSON package),
              the application writes a new, separate file at the location you specify. You are
              responsible for managing and securing any files you export from Read &amp; Watch.
            </p>
          </section>

          {/* 8. Open Source */}
          <section id="third-party" className="scroll-mt-16 space-y-3">
            <h2 className="font-editorial text-xl font-semibold text-foreground">
              8. Open Source and Third-Party Components
            </h2>
            <p className="text-muted-foreground">
              Read &amp; Watch incorporates open-source software libraries, including Electron,
              React, PDF.js, Foliate-JS, Excalidraw, React Flow, and Mermaid. Each component is
              governed by its respective open-source license.
            </p>
          </section>

          {/* 9. Updates */}
          <section id="updates" className="scroll-mt-16 space-y-3">
            <h2 className="font-editorial text-xl font-semibold text-foreground">
              9. Software Updates and Availability
            </h2>
            <p className="text-muted-foreground">
              Software updates are delivered with user confirmation. The application does not perform
              silent background updates. You may choose whether and when to install updated versions
              of Read &amp; Watch.
            </p>
          </section>

          {/* 10. No Cloud */}
          <section id="no-cloud" className="scroll-mt-16 space-y-3">
            <h2 className="font-editorial text-xl font-semibold text-foreground">
              10. No Cloud, Account, or Sync Commitments
            </h2>
            <p className="text-muted-foreground">
              Read &amp; Watch is distributed as standalone local software. These terms do not
              promise the availability of cloud synchronization, remote hosting, account recovery,
              or server-based infrastructure.
            </p>
          </section>

          {/* 11. Warranty */}
          <section id="warranty" className="scroll-mt-16 space-y-3">
            <h2 className="font-editorial text-xl font-semibold text-foreground">
              11. Warranty Disclaimer
            </h2>
            <p className="text-muted-foreground">
              Read &amp; Watch is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo;
              basis, without warranty of any kind, whether express, implied, statutory, or otherwise,
              including warranties of merchantability, fitness for a particular purpose, and
              non-infringement, to the maximum extent permitted by applicable law.
            </p>
          </section>

          {/* 12. Liability */}
          <section id="liability" className="scroll-mt-16 space-y-3">
            <h2 className="font-editorial text-xl font-semibold text-foreground">
              12. Limitation of Liability
            </h2>
            <p className="text-muted-foreground">
              To the fullest extent permitted by applicable law, neither the developers nor
              contributors shall be liable for any indirect, incidental, special, consequential,
              or punitive damages, or for any loss of data, profits, or goodwill arising from your
              use of or inability to use Read &amp; Watch.
            </p>
          </section>

          {/* 13. Termination */}
          <section id="termination" className="scroll-mt-16 space-y-3">
            <h2 className="font-editorial text-xl font-semibold text-foreground">
              13. Termination, Deletion, and Uninstallation
            </h2>
            <p className="text-muted-foreground">
              You may terminate these terms at any time by uninstalling Read &amp; Watch and deleting
              your local application data. Uninstalling the application binary does not delete your
              library database or notes folder unless you choose to delete that folder manually.
            </p>
          </section>

          {/* 14. Jurisdiction */}
          <section id="jurisdiction" className="scroll-mt-16 space-y-3">
            <h2 className="font-editorial text-xl font-semibold text-foreground">
              14. Legal Review and Governing Principles
            </h2>
            <p className="text-muted-foreground">
              These terms are formulated for personal, local-first software operation. Where consumer
              protection or local statutory rights apply, those mandatory legal rights remain
              unaffected. Prior to commercial redistribution or broad public release, qualified legal
              counsel should verify jurisdiction-specific clauses.
            </p>
          </section>

          {/* 15. Changes */}
          <section id="changes" className="scroll-mt-16 space-y-3">
            <h2 className="font-editorial text-xl font-semibold text-foreground">
              15. Changes to these Terms
            </h2>
            <p className="text-muted-foreground">
              If these terms are modified for future releases, the revised document will be included
              with the software alongside an updated effective date and version number.
            </p>
          </section>
        </div>

        {/* Footer Navigation */}
        <div className="flex flex-wrap items-center justify-between border-t border-border pt-6 text-sm text-muted-foreground">
          <Link
            href="/privacy"
            className="hover:text-foreground hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Read the Privacy Policy &rarr;
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
