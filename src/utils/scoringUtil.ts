import { BiomarkerRow, LEVEL_SCORE } from "src/types"

export function rowScore(r: BiomarkerRow): number {
  if (r.referenceLevel) {
    return LEVEL_SCORE[r.referenceLevel]
  }

  // 1 = perfecto (en rango o sin referencia), 0 = muy mal
  if (r.refLow == null && r.refHigh == null) return 1
  const low = r.refLow ?? -Infinity
  const high = r.refHigh ?? Infinity
  const v = r.value
  if (v >= low && v <= high) return 1

  // Penalización por distancia al rango normalizada por el ancho del rango (o por el valor medio si no hay ancho)
  const width = isFinite(low) && isFinite(high) ? Math.max(1e-9, high - low) : Math.max(1e-9, Math.abs(v) * 0.2)
  const dist = v < low ? low - v : v - high
  const penalty = dist / width // 1 = una "anchura de rango" fuera
  const score = Math.max(0, 1 - penalty)
  return score
}

export function colorByScore(score: number) {
  if (score >= 0.85) return { bg: "bg-green-100", text: "text-green-700", ring: "#16a34a" }
  if (score >= 0.6) return { bg: "bg-amber-100", text: "text-amber-700", ring: "#f59e0b" }
  return { bg: "bg-rose-100", text: "text-rose-700", ring: "#e11d48" }
}

export function computeScores(rows: BiomarkerRow[]) {
  const byCat: Record<string, BiomarkerRow[]> = {}
  const cats = ["cardiovascular", "metabolic", "immune", "hormonal", "general"]

  rows.forEach((r) => {
    const c = cats.includes(r.category || "") ? (r.category as string) : "general"
    byCat[c] ??= []
    byCat[c].push(r)
  })

  const catScores = cats.map((c) => {
    const arr = byCat[c] ?? []
    const score = arr.length ? arr.map(rowScore).reduce((a, b) => a + b, 0) / arr.length : 1
    return { category: c, score }
  })

  const overall = rows.length ? rows.map(rowScore).reduce((a, b) => a + b, 0) / rows.length : 1
  return { overall, catScores }
}