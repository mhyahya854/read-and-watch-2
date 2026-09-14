import type { Plugin } from 'vite';
import type { PortabilityStore } from './portability-store.d.mts';

export interface PortabilityPluginOptions {
  libraryDatabasePath?: string;
  libraryRoot?: string;
  userDataRoot?: string;
  searchStore?: unknown;
  portabilityStore?: PortabilityStore;
}

export function portabilityPlugin(options?: PortabilityPluginOptions): Plugin;
export function createPortabilityVitePlugin(options: PortabilityPluginOptions): Plugin;
