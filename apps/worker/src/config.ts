const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;
const MIN_INTERVAL_MS = 60 * 1000;
const MAX_INTERVAL_MS = 2_147_483_647;

export function parseCollectorInterval(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return DEFAULT_INTERVAL_MS;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_INTERVAL_MS;
  return Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, Math.trunc(parsed)));
}
