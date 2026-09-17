/**
 * Transactional OCR engine update manager — Phase 17.
 *
 * One-button upstream update, with no in-place mutation of a working runtime:
 *
 *   check upstream -> stage candidate -> verify artifact integrity
 *     -> run staged runtime health check -> run smoke fixtures
 *     -> validate adapter contract -> atomically switch activation pointer
 *     -> otherwise keep the current revision, record the failure, allow retry
 *
 * The active revision is never overwritten. Activation only happens after a
 * passing verification record exists inside the staged revision directory, so a
 * failed or interrupted update can never leave a half-installed engine live.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { assertProviderContract, OcrError, OCR_STATE } from './ocr-contract.mjs';

const VERIFICATION_FILE = 'verification.json';
const ARTIFACT_MANIFEST_FILE = 'artifacts.json';

export function createEngineUpdateManager({ engineStore, provider }) {
  if (!engineStore) throw new OcrError(OCR_STATE.INVALID_INPUT, 'Update manager requires an engine store');
  if (!provider?.id) throw new OcrError(OCR_STATE.INVALID_INPUT, 'Update manager requires a provider');

  const providerId = provider.id;

  function verificationPath(revision) {
    return join(engineStore.versionDir(providerId, revision), VERIFICATION_FILE);
  }

  function readVerification(revision) {
    const path = verificationPath(revision);
    if (!existsSync(path)) return null;
    try {
      return JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      return null;
    }
  }

  function writeVerification(revision, record) {
    const path = verificationPath(revision);
    writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
    return record;
  }

  function readArtifactManifest(revision) {
    const path = join(engineStore.versionDir(providerId, revision), ARTIFACT_MANIFEST_FILE);
    if (!existsSync(path)) return null;
    try {
      return JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      return null;
    }
  }

  function writeArtifactManifest(revision, manifest) {
    const path = join(engineStore.versionDir(providerId, revision), ARTIFACT_MANIFEST_FILE);
    writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    return manifest;
  }

  async function checkForUpdates({ signal } = {}) {
    const active = engineStore.readActivation(providerId);
    const candidate = await provider.resolveUpstreamRevision({ signal });
    if (!candidate?.revision) {
      throw new OcrError(OCR_STATE.UPDATE_FAILED, `Could not resolve an upstream revision for ${providerId}`);
    }
    const installed = active.activeRevision;
    if (!installed) {
      return {
        providerId,
        status: 'not-installed',
        installedRevision: null,
        availableRevision: candidate.revision,
        provenance: candidate.provenance ?? null,
      };
    }
    const status = installed === candidate.revision ? 'up-to-date' : 'update-available';
    return {
      providerId,
      status,
      installedRevision: installed,
      availableRevision: candidate.revision,
      provenance: candidate.provenance ?? null,
    };
  }

  /**
   * Stages and verifies a candidate revision. Activation is deliberately a
   * separate step so callers can inspect evidence before switching.
   */
  async function stageUpdate({ revision, provenance = null, signal } = {}) {
    const target = revision ?? (await provider.resolveUpstreamRevision({ signal }))?.revision;
    if (!target) {
      throw new OcrError(OCR_STATE.UPDATE_FAILED, `No candidate revision to stage for ${providerId}`);
    }

    const active = engineStore.readActivation(providerId);
    if (active.activeRevision === target && engineStore.hasRevision(providerId, target)) {
      const existing = readVerification(target);
      if (existing?.ok) {
        return {
          providerId,
          status: 'already-staged',
          revision: target,
          activeRevision: active.activeRevision,
          activated: false,
          verification: existing,
        };
      }
    }

    // A partial previous attempt for the same revision is discarded rather than
    // merged, so a corrupt download can never be resumed into a valid engine.
    if (engineStore.hasRevision(providerId, target)) {
      engineStore.removeVersion(providerId, target);
    }
    const stagingDir = engineStore.createStagingDir(providerId, target);

    let manifest;
    try {
      manifest = await provider.stageRevision({ revision: target, stagingDir, signal });
    } catch (error) {
      engineStore.recordFailure(providerId, {
        revision: target,
        phase: 'stage',
        message: error.message,
        code: error.code ?? OCR_STATE.UPDATE_FAILED,
      });
      engineStore.removeVersion(providerId, target);
      throw new OcrError(OCR_STATE.UPDATE_FAILED, `Staging ${providerId}@${target} failed: ${error.message}`, {
        revision: target,
      });
    }

    const artifacts = Array.isArray(manifest?.artifacts) ? manifest.artifacts : [];
    writeArtifactManifest(target, { providerId, revision: target, provenance, artifacts });

    // 1. Integrity: every artifact must exist and match its recorded hash.
    const integrity = provider.verifyArtifacts
      ? await provider.verifyArtifacts({ revision: target, stagingDir, artifacts, signal })
      : { ok: true, checked: 0, problems: [] };

    if (!integrity.ok) {
      engineStore.recordFailure(providerId, {
        revision: target,
        phase: 'integrity',
        message: 'Artifact integrity verification failed',
        problems: integrity.problems,
      });
      engineStore.removeVersion(providerId, target);
      throw new OcrError(
        OCR_STATE.UPDATE_FAILED,
        `Staged ${providerId}@${target} failed integrity verification. Current revision retained.`,
        { problems: integrity.problems },
      );
    }

    // 2. Adapter contract validation against the staged runtime. The staged
    //    handle must satisfy the capability surface; the update surface belongs
    //    to the manager itself and is verified where the provider is composed.
    const stagedProvider = await provider.createStagedHandle({ revision: target, stagingDir, signal });
    const contract = assertProviderContract(stagedProvider ?? provider, { requireUpdateSurface: false });
    contract.declaredUpdateSurface = provider.contractSelfCheck ?? null;

    // 3. Health check + smoke fixtures executed inside the staged runtime.
    const smoke = contract.ok
      ? await provider.smokeTestStaged({ revision: target, stagingDir, handle: stagedProvider, signal })
      : { ok: false, error: `Adapter contract violation: ${contract.problems.join('; ')}` };

    const verification = writeVerification(target, {
      providerId,
      revision: target,
      verifiedAt: new Date().toISOString(),
      provenance,
      integrity,
      contract,
      smoke,
      ok: Boolean(integrity.ok && contract.ok && smoke?.ok),
    });

    if (!verification.ok) {
      engineStore.recordFailure(providerId, {
        revision: target,
        phase: 'smoke',
        message: smoke?.error ?? 'Staged runtime failed smoke verification',
        contractProblems: contract.problems ?? [],
      });
      engineStore.removeVersion(providerId, target);
      throw new OcrError(
        OCR_STATE.UPDATE_FAILED,
        `Staged ${providerId}@${target} failed smoke verification. Current revision retained.`,
        { revision: target, smoke: smoke ?? null },
      );
    }

    engineStore.writeEvidence(`${providerId}-${target}-verification`, verification);
    return {
      providerId,
      status: 'staged',
      revision: target,
      activeRevision: active.activeRevision,
      activated: false,
      verification,
    };
  }

  /** Atomically switches the activation pointer. Refuses unverified revisions. */
  function activateUpdate({ revision } = {}) {
    const target = revision ?? engineStore.readActivation(providerId).activeRevision;
    if (!target) {
      throw new OcrError(OCR_STATE.MODEL_NOT_INSTALLED, `No revision to activate for ${providerId}`);
    }
    const verification = readVerification(target);
    if (!verification?.ok) {
      throw new OcrError(
        OCR_STATE.UPDATE_FAILED,
        `Refusing to activate unverified ${providerId}@${target}. Current revision retained.`,
        { revision: target },
      );
    }
    const manifest = readArtifactManifest(target);
    const activation = engineStore.writeActivation(providerId, {
      revision: target,
      provenance: verification.provenance ?? manifest?.provenance ?? null,
    });
    engineStore.clearFailure(providerId);
    engineStore.writeEvidence(`${providerId}-activation`, {
      ...activation,
      activatedFrom: verification.verifiedAt,
    });
    return { providerId, status: 'active', ...activation };
  }

  async function updateNow({ signal } = {}) {
    const check = await checkForUpdates({ signal });
    if (check.status === 'up-to-date') {
      return { ...check, staged: false, activated: false };
    }
    const staged = await stageUpdate({ revision: check.availableRevision, provenance: check.provenance, signal });
    const activation = activateUpdate({ revision: staged.revision });
    return { ...check, staged: true, activated: true, activation };
  }

  function rollback() {
    const now = engineStore.readActivation(providerId);
    if (!now.previousRevision) {
      throw new OcrError(OCR_STATE.UPDATE_FAILED, `No previous revision to roll back to for ${providerId}`);
    }
    if (!engineStore.hasRevision(providerId, now.previousRevision)) {
      throw new OcrError(
        OCR_STATE.UPDATE_FAILED,
        `Previous revision ${now.previousRevision} is no longer present on disk`,
      );
    }
    const target = now.previousRevision;
    const swappedBack = engineStore.writeActivation(providerId, {
      revision: target,
      provenance: now.provenance,
      keepPrevious: false,
    });
    engineStore.writeEvidence(`${providerId}-rollback`, {
      from: now.activeRevision,
      to: target,
      rolledBackAt: swappedBack.activatedAt,
    });
    return { providerId, status: 'rolled-back', from: now.activeRevision, to: target };
  }

  function getUpdateStatus() {
    const activation = engineStore.readActivation(providerId);
    return {
      providerId,
      activeRevision: activation.activeRevision,
      previousRevision: activation.previousRevision,
      activatedAt: activation.activatedAt,
      provenance: activation.provenance,
      lastFailure: engineStore.readFailure(providerId),
      revisionsOnDisk: engineStore.listRevisions(providerId),
      canRollback: Boolean(activation.previousRevision),
    };
  }

  return {
    providerId,
    checkForUpdates,
    stageUpdate,
    activateUpdate,
    updateNow,
    rollback,
    getUpdateStatus,
    readVerification,
  };
}
