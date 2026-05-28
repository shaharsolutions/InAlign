export function clampProgress(value) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return 0;
  return Math.max(0, Math.min(100, parsed));
}

export function getDisplayProgress(progress, status) {
  if (status === 'completed') return 100;
  const parsed = Number.parseInt(progress, 10);
  if (Number.isNaN(parsed) || parsed < 10) return null;
  return clampProgress(parsed);
}
