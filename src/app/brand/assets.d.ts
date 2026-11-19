// Image files imported by the app: Vite and esbuild (scripts/build-artifact.mjs, `dataurl` loader) give their address.
declare module '*.png' {
  const url: string;
  export default url;
}
