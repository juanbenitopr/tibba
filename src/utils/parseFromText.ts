import { SUPPORTED_BIOMARKERS } from './biomarkerMap'
import type { BiomarkerRecord } from '../types'

// Very simple number+unit capture like: "Glucose ........ 92 mg/dL"
const numberUnit = /([-+]?\d+(?:[\.,]\d+)?)(?:\s*)([a-zA-Z%/µμ·\-]*)?/

function isBoundary(char: string | undefined) {
  if (!char) return true
  return !/[a-z0-9]/.test(char)
}

function findAliasMatch(line: string, alias: string) {
  let searchStart = 0
  while (searchStart <= line.length) {
    const idx = line.indexOf(alias, searchStart)
    if (idx === -1) return null
    const before = idx === 0 ? ' ' : line[idx - 1]
    const after = idx + alias.length >= line.length ? ' ' : line[idx + alias.length]
    if (isBoundary(before) && isBoundary(after)) {
      return { start: idx, end: idx + alias.length }
    }
    searchStart = idx + 1
  }
  return null
}

function findValueMatch(text: string) {
  const numberUnitGlobal = new RegExp(numberUnit.source, 'g')
  let match: RegExpExecArray | null
  while ((match = numberUnitGlobal.exec(text)) !== null) {
    const idx = match.index
    const prevChar = idx === 0 ? ' ' : text[idx - 1]
    if (!isBoundary(prevChar)) continue
    return match
  }
  return null
}

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

  const aliasEntries = Object.entries(aliasToName).sort((a, b) => b[0].length - a[0].length)
  const skipForCanonical: Record<string, (line: string) => boolean> = {
    Transferrina: (line) => /\bsaturacion\b/.test(line),
  }

  for (const line of lines) {
    // try to find any alias in the line, prioritising longer (more specific) aliases
    for (const [alias, canonical] of aliasEntries) {
      const match = findAliasMatch(line, alias)
      if (!match) continue
      const shouldSkip = skipForCanonical[canonical as keyof typeof skipForCanonical]
      if (shouldSkip?.(line)) {
        continue
      }

      // Only consider numbers that appear after the matched biomarker name to avoid table indices
      const tail = line.slice(match.end)
      const m = findValueMatch(tail)
      if (!m) continue

      const rawVal = m[1].replace(',', '.')
      const numericValue = Number(rawVal)
      const value = Number.isNaN(numericValue) ? rawVal : numericValue
      const units = (m[2] || '').trim() || undefined
      const category = SUPPORTED_BIOMARKERS[canonical]?.category
      if (!results.some(r => r.biomarker === canonical)) {
        results.push({ biomarker: canonical, value, units, date, category })
      }
      break
    }
  }
  return results
}
