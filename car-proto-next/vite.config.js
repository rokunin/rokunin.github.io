// `npm run build`: src/ → the single index.html next to this file, unminified (ADR-0003).
// Vite 8 prints the code anew: comments drop and indents become tabs. The sources with their comments are src/.
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  root: 'src',
  publicDir: false,
  plugins: [viteSingleFile({ removeViteModuleLoader: true })],
  build: { outDir: '..', emptyOutDir: false, minify: false, target: 'esnext', reportCompressedSize: false },
});
