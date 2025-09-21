export type BiomarkerRecord = {
  biomarker: string
  value: number | string
  units?: string
  date?: string
  category?: 'cardiovascular' | 'metabolic' | 'immune' | 'hormonal' | 'general' | string
}

export type Analysis = {
  id: string
  name: string
  data: any
  createdAt?: string
}

export type LevelKey = "excelente" | "bueno" | "regular" | "malo"

export const LEVEL_BADGE_CLASSES: Record<LevelKey, string> = {
  excelente: "bg-emerald-100 text-emerald-700",
  bueno: "bg-sky-100 text-sky-700",
  regular: "bg-amber-100 text-amber-800",
  malo: "bg-rose-100 text-rose-700",
}

export const LEVEL_SCORE: Record<LevelKey, number> = {
  excelente: 1,
  bueno: 0.85,
  regular: 0.6,
  malo: 0.2,
}

export const LEVEL_ORDER: LevelKey[] = ["excelente", "bueno", "regular", "malo"]
export type Sex = "U"

export type SexRules = { unisex: string | null; male: string | null; female: string | null }
export type BiomarkerRef = {
  id: string
  name: string
  units: string | null
  category: "cardiovascular" | "metabolic" | "immune" | "hormonal" | "general"
  levels: Record<LevelKey, SexRules>
  raw: Record<LevelKey, string>
}
export type BiomarkerRow = {
  name: string
  value: number
  unit?: string
  refLow?: number | null
  refHigh?: number | null
  category?: string
  referenceLevel?: LevelKey | null
  referenceText?: string | null
}
export interface ReferenceData {
  version: number;
  biomarkers: any[];
  by_id: Record<string, any>;
}