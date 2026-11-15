export function formatLapTime(seconds: number): string {
  const negative = seconds < 0;
  const abs = Math.abs(seconds);
  const minutes = Math.floor(abs / 60);
  const secs = abs - minutes * 60;
  const text = `${minutes}:${secs.toFixed(2).padStart(5, "0")}`;
  return negative ? `-${text}` : text;
}

export function formatDelta(seconds: number): string {
  if (!Number.isFinite(seconds)) return "";
  if (Math.abs(seconds) < 0.005) return "0.00";
  const sign = seconds > 0 ? "+" : "-";
  return `${sign}${Math.abs(seconds).toFixed(2)}`;
}

export function formatSpeed(kmh: number): string {
  if (!Number.isFinite(kmh)) return "";
  return `${kmh.toFixed(0)} km/h`;
}
