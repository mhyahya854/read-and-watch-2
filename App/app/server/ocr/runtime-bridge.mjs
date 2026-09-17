/**
 * OCR runtime bridge — Phase 17.
 *
 * The OCR engines are external Python runtimes. Read & Watch never imports
 * Python packages into the Electron/Node dependency tree.
 *
 * Transport choice: a supervised child process speaking newline-delimited JSON
 * over stdin/stdout.
 *   - No network listener is created, so there is nothing to bind publicly and
 *     no localhost service to secure.
 *   - A per-session token is handed to the child through argv and must be echoed
 *     on every request, so a stray process cannot drive the engine.
 *   - Cancellation is an in-band message, so a long page OCR can be abandoned
 *     without killing the runtime.
 *   - `dispose()` terminates the child, so app shutdown leaves no orphan.
 *
 * The bridge is language-agnostic and injectable: tests drive it with a Node
 * fixture process instead of a multi-gigabyte model runtime.
 */

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';

export const BRIDGE_PROTOCOL_VERSION = 1;

export class RuntimeBridgeError extends Error {
  constructor(message, { code = 'RUNTIME_UNAVAILABLE', cause = null } = {}) {
    super(message);
    this.name = 'RuntimeBridgeError';
    this.code = code;
    if (cause) this.cause = cause;
  }
}

/**
 * @param {object} options
 * @param {string} options.command        Executable (python interpreter path).
 * @param {string[]} options.args         argv appended after `command`.
 * @param {string} [options.cwd]          Working directory for the child.
 * @param {object} [options.env]          Extra environment variables.
 * @param {number} [options.requestTimeoutMs] Default timeout per request.
 * @param {number} [options.shutdownGraceMs]  Grace before SIGKILL on dispose.
 * @param {boolean} [options.showWindow]  Windows: keep the child window hidden.
 */
export function createRuntimeBridge({
  command,
  args,
  cwd,
  env = {},
  requestTimeoutMs = 15 * 60 * 1000,
  shutdownGraceMs = 2000,
  showWindow = false,
}) {
  if (typeof command !== 'string' || command.length === 0) {
    throw new RuntimeBridgeError('Runtime bridge requires a command', { code: 'INVALID_INPUT' });
  }

  const argv = Array.isArray(args) ? args : [];
  const sessionToken = randomBytes(24).toString('hex');
  const pending = new Map();
  let child = null;
  let reader = null;
  let ready = null;
  let readyPromise = null;
  let disposed = false;
  let nextId = 1;
  let exitReason = null;
  const stderrTail = [];

  function failAll(error) {
    for (const [, entry] of pending) {
      entry.settle(error);
    }
    pending.clear();
  }

  function rememberStderr(chunk) {
    stderrTail.push(chunk);
    while (stderrTail.length > 40) stderrTail.shift();
  }

  function handleLine(line) {
    const trimmed = line.trim();
    if (trimmed.length === 0) return;
    let message;
    try {
      message = JSON.parse(trimmed);
    } catch {
      rememberStderr(`unparsable runtime output: ${trimmed.slice(0, 200)}`);
      return;
    }
    if (message.type === 'ready' && !ready) {
      ready = message;
      return;
    }
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.ok) {
      entry.settle(null, message.result);
    } else {
      const code = message.error?.code || 'OCR_FAILED';
      entry.settle(
        new RuntimeBridgeError(message.error?.message || 'Runtime reported failure', { code }),
      );
    }
  }

  function start() {
    if (disposed) {
      return Promise.reject(new RuntimeBridgeError('Runtime bridge is disposed'));
    }
    if (child) return readyPromise;

    try {
      child = spawn(command, [...argv, '--token', sessionToken, '--protocol', String(BRIDGE_PROTOCOL_VERSION)], {
        cwd,
        env: { ...process.env, ...env },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: showWindow === true ? false : true,
      });
    } catch (error) {
      child = null;
      return Promise.reject(
        new RuntimeBridgeError(`Failed to spawn OCR runtime: ${error.message}`, { cause: error }),
      );
    }

    reader = createInterface({ input: child.stdout });
    reader.on('line', handleLine);
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => rememberStderr(String(chunk)));

    child.on('error', (error) => {
      exitReason = `spawn error: ${error.message}`;
      failAll(new RuntimeBridgeError(`OCR runtime error: ${error.message}`, { cause: error }));
      child = null;
    });

    child.on('exit', (code, signal) => {
      exitReason = `exited code=${code} signal=${signal ?? 'none'}`;
      if (!disposed) {
        failAll(
          new RuntimeBridgeError(
            `OCR runtime terminated unexpectedly (${exitReason})${
              stderrTail.length ? `: ${stderrTail.join('').trim().slice(-400)}` : ''
            }`,
          ),
        );
      }
      child = null;
      reader?.close();
      reader = null;
    });

    readyPromise = new Promise((resolve, reject) => {
      const deadline = setTimeout(() => {
        reject(
          new RuntimeBridgeError(
            `OCR runtime did not report ready within ${requestTimeoutMs}ms${
              stderrTail.length ? `: ${stderrTail.join('').trim().slice(-400)}` : ''
            }`,
          ),
        );
      }, requestTimeoutMs);
      const poll = setInterval(() => {
        if (ready) {
          clearInterval(poll);
          clearTimeout(deadline);
          resolve(ready);
        } else if (!child) {
          clearInterval(poll);
          clearTimeout(deadline);
          reject(new RuntimeBridgeError(`OCR runtime failed to start (${exitReason ?? 'unknown'})`));
        }
      }, 10);
      if (typeof poll.unref === 'function') poll.unref();
    });
    return readyPromise;
  }

  async function request(op, payload = {}, { timeoutMs = requestTimeoutMs, signal } = {}) {
    await start();
    if (signal?.aborted) {
      throw new RuntimeBridgeError('Request cancelled before dispatch', { code: 'CANCELLED' });
    }
    const id = nextId++;
    const line = `${JSON.stringify({ id, op, token: sessionToken, payload })}\n`;

    return await new Promise((resolve, reject) => {
      let timer = null;
      let abortHandler = null;

      const settle = (error, result) => {
        if (timer) clearTimeout(timer);
        if (abortHandler && signal) signal.removeEventListener('abort', abortHandler);
        if (error) reject(error);
        else resolve(result);
      };

      pending.set(id, { settle });

      timer = setTimeout(() => {
        pending.delete(id);
        settle(new RuntimeBridgeError(`OCR runtime request "${op}" timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      if (signal) {
        abortHandler = () => {
          if (!pending.has(id)) return;
          pending.delete(id);
          // Best-effort in-band cancel; the runtime decides how to unwind.
          try {
            child?.stdin?.write(`${JSON.stringify({ op: 'cancel', token: sessionToken, payload: { targetId: id } })}\n`);
          } catch {
            // The runtime may already be gone; the rejection below is what matters.
          }
          settle(new RuntimeBridgeError('Request cancelled', { code: 'CANCELLED' }));
        };
        signal.addEventListener('abort', abortHandler, { once: true });
      }

      try {
        child.stdin.write(line);
      } catch (error) {
        pending.delete(id);
        settle(new RuntimeBridgeError(`Failed to write to OCR runtime: ${error.message}`, { cause: error }));
      }
    });
  }

  async function dispose() {
    if (disposed) return;
    disposed = true;
    failAll(new RuntimeBridgeError('OCR runtime shut down', { code: 'RUNTIME_UNAVAILABLE' }));
    const target = child;
    child = null;
    reader?.close();
    reader = null;
    if (!target) return;
    await new Promise((resolve) => {
      const done = () => resolve();
      target.once('exit', done);
      try {
        target.stdin?.end();
        target.kill('SIGTERM');
      } catch {
        resolve();
        return;
      }
      const force = setTimeout(() => {
        try {
          target.kill('SIGKILL');
        } catch {
          // Already gone.
        }
        resolve();
      }, shutdownGraceMs);
      if (typeof force.unref === 'function') force.unref();
    });
  }

  return {
    sessionToken,
    start,
    request,
    dispose,
    get isRunning() {
      return child !== null;
    },
    get pid() {
      return child?.pid ?? null;
    },
    get stderrTail() {
      return stderrTail.join('');
    },
  };
}
