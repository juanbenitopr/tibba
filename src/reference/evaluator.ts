import type { LevelKey, BiomarkerEntry } from "./ReferenceProvider";

// Colores recomendados (Tailwind)
export const LEVEL_COLORS: Record<LevelKey, string> = {
  excelente: "bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-400/40",
  bueno:     "bg-sky-500/15 text-sky-700 ring-1 ring-sky-400/40",
  regular:   "bg-amber-500/15 text-amber-800 ring-1 ring-amber-400/40",
  malo:      "bg-rose-500/15 text-rose-700 ring-1 ring-rose-400/40",
};

// Evalúa una regla textual con comparadores comunes
// Soporta: "<", ">", "≤", "≥", "x - y", "a o >b", "a / b", etc.
function matchSingleRule(rule: string, value: number): boolean {
  const r = rule.replace(",", ".").trim();

  // 1) Rangos "a - b"
  const range = r.match(/^(-?\d+(\.\d+)?)\s*[-–]\s*(-?\d+(\.\d+)?)/);
  if (range) {
    const a = parseFloat(range[1]);
    const b = parseFloat(range[3]);
    return value >= Math.min(a, b) && value <= Math.max(a, b);
  }

  // 2) Comparadores
  const cmp = r.match(/^([<>]=?|≥|≤)\s*(-?\d+(\.\d+)?)/i);
  if (cmp) {
    const op = cmp[1];
    const num = parseFloat(cmp[2]);
    switch (op) {
      case "<":  return value < num;
      case ">":  return value > num;
      case "<=":
      case "≤":  return value <= num;
      case ">=":
      case "≥":  return value >= num;
    }
  }

  // 3) Valores simples (= nº)
  const exact = r.match(/^(-?\d+(\.\d+)?)$/);
  if (exact) return value === parseFloat(exact[1]);

  return false;
}

// Divide por conectores "o" "/" ";" y evalúa como OR
export function matchRule(rule: string | null, value: number): boolean {
  if (!rule) return false;
  // normalizar separadores
  const parts = rule
    .replace(/\s*o\s*/gi, "|")
    .replace(/\s*\/\s*/g, "|")
    .replace(/\s*;\s*/g, "|")
    .split("|")
    .map(s => s.trim())
    .filter(Boolean);

  return parts.some(part => matchSingleRule(part, value));
}

export function pickSexRule(entry: BiomarkerEntry, level: LevelKey, sex: "H" | "M" | "U" = "U"): string | null {
  const set = entry.levels[level];
  if (sex === "H" && set.male) return set.male;
  if (sex === "M" && set.female) return set.female;
  return set.unisex ?? set.male ?? set.female ?? null;
}

export function computeLevel(
  entry: BiomarkerEntry,
  value: number,
  sex: "H" | "M" | "U" = "U"
): LevelKey | null {
  // Orden de prioridad
  const order: LevelKey[] = ["excelente", "bueno", "regular", "malo"];
  for (const lvl of order) {
    const rule = pickSexRule(entry, lvl, sex);
    if (rule && matchRule(rule, value)) return lvl;
  }
  // Si nada matchea y existe "malo" tipo “<x o >y”, marcamos "malo" si aplica
  const bad = pickSexRule(entry, "malo", sex);
  if (bad && matchRule(bad, value)) return "malo";
  return null;
}
