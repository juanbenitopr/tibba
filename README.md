# Tibba – Importar PDF → Dashboard (React + Vite + TS)

## Arranque
```bash
pnpm i   # o npm i / yarn
pnpm dev
```
Abre http://localhost:5173

## ¿Qué hace?
- Sube un PDF de analítica.
- Extrae texto (pdfjs-dist) y busca biomarcadores soportados.
- Envía los resultados directamente al Dashboard (sin guardar CSV).
- Botón opcional para exportar a CSV.

## Notas
- Si tu PDF es escaneado (imagen), necesitarás OCR (por ejemplo, Tesseract en el backend).
- Añade más alias o reglas en `src/utils/biomarkerMap.ts` y `src/utils/parseFromText.ts`.
- Si ya tienes un Dashboard más completo, sustituye `src/components/Dashboard.tsx` y reutiliza `useBioStore`.
# tibba
