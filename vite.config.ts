import { defineConfig } from 'vite';

// Relative asset paths: the same build works at the site root and under a
// sub-path (Area Planner serves it at /studio/ through a rewrite).
export default defineConfig({
  base: './',
  worker: { format: 'es' },
});
