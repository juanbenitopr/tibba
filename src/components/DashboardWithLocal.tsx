import React, { useEffect, useMemo, useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
  ResponsiveContainer,
  ReferenceArea,
  Legend,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
} from "recharts"

/**
 * ✅ Dashboard de Analíticas (localStorage) — Versión "Bienestar" por colores
 *
 * Muestra:
 *  - Selector de analítica guardada
 *  - Resumen de salud con gauge (score 0..100)
 *  - Mini‑gauges por categoría (cardiovascular, metabolic, immune, hormonal, general)
 *  - Tabla coloreada por estado (en rango / fuera de rango, desviación)
 *  - Gráfica de barras de los biomarcadores filtrados (con semáforos)
 *
 * Entrada esperada en localStorage (key: "analyses"):
 *   [{ id: string, name: string, data: any }]
 */

// ===================== Tipos =====================
export type BiomarkerRow = {
  name: string
  value: number
  unit?: string
  refLow?: number | null
  refHigh?: number | null
  category?: string // una de: cardiovascular | metabolic | immune | hormonal | general
}

export type Analysis = {
  id: string
  name: string
  data: any
  createdAt?: string
}

// ===================== Utils localStorage =====================
const STORAGE_KEY = "analyses"

function getAnalyses(): Analysis[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (e) {
    console.warn("Failed to read analyses from localStorage", e)
    return []
  }
}

// ===================== Normalización =====================
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

        const category = (row.category ?? row.categoria ?? row.group)?.toLowerCase()
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
          category: (v.category ?? v.categoria)?.toLowerCase(),
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

// ===================== Scoring =====================
function rowScore(r: BiomarkerRow): number {
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

function colorByScore(score: number) {
  if (score >= 0.85) return { bg: "bg-green-100", text: "text-green-700", ring: "#16a34a" }
  if (score >= 0.6) return { bg: "bg-amber-100", text: "text-amber-700", ring: "#f59e0b" }
  return { bg: "bg-rose-100", text: "text-rose-700", ring: "#e11d48" }
}

function computeScores(rows: BiomarkerRow[]) {
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

// ===================== UI helpers =====================
function classNames(...cls: Array<string | false | undefined>) {
  return cls.filter(Boolean).join(" ")
}

function toPct(n: number) {
  return Math.round(n * 100)
}

// ===================== Componente =====================
export default function DashboardAnaliticasLocalStorageBienestar() {
  const [analyses, setAnalyses] = useState<Analysis[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [trendBiomarker, setTrendBiomarker] = useState<string>("")

  // Cargar analyses del LS
  useEffect(() => {
    const a = getAnalyses()
    setAnalyses(a)
    if (a.length && !selectedId) setSelectedId(a[0].id)
  }, [])

  const selected = useMemo(() => analyses.find((a) => a.id === selectedId) ?? null, [analyses, selectedId])
  const rows = useMemo(() => normalizeData(selected?.data), [selected])

  const { overall, catScores } = useMemo(() => computeScores(rows), [rows])

  const categories = useMemo(() => {
    const set = new Set<string>()
    rows.forEach((r) => r.category && set.add(r.category))
    // garantizar orden base
    const base = ["cardiovascular", "metabolic", "immune", "hormonal", "general"]
    return base.filter((b) => set.has(b))
  }, [rows])

  const filteredRows = useMemo(() => {
    let r = rows
    if (query) {
      const q = query.toLowerCase()
      r = r.filter((x) => x.name.toLowerCase().includes(q))
    }
    if (categoryFilter !== "all") {
      r = r.filter((x) => (x.category ?? "").toLowerCase() === categoryFilter.toLowerCase())
    }
    return r.sort((a, b) => a.name.localeCompare(b.name))
  }, [rows, query, categoryFilter])

  const topForChart = useMemo(() => {
    // Selecciona hasta 12 biomarcadores numéricos 
    return filteredRows.filter((r) => typeof r.value === "number").slice(0, 12)
  }, [filteredRows])

  const trendData = useMemo(() => {
    if (!trendBiomarker) return []
    return analyses.map((a, idx) => {
      const list = normalizeData(a.data)
      const hit = list.find((x) => x.name.toLowerCase() === trendBiomarker.toLowerCase())
      return {
        name: a.name ?? `Analítica ${idx + 1}`,
        value: hit?.value ?? null,
        refLow: hit?.refLow ?? null,
        refHigh: hit?.refHigh ?? null,
      }
    })
  }, [analyses, trendBiomarker])

  // Peores biomarcadores (fuera de rango) ordenados por peor score
  const worst = useMemo(() => {
    const withScore = rows.map((r) => ({ ...r, _score: rowScore(r) })) as (BiomarkerRow & { _score: number })[]
    return withScore
      .filter((r) => r._score < 1 && (r.refLow != null || r.refHigh != null))
      .sort((a, b) => a._score - b._score)
      .slice(0, 6)
  }, [rows])

  const overallColor = colorByScore(overall)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">Mi salud hoy</h1>
          <p className="text-sm text-gray-500">Analítica desde tu navegador (localStorage). Colores = estado vs rango de referencia.</p>
        </div>

        {/* Selector de analítica */}
        <div className="flex flex-col gap-2 min-w-[280px]">
          <label className="text-sm text-gray-500">Selecciona analítica</label>
          <select
            className="border rounded-xl px-3 py-2 bg-white shadow-sm"
            value={selectedId ?? ""}
            onChange={(e) => setSelectedId(e.target.value || null)}
          >
            {analyses.length === 0 && <option value="">(no hay analíticas guardadas)</option>}
            {analyses.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} — {a.id}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Resumen "bienestar" */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* Gauge global */}
        <div className="xl:col-span-2 rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold mb-2">Resumen de salud</h2>
          <div className="flex items-center gap-6">
            <div className="w-48 h-48">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart
                  innerRadius="68%"
                  outerRadius="100%"
                  data={[{ name: "score", value: Math.max(1, toPct(overall)) }]}
                  startAngle={225}
                  endAngle={-45}
                >
                  <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                  <RadialBar dataKey="value" cornerRadius={18} fill={overallColor.ring} />
                  <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" fontSize="28" fontWeight={700}>
                    {toPct(overall)}
                  </text>
                </RadialBarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1">
              <div className={classNames("inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-sm", overallColor.bg, overallColor.text)}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: overallColor.ring }} />
                {toPct(overall) >= 85 ? "Óptimo" : toPct(overall) >= 60 ? "Mejorable" : "A revisar"}
              </div>
              <p className="text-sm text-gray-600 mt-3">
                El score combina qué porcentaje de biomarcadores están dentro de rango (y cuán lejos están los que no).
              </p>
              <ul className="text-sm text-gray-600 list-disc ml-5 mt-2">
                <li><strong>{Math.round(rows.filter(r => (r.refLow == null || r.value >= (r.refLow ?? -Infinity)) && (r.refHigh == null || r.value <= (r.refHigh ?? Infinity))).length / Math.max(1, rows.length) * 100)}%</strong> en rango</li>
                <li>{rows.length} biomarcadores analizados</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Mini gauges por categoría */}
        <div className="xl:col-span-3 grid grid-cols-1 md:grid-cols-5 gap-4">
          {catScores.map(({ category, score }) => {
            const c = colorByScore(score)
            return (
              <div key={category} className="rounded-2xl border bg-white p-3 shadow-sm flex flex-col items-center">
                <div className="w-24 h-24">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadialBarChart innerRadius="70%" outerRadius="100%" data={[{ value: toPct(score) }]} startAngle={225} endAngle={-45}>
                      <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                      <RadialBar dataKey="value" cornerRadius={18} fill={c.ring} />
                      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" fontSize="18" fontWeight={700}>
                        {toPct(score)}
                      </text>
                    </RadialBarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 text-sm font-medium capitalize">{category}</div>
                <div className={classNames("mt-1 text-xs px-2 py-0.5 rounded-full", c.bg, c.text)}>
                  {toPct(score) >= 85 ? "OK" : toPct(score) >= 60 ? "Mejorable" : "Atento"}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Riesgos principales */}
      {worst.length > 0 && (
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold mb-2">A vigilar (fuera de rango)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {worst.map((r) => {
              const lowOk = r.refLow == null || r.value >= (r.refLow ?? -Infinity)
              const highOk = r.refHigh == null || r.value <= (r.refHigh ?? Infinity)
              const low = r.refLow
              const high = r.refHigh
              const delta = !lowOk ? (Number(low) - r.value) : !highOk ? (r.value - Number(high)) : 0
              const base = (high != null && low != null) ? Math.max(1e-9, Number(high) - Number(low)) : Math.max(1, Math.abs(r.value) * 0.2)
              const pct = Math.min(200, Math.round((Math.abs(delta) / base) * 100))
              return (
                <div key={r.name} className="border rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-gray-500 capitalize">{r.category ?? "general"}</div>
                  </div>
                  <div className="text-sm mt-1">{r.value} {r.unit ?? ""}</div>
                  <div className="text-xs text-gray-500">Ref: {low ?? "—"} - {high ?? "—"}</div>
                  <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: "#e11d48" }} />
                  </div>
                  <div className="text-xs text-rose-600 mt-1">{pct}% fuera (aprox.)</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Controles de filtro */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="flex flex-col gap-2">
          <label className="text-sm text-gray-500">Buscar biomarcador</label>
          <input
            className="border rounded-xl px-3 py-2 bg-white shadow-sm"
            placeholder="ej. Vitamina D, LDL, HbA1c…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-sm text-gray-500">Categoría</label>
          <select
            className="border rounded-xl px-3 py-2 bg-white shadow-sm"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="all">Todas</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-sm text-gray-500">Evolución (elige biomarcador)</label>
          <input
            className="border rounded-xl px-3 py-2 bg-white shadow-sm"
            placeholder="Escribe un biomarcador para ver tendencia"
            value={trendBiomarker}
            onChange={(e) => setTrendBiomarker(e.target.value)}
          />
        </div>
      </div>

      {/* Gráficas */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <div className="xl:col-span-3 rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">Valores (top 12 filtrados) con semáforo</h2>
            <span className="text-sm text-gray-500">{topForChart.length} items</span>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topForChart} margin={{ left: 8, right: 24, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} angle={-15} textAnchor="end" height={60} />
                <YAxis />
                <Tooltip formatter={(v: any, _n, p: any) => [`${v}${p?.payload?.unit ? ` ${p.payload.unit}` : ""}`, "Valor"]} />
                <Legend />
                <Bar
                  dataKey="value"
                  name="Valor"
                  radius={[6, 6, 0, 0]}
                  // Color dinámico por barra según score
                  fillOpacity={1}
                  label={{ position: "top", fontSize: 11 }}
                >
                  {topForChart.map((entry, index) => {
                    const s = rowScore(entry)
                    const c = colorByScore(s).ring
                    return <cell key={`cell-${index}`} fill={c} />
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-gray-500 mt-2">Colores basados en la distancia al rango de referencia.</p>
        </div>

        <div className="xl:col-span-2 rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold mb-2">Evolución</h2>
          <p className="text-sm text-gray-500 mb-2">Escribe el nombre exacto del biomarcador arriba para ver su tendencia a lo largo de tus analíticas guardadas.</p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ left: 8, right: 24, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} angle={-15} textAnchor="end" height={60} />
                <YAxis />
                <Tooltip />
                <Legend />
                {trendData.some((d) => d.refLow != null && d.refHigh != null) && (
                  <ReferenceArea y1={Number(trendData[0]?.refLow)} y2={Number(trendData[0]?.refHigh)} opacity={0.1} />
                )}
                <Line type="monotone" dataKey="value" name={trendBiomarker || "Valor"} dot />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Biomarcadores ({filteredRows.length})</h2>
          {selected && (
            <span className="text-xs text-gray-500">Origen: {selected.name} · id {selected.id}</span>
          )}
        </div>
        <div className="overflow-auto max-h-[520px]">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-white shadow-[0_1px_0_#eee]">
              <tr className="text-left text-gray-500">
                <th className="px-4 py-2">Biomarcador</th>
                <th className="px-4 py-2">Valor</th>
                <th className="px-4 py-2">Unidad</th>
                <th className="px-4 py-2">Rango ref.</th>
                <th className="px-4 py-2">Categoría</th>
                <th className="px-4 py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => {
                const inLow = r.refLow == null || r.value >= (r.refLow ?? -Infinity)
                const inHigh = r.refHigh == null || r.value <= (r.refHigh ?? Infinity)
                const ok = inLow && inHigh
                const s = rowScore(r)
                const c = colorByScore(s)

                const low = r.refLow
                const high = r.refHigh
                let badge = ok ? "En rango" : "Fuera de rango"
                let detail = ""
                if (!ok && (low != null || high != null)) {
                  const delta = !inLow ? (Number(low) - r.value) : !inHigh ? (r.value - Number(high)) : 0
                  const base = (high != null && low != null) ? Math.max(1e-9, Number(high) - Number(low)) : Math.max(1, Math.abs(r.value) * 0.2)
                  const pct = Math.round((Math.abs(delta) / base) * 100)
                  detail = ` · ~${pct}% fuera`
                }

                return (
                  <tr key={r.name} className="border-t">
                    <td className="px-4 py-2 font-medium">{r.name}</td>
                    <td className="px-4 py-2">{r.value}</td>
                    <td className="px-4 py-2">{r.unit ?? "—"}</td>
                    <td className="px-4 py-2">
                      {r.refLow != null || r.refHigh != null ? (
                        <span>
                          {r.refLow != null ? r.refLow : ""}
                          {r.refLow != null || r.refHigh != null ? " - " : ""}
                          {r.refHigh != null ? r.refHigh : ""}
                        </span>
                      ) : (
                        <span className="text-gray-400">s/d</span>
                      )}
                    </td>
                    <td className="px-4 py-2 capitalize">{r.category ?? <span className="text-gray-400">—</span>}</td>
                    <td className="px-4 py-2">
                      <span className={classNames("px-2 py-1 text-xs rounded-full", c.bg, c.text)}>
                        {badge}
                        <span className="text-gray-400">{detail}</span>
                      </span>
                    </td>
                  </tr>
                )
              })}

              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                    No hay biomarcadores que coincidan con el filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pie */}
      <div className="text-xs text-gray-400">
        <p>
          Nota: este score es orientativo y no sustituye criterio médico. Si me pasas tu mapeo de categorías (cardiovascular, metabolic, immune, hormonal, general) lo ajusto a tu base exacta.
        </p>
      </div>
    </div>
  )
}
