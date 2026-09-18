/**
 * Managed OCR provider factory — Phase 17.
 *
 * Both authorised engines (Baidu Unlimited-OCR and PaddleOCR PP-OCRv5) are
 * driven through the same small lifecycle, so provider-specific knowledge stays
 * confined to metadata plus three injectable hooks:
 *
 *   resolveUpstreamRevision - authoritative upstream revision (default: GitHub)
 *   stageRevision           - provision an isolated runtime for a revision
 *   smokeTestStaged         - health check + fixtures inside the staged runtime
 *
 * Everything else (status reporting, activation awareness, provenance capture,
 * recognition transport, cancellation) is shared. That is deliberate: two
 * nearly-identical provider files would be duplicated logic, not isolation.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { assertProviderContract, OcrError, OCR_LIFECYCLE, OCR_STATE } from './ocr-contract.mjs';
import { buildOcrTextRepresentations, verifyTashkeelPreserved } from './text-representations.mjs';
import { createRuntimeBridge } from './runtime-bridge.mjs';
import { createEngineUpdateManager } from './update-manager.mjs';
import { createUpstreamResolver } from './upstream-resolver.mjs';
import { sha256OfFile } from './engine-store.mjs';

export function runCommand(command, args, { cwd, env, signal, timeoutMs = 30 * 60 * 1000 } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, args, {
        cwd,
        env: { ...process.env, ...env },
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      resolve({ ok: false, code: -1, stdout: '', stderr: error.message });
      return;
    }
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        // already gone
      }
    }, timeoutMs);
    const abortHandler = () => {
      try {
        child.kill('SIGTERM');
      } catch {
        // already gone
      }
    };
    signal?.addEventListener('abort', abortHandler, { once: true });
    child.on('error', (error) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abortHandler);
      resolve({ ok: false, code: -1, stdout, stderr: `${stderr}${error.message}` });
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abortHandler);
      resolve({ ok: code === 0, code: code ?? -1, stdout, stderr });
    });
  });
}

/** Reads the interpreter's own capability report. Never guesses about hardware. */
export async function probePythonRuntime({ command, args = [], env, cwd, signal }) {
  if (!command) return { ok: false, code: OCR_STATE.RUNTIME_UNAVAILABLE, message: 'No python interpreter configured' };
  const probe = [
    ...args,
    '-c',
    'import json,platform,sys;' +
      'info={"python":sys.version.split()[0],"implementation":platform.python_implementation(),"platform":sys.platform};' +
      'info["packages"]=[];' +
      "\nfor name in ('paddleocr','paddle','torch','transformers','pymupdf','PIL'):\n" +
      '    try:\n' +
      '        mod=__import__(name);info["packages"].append(name+\'=\'+str(getattr(mod,"__version__","unknown")))\n' +
      '    except Exception:\n' +
      '        pass\n' +
      'print(json.dumps(info))',
  ];
  const result = await runCommand(command, probe, { env, cwd, signal, timeoutMs: 60_000 });
  if (!result.ok) {
    return {
      ok: false,
      code: OCR_STATE.RUNTIME_UNAVAILABLE,
      message: `Runtime probe failed: ${result.stderr.trim().slice(-300) || `exit ${result.code}`}`,
    };
  }
  try {
    const info = JSON.parse(result.stdout.trim().split('\n').pop());
    return { ok: true, info };
  } catch {
    return { ok: false, code: OCR_STATE.RUNTIME_UNAVAILABLE, message: 'Runtime probe returned unparsable output' };
  }
}

function defaultCollectArtifacts(root) {
  const artifacts = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name !== 'verification.json' && entry.name !== 'artifacts.json') {
        artifacts.push({
          path: full,
          size: statSync(full).size,
          sha256: sha256OfFile(full),
        });
      }
    }
  };
  walk(root);
  return artifacts;
}

export function createManagedOcrProvider({
  metadata,
  engineStore,
  dataRoot,
  driverPath,
  bridgeFactory,
  hooks = {},
  resolveUpstreamRevision: injectedResolver,
  interpreter,
}) {
  if (!metadata) throw new OcrError(OCR_STATE.INVALID_INPUT, 'Provider requires metadata');
  if (!engineStore) throw new OcrError(OCR_STATE.INVALID_INPUT, 'Provider requires an engine store');

  const providerId = metadata.id;
  const runtimeRoot = join(dataRoot, 'ocr', 'runtimes', providerId);
  const modelRoot = join(dataRoot, 'ocr', 'models', providerId);
  const upstreamResolver = createUpstreamResolver({ fetchImpl: hooks.fetchImpl });

  // Windows without LongPathsEnabled cannot materialise a deep Python package
  // tree under a long data root. Keep the engine-store/activation layout where
  // it is, but place the throwaway Python venv under a short external runtime
  // root. An already-materialised data-root runtime is always respected so
  // existing installations are unchanged; tests can redirect the short root
  // with READ_WATCH_OCR_RUNTIME_ROOT.
  function shortRuntimeRoot() {
    if (process.env.READ_WATCH_OCR_RUNTIME_ROOT) {
      return join(process.env.READ_WATCH_OCR_RUNTIME_ROOT, providerId);
    }
    const base =
      process.env.LOCALAPPDATA ||
      process.env.XDG_CACHE_HOME ||
      join(homedir(), '.cache');
    return join(base, 'RW', 'ocr', 'runtimes', providerId);
  }

  function runtimeForRevision(revision) {
    const normalBase = join(runtimeRoot, revision);
    const normalPython =
      process.platform === 'win32'
        ? join(normalBase, 'Scripts', 'python.exe')
        : join(normalBase, 'bin', 'python');
    if (existsSync(normalPython)) {
      return { base: normalBase, pythonBin: normalPython };
    }
    const base = join(shortRuntimeRoot(), revision);
    const pythonBin =
      process.platform === 'win32'
        ? join(base, 'Scripts', 'python.exe')
        : join(base, 'bin', 'python');
    return { base, pythonBin };
  }

  function activeRuntime() {
    const { activeRevision } = engineStore.readActivation(providerId);
    if (!activeRevision) return null;
    const { base, pythonBin } = runtimeForRevision(activeRevision);
    if (!existsSync(pythonBin)) return null;
    return { revision: activeRevision, base, pythonBin };
  }

  function status() {
    const activation = engineStore.readActivation(providerId);
    const runtime = activeRuntime();
    const failure = engineStore.readFailure(providerId);
    if (!activation.activeRevision) {
      return {
        ok: false,
        lifecycle: OCR_LIFECYCLE.NOT_INSTALLED,
        code: OCR_STATE.ENGINE_NOT_INSTALLED,
        message: `${metadata.displayName} is not installed.`,
        activeRevision: null,
        previousRevision: null,
      };
    }
    if (!runtime) {
      return {
        ok: false,
        lifecycle: OCR_LIFECYCLE.FAILED,
        code: OCR_STATE.RUNTIME_UNAVAILABLE,
        message: `Activated revision ${activation.activeRevision} has no usable runtime on this machine.`,
        activeRevision: activation.activeRevision,
        previousRevision: activation.previousRevision,
      };
    }
    if (failure && failure.revision === activation.activeRevision) {
      return {
        ok: false,
        lifecycle: OCR_LIFECYCLE.FAILED,
        code: OCR_STATE.UPDATE_FAILED,
        message: failure.message ?? 'Last update attempt failed.',
        activeRevision: activation.activeRevision,
        previousRevision: activation.previousRevision,
        lastFailure: failure,
      };
    }
    return {
      ok: true,
      lifecycle: activation.previousRevision ? OCR_LIFECYCLE.ROLLBACK_AVAILABLE : OCR_LIFECYCLE.AVAILABLE,
      activeRevision: activation.activeRevision,
      previousRevision: activation.previousRevision,
      activatedAt: activation.activatedAt,
      provenance: activation.provenance,
    };
  }

  function bridgeFor(revision) {
    const runtime = revision ? runtimeForRevision(revision) : activeRuntime();
    if (!runtime || !existsSync(runtime.pythonBin)) {
      throw new OcrError(OCR_STATE.RUNTIME_UNAVAILABLE, `No runtime installed for ${providerId}`, {
        revision: revision ?? null,
      });
    }
    const driverArgs = [driverPath, '--provider', providerId, '--models-root', modelRoot];
    // Engines whose weights are stored per revision (rather than a shared model
    // cache) point the driver at the staged revision directory explicitly.
    if (typeof hooks.resolveModelDir === 'function') {
      const modelDir = hooks.resolveModelDir({ revision: runtime.revision, dataRoot });
      if (typeof modelDir === 'string' && modelDir.length > 0) {
        driverArgs.push('--model-dir', modelDir);
      }
    }
    const factory = bridgeFactory ?? ((options) => createRuntimeBridge(options));
    return factory({
      command: runtime.pythonBin,
      args: driverArgs,
      cwd: runtime.base,
      // PYTHONUTF8 keeps Arabic/Urdu text intact on Windows pipes; the driver
      // also pins its own streams, so this is redundancy rather than a crutch.
      // PADDLE_PDX_CACHE_HOME keeps public PaddleX model files inside the
      // external data root, and DISABLE_MODEL_SOURCE_CHECK avoids a network
      // hoster probe when models are already staged locally.
      env: {
        PYTHONNOUSERSITE: '1',
        PYTHONUTF8: '1',
        PYTHONIOENCODING: 'utf-8',
        PADDLE_PDX_CACHE_HOME: join(modelRoot, 'paddlex-cache'),
        DISABLE_MODEL_SOURCE_CHECK: 'True',
      },
    });
  }

  /**
   * A declared unit set is enforced. A LINE-only engine is rejected for PAGE and
   * REGION with `UNSUPPORTED_UNIT` instead of quietly returning a compound
   * result it cannot honestly support.
   */
  function assertUnitSupported(unitType) {
    const supported = metadata.supportedUnitTypes;
    if (supported && !supported.includes(unitType)) {
      throw new OcrError(
        OCR_STATE.UNSUPPORTED_UNIT,
        `${metadata.displayName} does not support ${unitType} recognition; supported units: ${supported.join(', ')}.`,
        { providerId, unitType, supportedUnitTypes: [...supported] },
      );
    }
  }

  const provider = {
    id: providerId,
    displayName: metadata.displayName,
    languages: [...metadata.languages],
    metadata,
    supportedUnitTypes: metadata.supportedUnitTypes ? [...metadata.supportedUnitTypes] : null,
    get version() {
      return engineStore.readActivation(providerId).activeRevision;
    },
    get modelRevision() {
      const activation = engineStore.readActivation(providerId);
      return activation.provenance?.modelRevision ?? activation.activeRevision ?? null;
    },
    runtimeRequirements: metadata.runtimeRequirements,

    isAvailable() {
      const state = status();
      return { ...state, providerId };
    },

    async getCapabilities() {
      const state = status();
      if (!state.ok) return { ...state, providerId, capabilities: [] };
      const probe = await (hooks.probeRuntime ?? probePythonRuntime)({
        command: activeRuntime()?.pythonBin,
        args: [],
        env: { PYTHONNOUSERSITE: '1' },
      });
      return {
        ok: probe.ok,
        providerId,
        lifecycle: state.lifecycle,
        activeRevision: state.activeRevision,
        capabilities: probe.ok ? (probe.info.packages ?? []) : [],
        runtime: probe.ok ? probe.info : null,
        runtimeRequirements: metadata.runtimeRequirements,
      };
    },

    async healthCheck({ signal } = {}) {
      const state = status();
      if (!state.ok) return { ...state, providerId };
      const bridge = bridgeFor();
      try {
        const result = await bridge.request('health', { providerId }, { signal, timeoutMs: 120_000 });
        return { ok: true, providerId, activeRevision: state.activeRevision, runtime: result };
      } catch (error) {
        return {
          ok: false,
          providerId,
          code: error.code ?? OCR_STATE.RUNTIME_UNAVAILABLE,
          message: error.message,
          activeRevision: state.activeRevision,
        };
      } finally {
        await bridge.dispose();
      }
    },

    async recognizePage({ imagePath, pageIndex, language, sourceHash, settingsKey, signal, timeoutMs } = {}) {
      assertUnitSupported('PAGE');
      return await recognize({
        unitType: 'PAGE',
        imagePath,
        pageIndex,
        language,
        sourceHash,
        settingsKey,
        signal,
        timeoutMs,
      });
    },

    async recognizeRegion({ imagePath, region, pageIndex, language, sourceHash, settingsKey, signal } = {}) {
      assertUnitSupported('REGION');
      return await recognize({
        unitType: 'REGION',
        imagePath,
        region,
        pageIndex,
        language,
        sourceHash,
        settingsKey,
        signal,
      });
    },

    /**
     * Line-level recognition. `region` is the optional parent region box in page
     * coordinates, `line` the line box (`regionId`, `lineId`, `box`).
     */
    async recognizeLine({
      imagePath,
      line,
      region = null,
      pageIndex = 0,
      language,
      sourceHash,
      settingsKey = 'default',
      signal,
      timeoutMs,
    } = {}) {
      assertUnitSupported('LINE');
      return await recognize({
        unitType: 'LINE',
        imagePath,
        line,
        region,
        pageIndex,
        language,
        sourceHash,
        settingsKey,
        signal,
        timeoutMs,
      });
    },

    cancel() {
      // Cancellation is expressed through the AbortSignal handed to a request;
      // the bridge forwards an in-band cancel to the live runtime.
      return { ok: true, providerId, cancelMode: 'in-band-signal' };
    },

    async resolveUpstreamRevision({ signal } = {}) {
      if (injectedResolver) return await injectedResolver({ signal });
      if (hooks.resolveUpstreamRevision) return await hooks.resolveUpstreamRevision({ signal });
      return await upstreamResolver.resolveUpstreamHead({
        repository: metadata.officialUpstream,
        branch: 'main',
        signal,
      });
    },

    async createStagedHandle({ revision, stagingDir, signal }) {
      if (hooks.createStagedHandle) return await hooks.createStagedHandle({ revision, stagingDir, signal, provider });
      return provider;
    },

    async stageRevision({ revision, stagingDir, signal }) {
      if (hooks.stageRevision) {
        return await hooks.stageRevision({ revision, stagingDir, signal, provider, runtimeForRevision });
      }
      // Real provisioning: isolated venv + pinned upstream packages. This is the
      // only place a network download of public engine files happens; no user
      // document is ever transmitted.
      const { base, pythonBin } = runtimeForRevision(revision);
      if (existsSync(base)) {
        // Fresh staging only: never merge into a partially provisioned runtime.
        const existing = existsSync(pythonBin);
        if (existing) {
          const artifacts = defaultCollectArtifacts(base);
          return { artifacts, reused: true };
        }
      }
      mkdirSync(base, { recursive: true });
      const python = interpreter ?? 'python';
      const venv = await runCommand(python, ['-m', 'venv', base], { signal });
      if (!venv.ok) {
        throw new OcrError(OCR_STATE.UPDATE_FAILED, `Could not create runtime venv: ${venv.stderr.slice(-300)}`);
      }
      const packages = metadata.runtimeRequirements.installPackages ?? [];
      if (packages.length > 0) {
        const pip = await runCommand(pythonBin, ['-m', 'pip', 'install', '--no-input', ...packages], {
          signal,
          timeoutMs: 60 * 60 * 1000,
        });
        if (!pip.ok) {
          throw new OcrError(OCR_STATE.UPDATE_FAILED, `Package installation failed: ${pip.stderr.slice(-400)}`);
        }
      }
      const artifacts = defaultCollectArtifacts(base);
      return { artifacts, reused: false };
    },

    async verifyArtifacts({ artifacts, stagingDir, signal }) {
      if (hooks.verifyArtifacts) return await hooks.verifyArtifacts({ artifacts, stagingDir, signal });
      const problems = [];
      let checked = 0;
      for (const artifact of artifacts) {
        if (signal?.aborted) {
          problems.push('verification aborted');
          break;
        }
        if (!artifact?.path || !existsSync(artifact.path)) {
          problems.push(`missing artifact: ${artifact?.path ?? '<undefined>'}`);
          continue;
        }
        const actual = sha256OfFile(artifact.path);
        checked += 1;
        if (artifact.sha256 && actual !== artifact.sha256) {
          problems.push(`hash mismatch: ${artifact.path}`);
        }
        if (typeof artifact.size === 'number' && statSync(artifact.path).size !== artifact.size) {
          problems.push(`size mismatch: ${artifact.path}`);
        }
      }
      return { ok: problems.length === 0, checked, problems };
    },

    async smokeTestStaged({ revision, stagingDir, handle, signal }) {
      if (hooks.smokeTestStaged) {
        return await hooks.smokeTestStaged({ revision, stagingDir, handle, signal, provider });
      }
      const { pythonBin } = runtimeForRevision(revision);
      if (!existsSync(pythonBin)) {
        return { ok: false, error: `Staged runtime interpreter missing for ${providerId}@${revision}` };
      }
      const bridge = createRuntimeBridge({
        command: pythonBin,
        args: [driverPath, '--provider', providerId, '--models-root', modelRoot],
        cwd: runtimeForRevision(revision).base,
        env: {
          PYTHONNOUSERSITE: '1',
          PYTHONUTF8: '1',
          PYTHONIOENCODING: 'utf-8',
          PADDLE_PDX_CACHE_HOME: join(modelRoot, 'paddlex-cache'),
          DISABLE_MODEL_SOURCE_CHECK: 'True',
        },
      });
      try {
        const health = await bridge.request('health', { providerId }, { signal, timeoutMs: 180_000 });
        const fixture = await bridge.request(
          'smoke',
          { providerId, languages: [...metadata.languages] },
          { signal, timeoutMs: 300_000 },
        );
        return {
          ok: Boolean(health?.ok !== false && fixture?.ok),
          revision,
          health,
          fixture,
          hardware: fixture?.hardware ?? null,
        };
      } catch (error) {
        return { ok: false, error: error.message, code: error.code ?? OCR_STATE.UPDATE_FAILED };
      } finally {
        await bridge.dispose();
      }
    },
  };

  async function recognize({
    unitType = 'PAGE',
    imagePath,
    region = null,
    line = null,
    pageIndex = 0,
    language,
    sourceHash,
    settingsKey = 'default',
    signal,
    timeoutMs = 15 * 60 * 1000,
  } = {}) {
    if (!metadata.languages.includes(language)) {
      throw new OcrError(
        OCR_STATE.UNAUTHORISED_LANGUAGE,
        `${metadata.displayName} is not authorised for language "${String(language)}".`,
        { language: language ?? null, authorisedLanguages: [...metadata.languages] },
      );
    }
    if (typeof imagePath !== 'string' || !existsSync(imagePath)) {
      throw new OcrError(OCR_STATE.INVALID_INPUT, 'OCR requires an existing rendered page image');
    }
    const state = status();
    if (!state.ok) {
      throw new OcrError(state.code, state.message, { providerId, lifecycle: state.lifecycle });
    }

    const bridge = bridgeFor();
    try {
      const lineOp = unitType === 'LINE' && metadata.documentedInputGranularity === 'line';
      const op = lineOp
        ? 'recognize_line'
        : (unitType === 'LINE' && line?.box) || region
          ? 'recognize_region'
          : 'recognize_page';
      const regionForOp = lineOp ? (region ?? null) : unitType === 'LINE' ? (line?.box ?? region) : region;
      const result = await bridge.request(
        op,
        {
          providerId,
          language,
          imagePath,
          region: regionForOp,
          line,
          pageIndex,
          models: metadata.models?.[language] ?? null,
        },
        { signal, timeoutMs },
      );

      const representations = buildOcrTextRepresentations({
        rawText: result?.rawText ?? '',
        language,
      });
      const tashkeel = verifyTashkeelPreserved({
        rawText: representations.rawText,
        displayText: representations.displayText,
      });

      return {
        ok: true,
        unitType,
        provider: providerId,
        providerVersion: state.activeRevision,
        modelRevision: metadata.models?.[language]?.recognition ?? metadata.modelId ?? null,
        language,
        pageIndex,
        regionId: line?.regionId ?? region?.regionId ?? null,
        lineId: line?.lineId ?? null,
        bbox: line?.box ?? region ?? null,
        sourceHash: sourceHash ?? null,
        settingsKey,
        ...representations,
        blocks: Array.isArray(result?.blocks) ? result.blocks : [],
        confidence: typeof result?.confidence === 'number' ? result.confidence : null,
        confidenceSource: typeof result?.confidence === 'number' ? 'engine' : 'not-supplied',
        tashkeel,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      if (error.code === 'CANCELLED') {
        throw new OcrError(OCR_STATE.CANCELLED, `OCR cancelled for page ${pageIndex}`);
      }
      throw new OcrError(error.code ?? OCR_STATE.OCR_FAILED, `OCR failed: ${error.message}`, {
        providerId,
        pageIndex,
        unitType,
      });
    } finally {
      await bridge.dispose();
    }
  }

  const updateManager = createEngineUpdateManager({ engineStore, provider });

  const composed = {
    ...provider,
    install: async ({ signal } = {}) => {
      const staged = await updateManager.stageUpdate({ signal });
      const activation = updateManager.activateUpdate({ revision: staged.revision });
      return { ...staged, activation };
    },
    checkForUpdates: (options) => updateManager.checkForUpdates(options),
    stageUpdate: (options) => updateManager.stageUpdate(options),
    activateUpdate: (options) => updateManager.activateUpdate(options),
    rollback: () => updateManager.rollback(),
    updateNow: (options) => updateManager.updateNow(options),
    getUpdateStatus: () => updateManager.getUpdateStatus(),
    getStatus: () => status(),
  };

  // `spread` would freeze these getters into stale nulls at construction time,
  // which would silently disable revision-based cache invalidation after an
  // engine update. Re-attach them as live accessors.
  for (const member of ['version', 'modelRevision']) {
    Object.defineProperty(composed, member, {
      enumerable: true,
      configurable: true,
      get: () => provider[member],
    });
  }

  // Composition invariant: the object the rest of the application receives must
  // satisfy the full contract, including the update surface. A staging flow that
  // silently drops a member cannot be activated.
  composed.contractSelfCheck = assertProviderContract(composed);
  if (!composed.contractSelfCheck.ok) {
    throw new OcrError(
      OCR_STATE.RUNTIME_UNAVAILABLE,
      `OCR provider ${providerId} failed its own contract check: ${composed.contractSelfCheck.problems.join('; ')}`,
    );
  }
  return composed;
}
