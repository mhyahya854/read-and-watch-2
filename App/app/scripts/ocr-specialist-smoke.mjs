/**
 * Real Urdu Nastaliq specialist smoke test — Phase 17.
 *
 * This is NOT a benchmark. It proves the shipped engine driver can load the
 * pinned specialist revision and run it end to end on a lawful synthetic
 * single-line fixture. It measures no accuracy and must never be quoted as one.
 *
 * What it exercises, through the real code paths:
 *   update manager -> specialist provisioning hooks -> isolated runtime venv
 *   -> exact pinned Hugging Face revision download -> hash verification
 *   -> staged contract validation -> health check -> synthetic line smoke
 *
 * Everything lands under READ_WATCH_DATA_ROOT/ocr/. Nothing is committed.
 *
 * Usage:
 *   node app/scripts/ocr-specialist-smoke.mjs [--stage-only] [--revision <sha>]
 *   node app/scripts/ocr-specialist-smoke.mjs --runtime-python <python>  (host-provisioned interpreter)
 */

import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveDataPaths } from '../server/data-paths.mjs';
import { createEngineStore } from '../server/ocr/engine-store.mjs';
import { OCR_PROVIDERS } from '../server/ocr/ocr-contract.mjs';
import { createUrduNastaliqProvider } from '../server/ocr/provider-urdu-nastaliq.mjs';
import { createSpecialistProvisioningHooks } from '../server/ocr/specialist-provisioning.mjs';
import { createRuntimeBridge } from '../server/ocr/runtime-bridge.mjs';

const DRIVER_PATH = join(
  fileURLToPath(new URL('..', import.meta.url)),
  'server',
  'ocr',
  'driver',
  'engine_driver.py',
);
const APP_ROOT = fileURLToPath(new URL('..', import.meta.url));

function parseArgs(argv) {
  const options = { stageOnly: false, revision: null, runtimePython: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--stage-only') options.stageOnly = true;
    if (argv[index] === '--revision') options.revision = argv[++index] ?? null;
    if (argv[index] === '--runtime-python') options.runtimePython = argv[++index] ?? null;
  }
  return options;
}

/**
 * Downloads the exact pinned model revision into the external model root and
 * runs the shipped driver against it with the supplied interpreter. Used when
 * this host cannot create the staged runtime (for example a Windows MAX_PATH
 * limitation) but the engine itself is still worth proving.
 */
async function runHostInterpreterSmoke({ dataRoot, revision, runtimePython, resolved }) {
  const hooks = createSpecialistProvisioningHooks({ dataRoot, driverPath: DRIVER_PATH, interpreter: runtimePython });
  const model = hooks.verifyModelDirectory({ revision });
  if (!model.ok) {
    await hooks.stageRevision({
      revision,
      stagingDir: model.dir,
      runtimeForRevision: () => ({ base: dataRoot, pythonBin: runtimePython }),
    });
  }
  const staged = hooks.verifyModelDirectory({ revision });
  if (!staged.ok) {
    throw new Error(`model staging incomplete: ${staged.missing.join(', ')}`);
  }
  const bridge = createRuntimeBridge({
    command: runtimePython,
    args: [DRIVER_PATH, '--provider', 'urdu-nastaliq-trocr', '--model-dir', staged.dir],
    cwd: dataRoot,
    env: { PYTHONNOUSERSITE: '1' },
  });
  try {
    const health = await bridge.request('health', { providerId: 'urdu-nastaliq-trocr' }, { timeoutMs: 300_000 });
    const smoke = await bridge.request(
      'smoke',
      { providerId: 'urdu-nastaliq-trocr', languages: ['ur'], unitType: 'LINE' },
      { timeoutMs: 900_000 },
    );
    return { health, smoke, modelDir: staged.dir, revision, provenance: resolved.provenance };
  } finally {
    await bridge.dispose();
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { dataRoot } = resolveDataPaths({ appRoot: APP_ROOT });
  const ocrRoot = join(dataRoot, 'ocr');
  const engineStore = createEngineStore({ ocrRoot });
  engineStore.ensureLayout();

  const provider = createUrduNastaliqProvider({
    engineStore,
    dataRoot,
    driverPath: DRIVER_PATH,
    interpreter: process.env.READ_WATCH_OCR_PYTHON ?? 'python',
    onProgress: (event) => {
      process.stderr.write(`${JSON.stringify(event)}\n`);
    },
  });

  const startedAt = Date.now();
  const resolved = await provider.resolveUpstreamRevision();
  const revision = options.revision ?? resolved.revision;
  process.stderr.write(`${JSON.stringify({ stage: 'resolved', revision, provenance: resolved.provenance })}\n`);

  if (options.runtimePython) {
    const result = await runHostInterpreterSmoke({
      dataRoot,
      revision,
      runtimePython: options.runtimePython,
      resolved,
    });
    process.stdout.write(
      `${JSON.stringify(
        {
          kind: 'SMOKE TEST ONLY',
          mode: 'host-provided-interpreter',
          note: 'Not benchmark evidence. The app-managed staged runtime was not used for this run; see runtimeInstallation.',
          providerId: provider.id,
          upstreamModel: OCR_PROVIDERS['urdu-nastaliq-trocr'].officialUpstream,
          upstreamRevision: revision,
          pinnedRevision: OCR_PROVIDERS['urdu-nastaliq-trocr'].modelRevision,
          pinnedRevisionIsCurrent: resolved.pinnedRevisionIsCurrent ?? null,
          runtimeInstallation: 'EXTERNAL_HOST_INTERPRETER',
          modelDir: result.modelDir,
          runtimePython: options.runtimePython,
          elapsedMs: Date.now() - startedAt,
          health: result.health,
          smoke: result.smoke,
          ok: Boolean(result.health?.ok !== false && result.smoke?.ok),
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  const staged = await provider.stageUpdate({ revision, provenance: resolved.provenance });
  const activation = options.stageOnly ? null : provider.activateUpdate({ revision: staged.revision });

  const summary = {
    kind: 'SMOKE TEST ONLY',
    note: 'Not benchmark evidence. No accuracy, CER, or speed number is claimed.',
    providerId: provider.id,
    upstreamModel: OCR_PROVIDERS['urdu-nastaliq-trocr'].officialUpstream,
    upstreamRevision: revision,
    pinnedRevision: OCR_PROVIDERS['urdu-nastaliq-trocr'].modelRevision,
    pinnedRevisionIsCurrent: resolved.pinnedRevisionIsCurrent ?? null,
    elapsedMs: Date.now() - startedAt,
    stageStatus: staged.status,
    activated: Boolean(activation),
    verification: staged.verification
      ? {
          ok: staged.verification.ok,
          integrity: staged.verification.integrity,
          contractOk: staged.verification.contract?.ok ?? null,
          smokeOk: staged.verification.smoke?.ok ?? null,
          smokeError: staged.verification.smoke?.error ?? null,
          hardware: staged.verification.smoke?.hardware ?? null,
          runtimePackages: staged.verification.smoke?.health?.packages ?? null,
          python: staged.verification.smoke?.health?.python ?? null,
          platform: staged.verification.smoke?.health?.platform ?? null,
          fixture: staged.verification.smoke?.fixture ?? null,
        }
      : null,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => {
  process.stdout.write(
    `${JSON.stringify(
      {
        kind: 'SMOKE TEST ONLY',
        ok: false,
        code: error?.code ?? null,
        message: error?.message ?? String(error),
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = 1;
});
