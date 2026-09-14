import {
  type AppSettings,
  type AppSettingsUpdate,
  type SettingsExportPackage,
} from './types';
import {
  DEFAULT_APP_SETTINGS,
  validateAppSettings,
  validateImportedSettings,
  createSettingsExportPackage,
} from './schema';

export async function fetchAppSettings(signal?: AbortSignal): Promise<AppSettings> {
  try {
    const res = await fetch('/api/settings', {
      cache: 'no-store',
      signal,
    });
    if (!res.ok) {
      return { ...DEFAULT_APP_SETTINGS };
    }
    const data = await res.json();
    return validateAppSettings(data);
  } catch {
    return { ...DEFAULT_APP_SETTINGS };
  }
}

export async function updateAppSettings(
  patch: AppSettingsUpdate
): Promise<AppSettings> {
  const res = await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || 'Failed to save settings.');
  }
  const data = await res.json();
  return validateAppSettings(data);
}

export async function resetAppSettings(): Promise<AppSettings> {
  const res = await fetch('/api/settings/reset', {
    method: 'POST',
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || 'Failed to reset settings.');
  }
  const data = await res.json();
  return validateAppSettings(data);
}

export async function downloadSettingsExport(currentSettings?: AppSettings): Promise<void> {
  const settings = currentSettings || (await fetchAppSettings());
  const exportPackage: SettingsExportPackage = createSettingsExportPackage(settings);
  const blob = new Blob([JSON.stringify(exportPackage, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const dateStr = new Date().toISOString().slice(0, 10);
  a.download = `read-watch-settings-${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function uploadAndApplySettings(file: File): Promise<AppSettings> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Selected file is not valid JSON.');
  }

  // Pre-validate locally to give immediate, accurate errors
  const validated = validateImportedSettings(parsed);

  const res = await fetch('/api/settings/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validated),
  });

  if (!res.ok) {
    const errorData = (await res.json().catch(() => ({ error: 'Import failed' }))) as { error?: string };
    throw new Error(errorData.error || 'Failed to apply imported settings.');
  }

  const result = await res.json();
  return validateAppSettings(result);
}
