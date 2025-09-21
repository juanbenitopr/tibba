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