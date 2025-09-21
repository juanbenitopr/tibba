// Vite: import the worker as a URL and set it for pdfjs
const pdfjs = await import('pdfjs-dist');


// 1) Intento preferente: usar workerPort con un Module Worker (ESM) — el más compatible con Vite/Next.
let workerReady = false;
try {
    // @ts-ignore - new URL con import.meta.url lo resuelve el bundler
    const modUrl = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pdfjs as any).GlobalWorkerOptions.workerPort = new Worker(modUrl, { type: 'module' });
    workerReady = true;
} catch (e) {
    // Si falla (bundler viejo), continuamos con workerSrc
}


// 2) Fallback: establecer workerSrc apuntando a un asset servible.
if (!workerReady) {
    let workerSrc: string | null = null;
    const specs = [
        'pdfjs-dist/build/pdf.worker.min.mjs?url', // ESM recomendado
        'pdfjs-dist/build/pdf.worker.min.js?url',
        'pdfjs-dist/legacy/build/pdf.worker.min.js?url',
    ];
    for (const spec of specs) {
        try {
            // @vite-ignore para evitar pre-bundle
            // @ts-ignore – import dinámico de asset URL
            const mod = await import(/* @vite-ignore */ spec);
            workerSrc = (mod?.default as string) || null;
            if (workerSrc) break;
        } catch { }
    }
    


    // Fallback definitivo: archivo en /public (asegúrate de copiar el .mjs para ESM)
    // cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/pdf.worker.min.mjs
    if (!workerSrc) workerSrc = '/pdf.worker.min.mjs';
    


    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pdfjs as any).GlobalWorkerOptions.workerSrc = workerSrc;
}

    export default pdfjs;
