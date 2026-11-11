/** Render the first page of a PDF blueprint to a PNG blob with pdf.js. */
export async function pdfFirstPage(file: Blob, maxSide = 2400): Promise<Blob> {
  const pdfjs = await import('pdfjs-dist/build/pdf.min.mjs');
  const inline = document.getElementById('pdf-worker');
  if (inline?.textContent) {
    const url = URL.createObjectURL(new Blob([inline.textContent], { type: 'text/javascript' }));
    pdfjs.GlobalWorkerOptions.workerPort = new Worker(url, { type: 'module' });
  } else {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  }
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const page = await doc.getPage(1);
  const v1 = page.getViewport({ scale: 1 });
  const scale = Math.min(4, maxSide / Math.max(v1.width, v1.height));
  const vp = page.getViewport({ scale });
  const c = document.createElement('canvas');
  c.width = Math.round(vp.width);
  c.height = Math.round(vp.height);
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  await page.render({ canvas: c, canvasContext: g, viewport: vp }).promise;
  await doc.destroy();
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('The PDF page could not be drawn.'))), 'image/png'));
}
