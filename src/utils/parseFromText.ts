import { SUPPORTED_BIOMARKERS } from './biomarkerMap'
import type { BiomarkerRecord } from '../types'

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

interface ValueCandidate { value: string; units?: string }

function parseNumericToken(token: string): ValueCandidate | null {
  const normalized = token.replace(/,/g, '.')
  if (/^[-+]?\d+(?:\.\d+)?$/.test(normalized)) {
    return { value: normalized }
  }
  const attached = token.match(/^([-+]?\d+(?:[\.,]\d+)?)([a-z%/µμ·\-]+)$/i)
  if (attached) {
    return { value: attached[1].replace(/,/g, '.'), units: attached[2] }
  }
  return null
}

function looksLikeUnitToken(token: string): boolean {
  if (!token) return false
  const trimmed = token.toLowerCase()
  if (trimmed.length < 2 && !trimmed.includes('%')) return false
  return /[a-z]/i.test(trimmed) || trimmed.includes('/') || trimmed.includes('·') || trimmed.includes('%') || trimmed.includes('µ') || trimmed.includes('μ')
}

function findValueCandidate(text: string): ValueCandidate | null {
  const tokens = text.split(/\s+/).filter(Boolean)
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    const candidate = parseNumericToken(token)
    if (!candidate) continue

    const next = tokens[i + 1] ?? ''
    const prev = tokens[i - 1] ?? ''
    const nextLower = next.toLowerCase()
    const prevLower = prev.toLowerCase()

    if (candidate.units && candidate.units.includes('^')) continue
    if (candidate.units && candidate.units.length <= 1 && !/[a-z]/i.test(candidate.units) && candidate.units.includes('/')) continue
    if (nextLower && (nextLower === '-' || nextLower === '–')) continue
    if (prevLower && (prevLower === '-' || prevLower === '–')) continue
    if (/^[0-9]+(?:[/^]|x10)/.test(nextLower) && !/[a-z]/i.test(nextLower)) continue
    if (["hasta", "ate", "to", "a", "sup", "inf", "max", "min", "desde"].includes(prevLower)) continue
    if (["<", ">", "<=", ">=", "=<", "=>"].includes(prevLower)) continue

    let units = candidate.units
    if (!units) {
      if (looksLikeUnitToken(next)) {
        units = next
      } else if (looksLikeUnitToken(prev) && !parseNumericToken(prev)) {
        units = prev
      }
    }

    return { value: candidate.value, units }
  }
  return null
}

function normalize(s: string) {
  return s
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9/%.,\sµμ^·\-]/g, ' ')
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
      const candidate = findValueCandidate(tail)
      if (!candidate) continue

      const rawVal = candidate.value
      const numericValue = Number(rawVal)
      const value = Number.isNaN(numericValue) ? rawVal : numericValue
      const units = candidate.units?.trim() || undefined
      const category = SUPPORTED_BIOMARKERS[canonical]?.category
      if (!results.some(r => r.biomarker === canonical)) {
        results.push({ biomarker: canonical, value, units, date, category })
      }
      break
    }
  }
  return results
}
