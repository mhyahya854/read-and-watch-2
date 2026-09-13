import { StaticProductPage } from '@/components/static-product-page';

export default function SettingsPage() {
  return (
    <StaticProductPage title="Settings" eyebrow="Local application">
      <div className="space-y-8">
        <section className="space-y-3">
          <h2 className="font-editorial text-xl font-semibold text-foreground">
            Library &amp; Storage
          </h2>
          <div className="rounded-md border border-border bg-surface">
            <dl className="divide-y divide-border text-sm">
              <div className="grid gap-1 px-5 py-3.5 sm:grid-cols-[12rem_1fr]">
                <dt className="font-medium text-foreground">Storage model</dt>
                <dd className="text-muted-foreground">Local SQLite runtime with file-first recoverability</dd>
              </div>
              <div className="grid gap-1 px-5 py-3.5 sm:grid-cols-[12rem_1fr]">
                <dt className="font-medium text-foreground">Data location</dt>
                <dd className="text-muted-foreground">Configured external data root on local filesystem</dd>
              </div>
              <div className="grid gap-1 px-5 py-3.5 sm:grid-cols-[12rem_1fr]">
                <dt className="font-medium text-foreground">Cloud synchronization</dt>
                <dd className="text-muted-foreground">Disabled. No remote servers or cloud accounts used.</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-editorial text-xl font-semibold text-foreground">
            Appearance
          </h2>
          <div className="rounded-md border border-border bg-surface">
            <dl className="divide-y divide-border text-sm">
              <div className="grid gap-1 px-5 py-3.5 sm:grid-cols-[12rem_1fr]">
                <dt className="font-medium text-foreground">Color scheme</dt>
                <dd className="text-muted-foreground">Warm neutral ivory background with charcoal typography</dd>
              </div>
              <div className="grid gap-1 px-5 py-3.5 sm:grid-cols-[12rem_1fr]">
                <dt className="font-medium text-foreground">Accent color</dt>
                <dd className="text-muted-foreground">Muted deep teal</dd>
              </div>
              <div className="grid gap-1 px-5 py-3.5 sm:grid-cols-[12rem_1fr]">
                <dt className="font-medium text-foreground">Typography scale</dt>
                <dd className="text-muted-foreground">Editorial serif headings with disciplined UI sans-serif controls</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-editorial text-xl font-semibold text-foreground">
            Reading &amp; Launcher
          </h2>
          <div className="rounded-md border border-border bg-surface">
            <dl className="divide-y divide-border text-sm">
              <div className="grid gap-1 px-5 py-3.5 sm:grid-cols-[12rem_1fr]">
                <dt className="font-medium text-foreground">Reader bridge</dt>
                <dd className="text-muted-foreground">Desktop launcher for verified local EPUB and PDF books</dd>
              </div>
              <div className="grid gap-1 px-5 py-3.5 sm:grid-cols-[12rem_1fr]">
                <dt className="font-medium text-foreground">Source books</dt>
                <dd className="text-muted-foreground">Read-only. Source documents are never modified in place.</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-editorial text-xl font-semibold text-foreground">
            Accessibility
          </h2>
          <div className="rounded-md border border-border bg-surface">
            <dl className="divide-y divide-border text-sm">
              <div className="grid gap-1 px-5 py-3.5 sm:grid-cols-[12rem_1fr]">
                <dt className="font-medium text-foreground">Keyboard navigation</dt>
                <dd className="text-muted-foreground">Full arrow-key table navigation, slash search focus, Escape dismiss</dd>
              </div>
              <div className="grid gap-1 px-5 py-3.5 sm:grid-cols-[12rem_1fr]">
                <dt className="font-medium text-foreground">Motion preference</dt>
                <dd className="text-muted-foreground">Respects prefers-reduced-motion system preference</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-editorial text-xl font-semibold text-foreground">
            About
          </h2>
          <div className="rounded-md border border-border bg-surface">
            <dl className="divide-y divide-border text-sm">
              <div className="grid gap-1 px-5 py-3.5 sm:grid-cols-[12rem_1fr]">
                <dt className="font-medium text-foreground">Application</dt>
                <dd className="text-muted-foreground">Read &amp; Watch v0.1.0</dd>
              </div>
              <div className="grid gap-1 px-5 py-3.5 sm:grid-cols-[12rem_1fr]">
                <dt className="font-medium text-foreground">Privacy policy</dt>
                <dd className="text-muted-foreground">Strict local-only operation without tracking or analytics</dd>
              </div>
            </dl>
          </div>
        </section>
      </div>
    </StaticProductPage>
  );
}
