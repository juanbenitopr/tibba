import React, { useEffect, useState } from 'react'
import PdfImporter from './components/PdfImporter'
import DashboardAnaliticasLocalStorage from './components/DashboardWithLocal'

type Tab = 'import' | 'dash'

const App: React.FC = () => {
  const [tab, setTab] = useState<Tab>('import')

  return (
    <div style={{ maxWidth: 980, margin: '28px auto', padding: 16, fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell' }}>
      <h1 style={{ marginTop: 0 }}>Tibba – Importa tu analítica en PDF y visualízala</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => setTab('import')} disabled={tab==='import'}>Importar PDF</button>
        <button onClick={() => setTab('dash')} disabled={tab==='dash'}>Dashboard</button>
      </div>
      {tab === 'import' ? <PdfImporter /> : <DashboardAnaliticasLocalStorage />}
      <hr style={{ margin: '20px 0' }} />
      <details>
        <summary>Ayuda</summary>
        <ul>
          <li>Si ves errores de worker, asegúrate de tener <code>pdfjs-dist</code> instalado y que Vite resuelva <code>pdf.worker.min.js?url</code>.</li>
          <li>El parser reconoce nombres y valores en texto; si tu PDF es una imagen, necesitarás OCR (no incluido en esta app).</li>
          <li>Puedes ir directo al Dashboard tras importar; los datos se comparten vía estado global.</li>
        </ul>
      </details>
    </div>
  )
}

export default App
