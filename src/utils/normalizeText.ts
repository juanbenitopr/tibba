import { BiomarkerRow } from "src/types";

const numberOrNull = (v: any): number | null => {
  if (v === undefined || v === null || v === "" || Number.isNaN(Number(v))) return null
  return Number(v)
}

function normalizeReference(val: any): { low: number | null; high: number | null } {
  // admite: "(12 - 18)", "12-18", "Inf. 5.7", "Sup. 150", "0.2 - 1.2", "< 20", ">= 30"
  if (val == null) return { low: null, high: null }
  const s = String(val).replace(/[,]/g, ".").trim()

  // intervalos tipo (a - b) o a - b
  const rangeMatch = s.match(/(-?\d+(?:\.\d+)?)\s*(?:–|-|a|to)\s*(-?\d+(?:\.\d+)?)/i)
  if (rangeMatch) {
    return { low: Number(rangeMatch[1]), high: Number(rangeMatch[2]) }
  }

  // Inf. x  => mínimo recomendado
  const infMatch = s.match(/Inf\.?\s*(\d+(?:\.\d+)?)/i)
  if (infMatch) return { low: Number(infMatch[1]), high: null }

  // Sup. x  => máximo recomendado
  const supMatch = s.match(/Sup\.?\s*(\d+(?:\.\d+)?)/i)
  if (supMatch) return { low: null, high: Number(supMatch[1]) }

  // < x  /  <= x
  const lt = s.match(/<\s*(\d+(?:\.\d+)?)/)
  if (lt) return { low: null, high: Number(lt[1]) }

  const le = s.match(/<=\s*(\d+(?:\.\d+)?)/)
  if (le) return { low: null, high: Number(le[1]) }

  // > x  /  >= x
  const gt = s.match(/>\s*(\d+(?:\.\d+)?)/)
  if (gt) return { low: Number(gt[1]), high: null }

  const ge = s.match(/>=\s*(\d+(?:\.\d+)?)/)
  if (ge) return { low: Number(ge[1]), high: null }

  return { low: null, high: null }
}

function normalizeData(data: any): BiomarkerRow[] {
  if (!data) return []

  // 1) Si es ya una lista de filas compatible
  if (Array.isArray(data)) {
    return data
      .map((row) => {
        const name = row.name ?? row.Prueba ?? row.biomarker ?? row.marker
        const value = numberOrNull(row.value ?? row.Resultado ?? row.val)
        const unit = row.unit ?? row.Unidades ?? row.unitSymbol

        let refLow = row.refLow ?? row.min ?? row.low ?? null
        let refHigh = row.refHigh ?? row.max ?? row.high ?? null

        // Campo de referencia tipo string (ej. "(12 - 18)")
        if ((refLow == null || refHigh == null) && (row.reference || row["Rango de Referencia"])) {
          const { low, high } = normalizeReference(row.reference ?? row["Rango de Referencia"]) 
          refLow = refLow ?? low
          refHigh = refHigh ?? high
        }

        const category = row.category ?? row.categoria ?? row.group
        return name && value != null
          ? ({ name, value, unit, refLow: numberOrNull(refLow), refHigh: numberOrNull(refHigh), category } as BiomarkerRow)
          : null
      })
      .filter(Boolean) as BiomarkerRow[]
  }

  // 2) Diccionario profundo { biomarker: { value, unit, ... } }
  if (typeof data === "object") {
    const out: BiomarkerRow[] = []
    for (const [k, v] of Object.entries<any>(data)) {
      if (v && typeof v === "object") {
        const { low, high } = normalizeReference(v.reference)
        const row: BiomarkerRow = {
          name: v.name ?? k,
          value: Number(v.value ?? v.val ?? v.result ?? 0),
          unit: v.unit ?? v.units,
          refLow: numberOrNull(v.refLow ?? v.min ?? v.low ?? low),
          refHigh: numberOrNull(v.refHigh ?? v.max ?? v.high ?? high),
          category: v.category ?? v.categoria,
        }
        if (!Number.isNaN(row.value)) out.push(row)
      } else {
        // 3) Diccionario simple { biomarker: value }
        const num = numberOrNull(v)
        if (num != null) {
          out.push({ name: k, value: num, refLow: null, refHigh: null })
        }
      }
    }
    return out
  }

  return []
}