'use client';

/**
 * OCR settings — Phase 17.
 *
 * Uses the existing settings visual language (section header + bordered surface
 * + definition list + outline buttons). No redesign, no gradients, no fake
 * progress, no fabricated revision numbers: every value shown here comes from a
 * real server response or reads as unknown.
 */

import { useEffect, useState } from 'react';
import { ScanText, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  fetchOcrInventory,
  installOcrEngine,
  checkOcrUpdate,
  updateOcrEngine,
  rollbackOcrEngine,
  updateAllOcrEngines,
  describeLifecycle,
  type OcrLanguage,
  type OcrProviderDescription,
  type OcrProviderInventory,
} from '@/lib/ocr';
import type { AppSettingsUpdate, OcrSettings } from '@/lib/settings/types';

const LANGUAGE_LABEL: Record<OcrLanguage, string> = {
  en: 'English',
  ar: 'Arabic',
  ur: 'Urdu',
};

interface OcrSettingsSectionProps {
  settings: OcrSettings;
  onPatch: (patch: Partial<AppSettingsUpdate>) => Promise<void>;
}

export function OcrSettingsSection({ settings, onPatch }: OcrSettingsSectionProps) {
  const [inventory, setInventory] = useState<OcrProviderInventory | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyProvider, setBusyProvider] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh() {
    try {
      const next = await fetchOcrInventory();
      setInventory(next);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not read OCR engine status.');
    }
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const next = await fetchOcrInventory();
        if (active) {
          setInventory(next);
          setLoadError(null);
        }
      } catch (error) {
        if (active) {
          setLoadError(error instanceof Error ? error.message : 'Could not read OCR engine status.');
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function run(providerId: string, label: string, action: () => Promise<unknown>) {
    setBusyProvider(providerId);
    setNotice(null);
    try {
      await action();
      setNotice(`${label} finished.`);
    } catch (error) {
      setNotice(`${label} failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setBusyProvider(null);
      await refresh();
    }
  }

  const providers: OcrProviderDescription[] = inventory?.providers ?? [];
  const modelFor = (providerId: string) =>
    inventory?.routing.find((route) => route.providerId === providerId)?.model?.recognition ?? null;

  return (
    <section className="space-y-4" aria-labelledby="heading-ocr">
      <div className="flex items-center gap-2">
        <ScanText className="size-5 text-primary" aria-hidden="true" />
        <h2 id="heading-ocr" className="font-editorial text-xl font-semibold text-foreground">
          OCR
        </h2>
      </div>

      <div className="rounded-md border border-border bg-surface">
        <dl className="divide-y divide-border text-sm">
          <div className="grid gap-1 px-5 py-3.5 sm:grid-cols-[14rem_1fr] sm:items-center">
            <dt className="font-medium text-foreground">Enable OCR</dt>
            <dd className="flex flex-wrap items-center gap-3 text-muted-foreground">
              <Button
                variant={settings.enabled ? 'default' : 'outline'}
                size="sm"
                onClick={() => void onPatch({ ocr: { enabled: !settings.enabled } })}
              >
                {settings.enabled ? 'Enabled' : 'Disabled'}
              </Button>
              <span className="text-xs">
                Off by default. Pages with usable embedded text are never sent to an OCR engine.
              </span>
            </dd>
          </div>
          <div className="grid gap-1 px-5 py-3.5 sm:grid-cols-[14rem_1fr] sm:items-center">
            <dt className="font-medium text-foreground">Default language</dt>
            <dd className="flex flex-wrap gap-2">
              {(['en', 'ar', 'ur'] as OcrLanguage[]).map((language) => (
                <Button
                  key={language}
                  variant={settings.defaultLanguage === language ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => void onPatch({ ocr: { defaultLanguage: language } })}
                >
                  {LANGUAGE_LABEL[language]}
                </Button>
              ))}
            </dd>
          </div>
          <div className="grid gap-1 px-5 py-3.5 sm:grid-cols-[14rem_1fr] sm:items-center">
            <dt className="font-medium text-foreground">Update policy</dt>
            <dd className="flex flex-wrap gap-2">
              <Button
                variant={settings.updatePolicy === 'manual' ? 'default' : 'outline'}
                size="sm"
                onClick={() => void onPatch({ ocr: { updatePolicy: 'manual' } })}
              >
                Manual only
              </Button>
              <Button
                variant={settings.updatePolicy === 'check-only' ? 'default' : 'outline'}
                size="sm"
                onClick={() => void onPatch({ ocr: { updatePolicy: 'check-only' } })}
              >
                Check for updates
              </Button>
            </dd>
          </div>
          <div className="grid gap-1 px-5 py-3.5 sm:grid-cols-[14rem_1fr]">
            <dt className="font-medium text-foreground">Processing location</dt>
            <dd className="text-muted-foreground">
              Local only. Recognised pages are never uploaded to Baidu, PaddlePaddle, Hugging Face,
              or any other inference service.
            </dd>
          </div>
          <div className="grid gap-1 px-5 py-3.5 sm:grid-cols-[14rem_1fr]">
            <dt className="font-medium text-foreground">Arabic tashkeel</dt>
            <dd className="flex items-start gap-2 text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <span>
                Harakat are always preserved in canonical OCR text. A separate diacritic-insensitive
                key is used only for searching.
              </span>
            </dd>
          </div>
        </dl>
      </div>

      {loadError && <p className="text-xs text-destructive">{loadError}</p>}

      {inventory && (
        <div className="rounded-md border border-border bg-surface">
          <dl className="divide-y divide-border text-sm">
            {providers.map((provider) => {
              const busy = busyProvider === provider.id;
              const active = provider.availability.activeRevision;
              const modelRevision = modelFor(provider.id);
              return (
                <div key={provider.id} className="space-y-3 px-5 py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <p className="font-medium text-foreground">{provider.displayName}</p>
                      <p className="text-xs text-muted-foreground">
                        {provider.languages.map((language) => LANGUAGE_LABEL[language]).join(', ')} ·{' '}
                        {provider.codeLicense} upstream code
                      </p>
                    </div>
                    <p className="text-xs font-medium text-foreground">
                      {describeLifecycle(provider.availability)}
                    </p>
                  </div>

                  <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-[12rem_1fr]">
                    <span>Installed revision</span>
                    <span className="break-all font-mono">
                      {active ?? 'Not installed'}
                      {provider.updateStatus.previousRevision
                        ? ` (previous: ${provider.updateStatus.previousRevision})`
                        : ''}
                    </span>
                    <span>Model revision</span>
                    <span className="break-all font-mono">
                      {active ? (modelRevision ?? 'Not reported') : 'Not reported'}
                    </span>
                    <span>Hardware / runtime</span>
                    <span>
                      {provider.runtimeRequirements.notes}
                      {provider.runtimeRequirements.cpuSupported ? '' : ' CPU execution is not claimed.'}
                    </span>
                    <span>Engine storage</span>
                    <span>
                      Managed runtime under the external data root. Nothing is stored in the project.
                    </span>
                    <span>Last update attempt</span>
                    <span>
                      {provider.updateStatus.lastFailure
                        ? `${provider.updateStatus.lastFailure.phase ?? 'unknown'} — ${
                            provider.updateStatus.lastFailure.message ?? 'failed'
                          }`
                        : 'None recorded'}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {!active && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void run(provider.id, `Install ${provider.displayName}`, () =>
                            installOcrEngine(provider.id),
                          )
                        }
                      >
                        {busy ? 'Working...' : 'Install'}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void run(provider.id, `Check for updates (${provider.displayName})`, () =>
                          checkOcrUpdate(provider.id),
                        )
                      }
                    >
                      <RefreshCw className="mr-1.5 size-3.5" />
                      Check for update
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy || !active}
                      onClick={() =>
                        void run(provider.id, `Update ${provider.displayName}`, () =>
                          updateOcrEngine(provider.id),
                        )
                      }
                    >
                      Update
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy || !provider.updateStatus.canRollback}
                      onClick={() =>
                        void run(provider.id, `Rollback ${provider.displayName}`, () =>
                          rollbackOcrEngine(provider.id),
                        )
                      }
                    >
                      Rollback
                    </Button>
                  </div>
                </div>
              );
            })}
          </dl>
          <div className="border-t border-border px-5 py-4">
            <Button
              variant="outline"
              size="sm"
              disabled={busyProvider !== null}
              onClick={() =>
                void run('all', 'Update all OCR engines', async () => {
                  await updateAllOcrEngines();
                })
              }
            >
              <RefreshCw className="mr-1.5 size-4" />
              Update all OCR engines
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              A staged revision is verified and smoke-tested before it becomes active. If verification
              fails, the working revision stays in place.
            </p>
          </div>
        </div>
      )}

      {notice && <p className="text-xs text-muted-foreground">{notice}</p>}
    </section>
  );
}
