import type { FrequencyBand } from "./types";

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[‑–—]/g, "-")
    .replace(/,/g, ".")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumberToken(token: string): number | null {
  const cleaned = token.replace(/\s/g, "");
  const match = cleaned.match(/^([0-9]+(?:\.[0-9]+)?)(ghz|g|mhz|m)?$/i);
  if (!match) return null;
  let value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  const unit = (match[2] || "mhz").toLowerCase();
  if (unit === "ghz" || unit === "g") value *= 1000;
  return value;
}

export function bandMatchesQuery(band: FrequencyBand, query: string) {
  const q = normalize(query);
  if (!q) return true;

  const haystack = normalize([
    band.entityName,
    band.bandName,
    band.category,
    band.purpose,
    band.technology ?? "",
    band.description,
    ...band.tags,
    `${band.startMHz}`,
    `${band.endMHz}`,
    `${band.startMHz}-${band.endMHz} MHz`,
  ].join(" "));

  const tokens = q.split(" ").filter(Boolean);

  return tokens.every((token) => {
    const asFreq = parseNumberToken(token);
    if (asFreq !== null && asFreq >= band.startMHz && asFreq <= band.endMHz) return true;
    return haystack.includes(token);
  });
}
