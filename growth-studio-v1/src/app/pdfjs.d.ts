declare module 'pdfjs-dist/build/pdf.min.mjs' {
  export const GlobalWorkerOptions: { workerSrc: string; workerPort: Worker | null };
  export function getDocument(src: { data: Uint8Array }): {
    promise: Promise<{
      getPage(n: number): Promise<{
        getViewport(o: { scale: number }): { width: number; height: number };
        render(o: { canvas: HTMLCanvasElement; canvasContext: CanvasRenderingContext2D; viewport: unknown }): { promise: Promise<void> };
      }>;
      destroy(): Promise<void>;
    }>;
  };
}
