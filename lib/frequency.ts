export function parseFrequencyToMHz(raw: string): number | null {
  const normalized = raw.trim().toLowerCase().replace(",", ".").replace(/\s+/g, "");
  if (!normalized) return null;

  const match = normalized.match(/^([0-9]+(?:\.[0-9]+)?)(ghz|g|mhz|m|khz|k|hz)?$/i);
  if (!match) return null;

  const value = Number(match[1]);
  const unit = match[2] ?? "mhz";
  if (!Number.isFinite(value)) return null;

  switch (unit) {
    case "ghz":
    case "g":
      return value * 1000;
    case "khz":
    case "k":
      return value / 1000;
    case "hz":
      return value / 1_000_000;
    default:
      return value;
  }
}

export function formatMHz(value: number): string {
  if (value >= 1000) {
    const ghz = value / 1000;
    return `${ghz.toFixed(ghz >= 10 ? 2 : 3)} GHz`;
  }
  if (value >= 10) return `${value.toFixed(value % 1 === 0 ? 0 : 2)} MHz`;
  return `${value.toFixed(3)} MHz`;
}
