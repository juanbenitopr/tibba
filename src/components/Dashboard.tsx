import React, { useEffect, useMemo, useState } from "react"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts"

/**
 * Dashboard con visualización de salud por categorías.
 * Cada analítica se carga de localStorage y se colorea según si los valores están en rango
 * usando primero el archivo de referencias; si no hay referencia, usa refLow/refHigh del dato.
 */

export type BiomarkerRow = {
  biomarker: string
  value: number
  unit?: string
  refLow?: number | null
  refHigh?: number | null
  category?: string
}

export type Analysis = {
  id: string
  name: string
  data: any
  createdAt?: string
}

const STORAGE_KEY = "analyses"

// ========= NUEVO: tipos de referencias =========
type LevelKey = "excelente" | "bueno" | "regular" | "malo"
type Sex = "U" // mantenemos Unisex para no romper tu API

type SexRules = { unisex: string | null; male: string | null; female: string | null }
type BiomarkerRef = {
  id: string
  name: string
  units: string | null
  category: "cardiovascular" | "metabolic" | "immune" | "hormonal" | "general"
  levels: Record<LevelKey, SexRules>
  raw: Record<LevelKey, string>
}
type ReferenceData = {
  version: number
  generated_at: string
  biomarkers: BiomarkerRef[]
  by_id: Record<string, BiomarkerRef>
}
const REF_STORAGE_KEY = "reference_ranges"

// ========= utilidades existentes =========
function getAnalyses(): Analysis[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw)
  } catch {
    return []
  }
}

function normalizeData(data: any): BiomarkerRow[] {
  if (!data) return []
  if (Array.isArray(data)) return data as BiomarkerRow[]
  if (typeof data === "object") {
    return Object.entries<any>(data).map(([k, v]) => ({
      name: v?.name ?? k,
      value: Number(v?.value ?? v),
      unit: v?.unit,
      refLow: v?.refLow ?? null,
      refHigh: v?.refHigh ?? null,
      category: v?.category ?? "general",
    }))
  }
  return []
}

const COLORS = { good: "#34d399", bad: "#f87171" }

// ========= NUEVO: carga de referencias (LS + estático) =========
async function loadReference(): Promise<ReferenceData> {
  const local = localStorage.getItem(REF_STORAGE_KEY)
  if (local) {
    try {
      return JSON.parse(local) as ReferenceData
    } catch {
      // si falla, seguimos con fetch
    }
  }
  const res = await fetch("/reference_ranges.dashboard.json")
  const json = (await res.json()) as ReferenceData
  localStorage.setItem(REF_STORAGE_KEY, JSON.stringify(json))
  return json
}

// ========= NUEVO: helpers para evaluar reglas =========
const LEVEL_COLORS: Record<LevelKey, string> = {
  excelente: "bg-emerald-100 text-emerald-700",
  bueno:     "bg-sky-100 text-sky-700",
  regular:   "bg-amber-100 text-amber-800",
  malo:      "bg-rose-100 text-rose-700",
}

function slugify(s: string) {
  return s ? s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase(): ''
}

// Evalúa una regla elemental: "< x", "> x", "≤ x", "≥ x", "a - b" o "= x"
function matchSingleRule(rule: string, value: number): boolean {
  const r = rule.replace(",", ".").trim()

  // Rango "a - b"
  const range = r.match(/^(-?\d+(?:\.\d+)?)\s*[-–]\s*(-?\d+(?:\.\d+)?)/)
  if (range) {
    const a = parseFloat(range[1])
    const b = parseFloat(range[2])
    return value >= Math.min(a, b) && value <= Math.max(a, b)
  }

  // Comparadores
  const cmp = r.match(/^([<>]=?|≥|≤)\s*(-?\d+(?:\.\d+)?)/i)
  if (cmp) {
    const op = cmp[1]
    const num = parseFloat(cmp[2])
    switch (op) {
      case "<":  return value < num
      case ">":  return value > num
      case "<=":
      case "≤":  return value <= num
      case ">=":
      case "≥":  return value >= num
    }
  }

  // Exacto
  const exact = r.match(/^(-?\d+(?:\.\d+)?)$/)
  if (exact) return value === parseFloat(exact[1])

  return false
}

// Divide una regla por "o" "/" ";" y evalúa como OR
function matchRule(rule: string | null, value: number): boolean {
  if (!rule) return false
  const parts = rule
    .replace(/\s*o\s*/gi, "|")
    .replace(/\s*\/\s*/g, "|")
    .replace(/\s*;\s*/g, "|")
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean)

  return parts.some((p) => matchSingleRule(p, value))
}

// Elige la regla aplicable (usamos unisex por compatibilidad)
function pickSexRule(entry: BiomarkerRef, level: LevelKey, _sex: Sex = "U"): string | null {
  const set = entry.levels[level]
  return set.unisex ?? set.male ?? set.female ?? null
}

// Determina el nivel
function computeLevel(entry: BiomarkerRef, value: number, sex: Sex = "U"): LevelKey | null {
  const order: LevelKey[] = ["excelente", "bueno", "regular", "malo"]
  for (const lvl of order) {
    const rule = pickSexRule(entry, lvl, sex)
    if (rule && matchRule(rule, value)) return lvl
  }
  // fallback: si "malo" es de tipo "<x o >y"
  const bad = pickSexRule(entry, "malo", sex)
  if (bad && matchRule(bad, value)) return "malo"
  return null
}

export default function DashboardAnaliticasLocalStorage() {
  const [analyses, setAnalyses] = useState<Analysis[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // NUEVO: estado para referencias
  const [refData, setRefData] = useState<ReferenceData | null>(null)
  const [refLoading, setRefLoading] = useState(true)

  useEffect(() => {
    const a = getAnalyses()
    setAnalyses(a)
    if (a.length && !selectedId) setSelectedId(a[0].id)
  }, [])

  // Carga referencias (LS + estático)
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const data = await loadReference()
        if (mounted) setRefData(data)
      } catch (e) {
        console.error("Error cargando referencias", e)
      } finally {
        if (mounted) setRefLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  const selected = analyses.find((a) => a.id === selectedId) ?? null
  const rows = useMemo(() => normalizeData(selected?.data), [selected])

  // Resumen con referencias si existen (ok = no "malo")
  const summary = useMemo(() => {
    const total = rows.length
    if (!refData) {
      const good = rows.filter(
        (r) =>
          (r.refLow == null || r.value >= r.refLow) &&
          (r.refHigh == null || r.value <= r.refHigh)
      ).length
      return { total, good, bad: total - good }
    }

    const good = rows.filter((r) => {
      const id = slugify(r.biomarker)
      const ref = refData.by_id?.[id]
      if (!ref) {
        // fallback a refLow/refHigh
        return (
          (r.refLow == null || r.value >= r.refLow) &&
          (r.refHigh == null || r.value <= r.refHigh)
        )
      }
      const level = computeLevel(ref, r.value, "U")
      return level !== "malo" // excelente/bueno/regular cuentan como "en rango"
    }).length

    return { total, good, bad: total - good }
  }, [rows, refData])

  const pieData = [
    { name: "En rango", value: summary.good, color: COLORS.good },
    { name: "Fuera de rango", value: summary.bad, color: COLORS.bad },
  ]

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">Salud general</h1>
          <p className="text-sm text-gray-500">
            Analíticas desde tu navegador. {refLoading ? "(cargando referencias…)" : refData ? `Ref v${refData.version}` : "(sin referencias)"}
          </p>
        </div>
        <select
          className="border rounded-xl px-3 py-2 bg-white shadow-sm"
          value={selectedId ?? ""}
          onChange={(e) => setSelectedId(e.target.value || null)}
        >
          {analyses.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Pie chart resumen */}
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold mb-2">Resumen</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={3}
                >
                  {pieData.map((entry, idx) => (
                    <Cell key={`cell-${idx}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <p className="text-center mt-2 text-sm">
            {summary.good}/{summary.total} biomarcadores en rango
          </p>
        </div>

        {/* Tabla de biomarcadores */}
        <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50">
            <h2 className="text-lg font-semibold">Biomarcadores</h2>
          </div>
          <div className="overflow-auto max-h-96">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="text-left text-gray-500">
                  <th className="px-4 py-2">Biomarcador</th>
                  <th className="px-4 py-2">Valor</th>
                  <th className="px-4 py-2">Ref.</th>
                  <th className="px-4 py-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  let ok = false
                  let level: LevelKey | null = null
                  let levelColor = ""
                  let refText: string | null = null

                  if (refData) {
                    const id = slugify(r.biomarker)
                    const ref = refData.by_id?.[id] ?? null
                    if (ref) {
                      level = computeLevel(ref, r.value, "U")
                      ok = level !== "malo"
                      levelColor = level ? LEVEL_COLORS[level] : ""
                      // mostrar como referencia el tramo "bueno" si existe, si no "excelente" o "regular"
                      refText =
                        pickSexRule(ref, "bueno", "U") ??
                        pickSexRule(ref, "excelente", "U") ??
                        pickSexRule(ref, "regular", "U") ??
                        null
                    } else {
                      // fallback a refLow/refHigh
                      ok =
                        (r.refLow == null || r.value >= r.refLow) &&
                        (r.refHigh == null || r.value <= r.refHigh)
                    }
                  } else {
                    // sin referencias cargadas
                    ok =
                      (r.refLow == null || r.value >= r.refLow) &&
                      (r.refHigh == null || r.value <= r.refHigh)
                  }

                  return (
                    <tr key={r.biomarker} className="border-t">
                      <td className="px-4 py-2 font-medium">{r.biomarker}</td>
                      <td className="px-4 py-2">
                        {r.value} {r.unit}
                      </td>
                      <td className="px-4 py-2">
                        {refText
                          ? refText
                          : `${r.refLow ?? ""}${r.refLow != null || r.refHigh != null ? " - " : ""}${r.refHigh ?? ""}`}
                      </td>
                      <td className="px-4 py-2">
                        {refData && level ? (
                          <span className={`px-2 py-1 text-xs rounded-full ${levelColor}`}>
                            {level}
                          </span>
                        ) : (
                          <span
                            className={`px-2 py-1 text-xs rounded-full ${
                              ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                            }`}
                          >
                            {ok ? "En rango" : "Fuera de rango"}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
