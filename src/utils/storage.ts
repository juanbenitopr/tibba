import { ReferenceData } from "src/types"

// utils/storage.ts
export interface Analysis {
  id: string
  name: string
  data: any
}

const STORAGE_KEY = "analyses"

export function getAnalyses(): Analysis[] {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored ? JSON.parse(stored) : []
}

export function saveAnalysis(analysis: Analysis) {
  const analyses = getAnalyses()
  const updated = [...analyses, analysis]
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
}

export function removeAnalysis(id: string) {
  const analyses = getAnalyses().filter(a => a.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(analyses))
}

const REF_STORAGE_KEY = "reference_ranges"

export async function loadReference(): Promise<ReferenceData> {
  const local = localStorage.getItem(REF_STORAGE_KEY)
  if (local) {
    try {
      return JSON.parse(local) as ReferenceData
    } catch {
      // fall through and fetch fresh copy
    }
  }
  const res = await fetch("/reference_ranges.dashboard.json")
  const json = (await res.json()) as ReferenceData
  localStorage.setItem(REF_STORAGE_KEY, JSON.stringify(json))
  return json
}