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

export type BiomarkerRow = {
  name: string
  value: number
  unit?: string
  refLow?: number | null
  refHigh?: number | null
  category?: string
}

export interface ReferenceData {
  version: number;
  biomarkers: any[];
  by_id: Record<string, any>;
}
