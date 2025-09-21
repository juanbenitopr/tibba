import { SUPPORTED_BIOMARKERS } from './biomarkerMap'
import type { BiomarkerRecord } from '../types'

// Very simple number+unit capture like: "Glucose ........ 92 mg/dL"
const numberUnit = /([-+]?\d+(?:[\.,]\d+)?)(?:\s*)([a-zA-Z%/µμ·\-]*)?/

function normalize(s: string) {
  return s
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9/%\.\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseBiomarkersFromFreeText(text: string, date?: string): BiomarkerRecord[] {
  const lines = text.split(/\n|\r|\r\n/).map(l => normalize(l.trim())).filter(Boolean)

  const results: BiomarkerRecord[] = []
  // Create lookup of alias -> canonical name
  const aliasToName: Record<string, string> = {}
  for (const [name, meta] of Object.entries(SUPPORTED_BIOMARKERS)) {
    for (const alias of meta.aliases) {
      aliasToName[normalize(alias)] = name
    }
    aliasToName[normalize(name)] = name
  }

  for (const line of lines) {
    // try to find any alias in the line
    for (const [alias, canonical] of Object.entries(aliasToName)) {
      if (line.includes(` ${alias} `) || line.startsWith(alias + ' ') || line.endsWith(' ' + alias) || line === alias || line.replace(/[:.-]+$/,'') === alias) {
        // Find number + optional unit on the line
        const m = line.match(numberUnit)
        if (m) {
          const rawVal = m[1].replace(',', '.')
          const value = isNaN(Number(rawVal)) ? rawVal : Number(rawVal)
          const units = (m[2] || '').trim() || undefined
          const category = SUPPORTED_BIOMARKERS[canonical]?.category
          if (!results.some(r => r.biomarker === canonical)) {
            results.push({ biomarker: canonical, value, units, date, category })
          }
        }
      }
    }
  }
  return results
}
