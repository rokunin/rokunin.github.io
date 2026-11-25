// `npm run build`: src/ → the single index.html next to this file, unminified (ADR-0003).
// Vite 8 prints the code anew: comments drop and indents become tabs. The sources with their comments are src/.
// `vite build --mode test --outDir <dir>` (dev/harness/build.py) builds the test page: the same build plus the debug registry.
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(async ({ mode }) => {
  const plugins = [viteSingleFile({ removeViteModuleLoader: true })];
  if (mode === 'test') {
    const { default: testSeams } = await import('./dev/harness/vite-test.js');
    plugins.push(testSeams(new URL('./dev/harness/names.txt', import.meta.url).pathname));
  }
  return {
    root: 'src',
    publicDir: false,
    plugins,
    build: { outDir: '..', emptyOutDir: false, minify: false, target: 'esnext', reportCompressedSize: false },
  };
});
