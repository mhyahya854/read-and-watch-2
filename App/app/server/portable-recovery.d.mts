export type PortableRecoveryStatus =
  | 'HEALTHY'
  | 'RECOVERED'
  | 'RECOVERY_REQUIRED';

export type PortableRecoveryState = {
  status: PortableRecoveryStatus;
  code: string;
  reasons: string[];
  details: Record<string, unknown>;
  actions: string[];
  counts: { read: number; watch: number; total: number } | null;
  partial: boolean;
  limitations: string[];
  mutationBlocked: boolean;
  message: string;
  metrics: Record<string, unknown>;
};

export const PORTABLE_RECOVERY_STATUS: {
  HEALTHY: 'HEALTHY';
  RECOVERED: 'RECOVERED';
  RECOVERY_REQUIRED: 'RECOVERY_REQUIRED';
};

export const PORTABLE_RECOVERY_CODES: Record<string, string>;

export function publicRecoveryState(value: unknown): PortableRecoveryState | null;

export function makeRecoveryRequiredState(
  code: string,
  options?: {
    reasons?: string[];
    details?: Record<string, unknown>;
    actions?: string[];
    metrics?: Record<string, unknown>;
  },
): PortableRecoveryState;

export function runPortableStartupRecovery(options: {
  root: string;
  databasePath: string;
  userDataRoot?: string | null;
  now?: string;
}): Promise<PortableRecoveryState>;

export function assertPortableMutationsAllowed(root: string): void;
