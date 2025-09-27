import React, { useEffect, useMemo, useState } from "react"
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Analysis, BiomarkerRow, ReferenceData } from "src/types"
import { normalizeData } from "src/utils/normalizeText"
import { getAnalyses, loadReference } from "src/utils/storage"

const COLORS = ["#2563eb", "#16a34a", "#f97316", "#dc2626", "#7c3aed", "#0f766e", "#facc15", "#6366f1"]

function slugify(value: string) {
  return value
    ? value
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .toLowerCase()
    : ""
}

type BiomarkerOption = {
  name: string
  unit: string | undefined
  category: string | undefined
}

type ChartPoint = {
  name: string
  [biomarker: string]: string | number | null
}

type ValueMatrixRow = {
  biomarker: string
  unit: string | undefined
  reference: string
  values: Array<{ analysisId: string; analysisName: string; value: number | null }>
  delta: number | null
}

export default function BiomarkerComparison() {
  const [analyses, setAnalyses] = useState<Analysis[]>([])
  const [selectedBiomarkers, setSelectedBiomarkers] = useState<string[]>([])
  const [search, setSearch] = useState("")
  const [refData, setRefData] = useState<ReferenceData | null>(null)
  const [refLoading, setRefLoading] = useState(true)

  useEffect(() => {
    setAnalyses(getAnalyses())
  }, [])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const refs = await loadReference()
        if (mounted) setRefData(refs)
      } catch (error) {
        console.warn("No se pudieron cargar las referencias", error)
      } finally {
        if (mounted) setRefLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  const normalizedByAnalysis = useMemo(() => {
    const map = new Map<string, BiomarkerRow[]>()
    analyses.forEach((analysis) => {
      map.set(analysis.id, normalizeData(analysis.data))
    })
    return map
  }, [analyses])

  const biomarkerOptions: BiomarkerOption[] = useMemo(() => {
    const catalog = new Map<string, BiomarkerOption>()
    normalizedByAnalysis.forEach((rows) => {
      rows.forEach((row) => {
        const key = row.name.trim()
        if (!catalog.has(key)) {
          catalog.set(key, {
            name: row.name,
            unit: row.unit,
            category: row.category,
          })
        } else {
          const existing = catalog.get(key)!
          if (!existing.unit && row.unit) existing.unit = row.unit
          if (!existing.category && row.category) existing.category = row.category
        }
      })
    })
    return Array.from(catalog.values()).sort((a, b) => a.name.localeCompare(b.name, "es"))
  }, [normalizedByAnalysis])

  useEffect(() => {
    if (selectedBiomarkers.length === 0 && biomarkerOptions.length) {
      setSelectedBiomarkers(biomarkerOptions.slice(0, Math.min(3, biomarkerOptions.length)).map((b) => b.name))
    }
  }, [biomarkerOptions, selectedBiomarkers.length])

  const filteredOptions = useMemo(() => {
    if (!search) return biomarkerOptions
    const q = search.toLowerCase()
    return biomarkerOptions.filter((item) => item.name.toLowerCase().includes(q))
  }, [biomarkerOptions, search])

  const analysisOrder = useMemo(() => {
    return analyses.map((analysis, idx) => ({
      id: analysis.id,
      name: analysis.name ?? `Analítica ${idx + 1}`,
    }))
  }, [analyses])

  const referenceByBiomarker = useMemo(() => {
    const references = new Map<string, string>()
    if (!refData) return references
    for (const option of biomarkerOptions) {
      const slug = slugify(option.name)
      const entry = refData.by_id?.[slug]
      if (entry) {
        const display =
          entry.levels?.excelente?.unisex ??
          entry.levels?.bueno?.unisex ??
          entry.levels?.regular?.unisex ??
          entry.levels?.malo?.unisex ??
          entry.raw?.excelente ??
          entry.raw?.bueno ??
          entry.raw?.regular ??
          entry.raw?.malo ??
          null
        if (display) references.set(option.name, display)
      }
    }
    return references
  }, [biomarkerOptions, refData])

  const chartData: ChartPoint[] = useMemo(() => {
    if (!analyses.length) return []
    return analysisOrder.map(({ id, name }) => {
      const rows = normalizedByAnalysis.get(id) ?? []
      const point: ChartPoint = { name }
      selectedBiomarkers.forEach((biomarker) => {
        const hit = rows.find((row) => row.name === biomarker)
        point[biomarker] = hit ? Number(hit.value) : null
      })
      return point
    })
  }, [analysisOrder, normalizedByAnalysis, selectedBiomarkers])

  const valueMatrix: ValueMatrixRow[] = useMemo(() => {
    return selectedBiomarkers.map((biomarker) => {
      const option = biomarkerOptions.find((item) => item.name === biomarker)
      const values = analysisOrder.map(({ id, name }) => {
        const rows = normalizedByAnalysis.get(id) ?? []
        const hit = rows.find((row) => row.name === biomarker)
        return {
          analysisId: id,
          analysisName: name,
          value: hit ? Number(hit.value) : null,
          refLow: hit?.refLow ?? null,
          refHigh: hit?.refHigh ?? null,
        }
      })
      const referenceFromCatalog = referenceByBiomarker.get(biomarker)
      const referenceFromValues = values.find((value) => value.refLow != null || value.refHigh != null)
      let reference = "—"
      if (referenceFromCatalog) {
        reference = referenceFromCatalog
      } else if (referenceFromValues) {
        const low = referenceFromValues.refLow
        const high = referenceFromValues.refHigh
        reference = [low ?? "", high ?? ""].some((v) => v !== "")
          ? `${low ?? ""}${low != null || high != null ? " - " : ""}${high ?? ""}`
          : "—"
      }
      const nonNullValues = values.map((v) => v.value).filter((v): v is number => v != null)
      const delta = nonNullValues.length >= 2 ? nonNullValues[nonNullValues.length - 1]! - nonNullValues[0]! : null
      return {
        biomarker,
        unit: option?.unit,
        reference,
        values: values.map(({ refLow, refHigh, ...rest }) => rest),
        delta,
      }
    })
  }, [analysisOrder, biomarkerOptions, normalizedByAnalysis, referenceByBiomarker, selectedBiomarkers])

  const handleSelectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const values = Array.from(event.target.selectedOptions).map((opt) => opt.value)
    setSelectedBiomarkers(values.slice(0, 6))
  }

  if (!analyses.length) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-3">Comparador de biomarcadores</h1>
        <p className="text-gray-600">
          Aún no tienes analíticas guardadas. Importa un PDF con tu informe para habilitar la comparación.
        </p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Comparador de biomarcadores</h1>
        <p className="text-gray-600 text-sm">
          Selecciona hasta seis biomarcadores y revisa cómo evolucionan a través de tus analíticas guardadas.
          {refLoading ? " (cargando referencias…)" : ""}
        </p>
      </header>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="rounded-2xl border bg-white p-4 shadow-sm space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Biomarcadores disponibles</h2>
            <p className="text-xs text-gray-500">{biomarkerOptions.length} biomarcadores detectados</p>
          </div>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Filtra por nombre (ej. Vitamina D, LDL)"
            className="w-full rounded-xl border px-3 py-2 text-sm shadow-sm"
          />
          <select
            multiple
            size={Math.min(10, Math.max(4, filteredOptions.length))}
            value={selectedBiomarkers}
            onChange={handleSelectChange}
            className="w-full rounded-xl border px-3 py-2 text-sm shadow-sm h-auto"
          >
            {filteredOptions.map((option) => (
              <option key={option.name} value={option.name}>
                {option.name}
                {option.unit ? ` · ${option.unit}` : ""}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500">
            Mantén pulsado Cmd/Ctrl para seleccionar varios. Máximo seis a la vez.
          </p>
        </div>

        <div className="xl:col-span-2 rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">Evolución por analítica</h2>
            <span className="text-xs text-gray-500">{analysisOrder.length} analíticas comparadas</span>
          </div>
          <div className="h-80">
            {selectedBiomarkers.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-gray-400">
                Selecciona al menos un biomarcador para ver la gráfica.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 12, right: 28, left: 12, bottom: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} angle={-15} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals />
                  <Tooltip
                    formatter={(value: any, biomarker: string) => {
                      if (value == null) return ["s/d", biomarker]
                      const option = biomarkerOptions.find((item) => item.name === biomarker)
                      return [
                        `${value}${option?.unit ? ` ${option.unit}` : ""}`,
                        biomarker,
                      ]
                    }}
                  />
                  <Legend />
                  {selectedBiomarkers.map((biomarker, index) => (
                    <Line
                      key={biomarker}
                      type="monotone"
                      dataKey={biomarker}
                      name={biomarker}
                      stroke={COLORS[index % COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Cada punto corresponde al valor del biomarcador en una analítica guardada. Las series usan la misma escala (puede que debas comparar biomarcadores de una misma unidad).
          </p>
        </div>
      </section>

      {selectedBiomarkers.length > 0 && (
        <section className="rounded-2xl border bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50">
            <h2 className="text-lg font-semibold">Detalle numérico</h2>
          </div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-white">
                <tr className="text-left text-gray-500">
                  <th className="px-4 py-2">Biomarcador</th>
                  <th className="px-4 py-2">Unidad</th>
                  <th className="px-4 py-2">Referencia</th>
                  {analysisOrder.map((analysis) => (
                    <th key={analysis.id} className="px-4 py-2 whitespace-nowrap">
                      {analysis.name}
                    </th>
                  ))}
                  <th className="px-4 py-2">Δ (último - primero)</th>
                </tr>
              </thead>
              <tbody>
                {valueMatrix.map((row, idx) => (
                  <tr key={row.biomarker} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-4 py-2 font-medium">
                      <div>{row.biomarker}</div>
                      <div className="text-xs text-gray-400 capitalize">{biomarkerOptions.find((o) => o.name === row.biomarker)?.category ?? ""}</div>
                    </td>
                    <td className="px-4 py-2">{row.unit ?? "—"}</td>
                    <td className="px-4 py-2">{row.reference}</td>
                    {row.values.map((value) => (
                      <td key={`${row.biomarker}-${value.analysisId}`} className="px-4 py-2">
                        {value.value != null ? value.value : <span className="text-gray-400">s/d</span>}
                      </td>
                    ))}
                    <td className="px-4 py-2">
                      {row.delta != null ? (row.delta >= 0 ? `+${row.delta}` : row.delta) : <span className="text-gray-400">s/d</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
