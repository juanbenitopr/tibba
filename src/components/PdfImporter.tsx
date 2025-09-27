import React, { useState } from 'react'
import pdfjs from '../utils/pdfWorker'
import { parseBiomarkersFromFreeText } from '../utils/parseFromText'
import { useBioStore } from '../store'
import { v4 as uuidv4 } from "uuid"
import { saveAnalysis } from "../utils/storage"

function normalize(s: string) {
  return s
    .normalize('NFD')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

const PdfImporter: React.FC = () => {
  const [status, setStatus] = useState<string>('Listo para importar un PDF de analítica.')
  const setRecords = useBioStore(s => s.setRecords)

  const handlePdfParsed = (parsedData: any) => {
    const analysisId = uuidv4()
    const analysisName = `Analítica ${new Date().toLocaleDateString()}`

    saveAnalysis({
      id: analysisId,
      name: analysisName,
      data: parsedData
    })
}

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setStatus('Leyendo PDF…')
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise
    const pageTexts: string[] = []
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      const lines = {} as Record<number, Array<any>>
      for(const item of content.items) {
        const y = Math.round((item as any).transform[5]);
        if (!lines[y]) lines[y] = [];
        const str = normalize((item as any).str || '').trim();
        if (str)lines[y].push(str);
      }
      pageTexts.push(Object.entries(lines).sort((a, b) => Number(a[0]) - Number(b[0])).map(e => e[1].join('||')).join('\n'))
    }
    const allText = pageTexts.join('\n')
    setStatus('Extrayendo biomarcadores…')
    const dateGuess = undefined // Could add date detection here
    const parsed = parseBiomarkersFromFreeText(allText, dateGuess)
    if (parsed.length === 0) {
      setStatus('No se detectaron biomarcadores compatibles. Revisa el PDF o amplía el parser.')
    } else {
      setStatus(`Detectados ${parsed.length} biomarcadores. Enviando al Dashboard…`)
      handlePdfParsed(parsed)
      setRecords(parsed)
      setStatus(`¡Listo! ${parsed.length} biomarcadores enviados al Dashboard.`)
    }
  }

  return (
    <div className="importer">
      <label className="block mb-2 font-medium">Sube tu analítica en PDF:</label>
      <input type="file" accept="application/pdf" onChange={onFile} />
      <p style={{ marginTop: 12 }}>{status}</p>
      <small>Soporta informes que contengan nombres y valores en texto seleccionable.</small>
    </div>
  )
}


export default PdfImporter
