import { resolve } from 'path';
import { defineConfig, build } from 'vite';
import type { Plugin } from 'vite';
import dts from 'vite-plugin-dts';

const r = (p: string) => resolve(__dirname, p);

/**
 * Vite plugin that builds the IIFE CDN bundle after the ESM library build
 * completes. Runs the second pass with emptyOutDir: false so the ESM output
 * is preserved.
 *
 * Vite 5.x does not support array config exports, so the two-pass build is
 * implemented as a closeBundle plugin hook instead of [esmConfig, iifConfig].
 */
function buildCdnIife(): Plugin {
  // Guard against multiple invocations (closeBundle fires per output chunk).
  let built = false;

  return {
    name: 'build-cdn-iife',
    apply: 'build',
    async closeBundle() {
      if (built) return;
      built = true;

      await build({
        configFile: false,
        build: {
          outDir: resolve(__dirname, 'dist/v3'),
          emptyOutDir: false, // do NOT clear ESM output
          lib: {
            entry: r('src/cdn.ts'),
            name: 'TableCrafter',
            formats: ['iife'],
            fileName: () => 'tablecrafter.global.js',
          },
          minify: true,
          rollupOptions: {
            external: ['xlsx', 'jspdf', 'jspdf-autotable'],
            output: { inlineDynamicImports: true },
          },
        },
      });
    },
  };
}

/**
 * Vite v3 build configuration (lib mode, multi-entry ESM + IIFE CDN bundle).
 *
 * Run via: npm run build:v3
 *
 * Outputs (all under dist/v3/):
 *   *.mjs          -- ESM per-entry (tree-shakeable)
 *   tablecrafter.global.js -- minified IIFE for CDN/unpkg
 *   *.d.ts         -- generated TypeScript declarations
 *   styles.css     -- CSS layers theme file (copied from src/)
 */
export default defineConfig({
  build: {
    outDir: 'dist/v3',
    emptyOutDir: true,
    lib: {
      entry: {
        // Batteries wrapper (default export)
        index: r('src/index.ts'),
        // Core (headless store)
        'core/index': r('src/core/state.ts'),
        // Leaf modules
        'sorting/index': r('src/sorting/index.ts'),
        'filtering/index': r('src/filtering/index.ts'),
        'filtering/grammar': r('src/filtering/grammar.ts'),
        'filtering/fuzzy': r('src/filtering/fuzzy.ts'),
        'editing/index': r('src/editing/index.ts'),
        'editing/history': r('src/editing/history.ts'),
        'validation/index': r('src/validation/index.ts'),
        'permissions/index': r('src/permissions/index.ts'),
        'i18n/index': r('src/i18n/index.ts'),
        'export/csv': r('src/export/csv.ts'),
        'export/json': r('src/export/json.ts'),
        'export/print': r('src/export/print.ts'),
        'export/xlsx': r('src/export/xlsx.ts'),
        'export/pdf': r('src/export/pdf.ts'),
        'render/dom': r('src/render/dom.ts'),
        'render/virtual': r('src/render/virtual.ts'),
        'render/a11y': r('src/render/a11y.ts'),
        'cells/index': r('src/cells/index.ts'),
        // Per-cell entries so `./cells/*` subpath imports resolve (RFC #379)
        'cells/badge': r('src/cells/badge.ts'),
        'cells/progress': r('src/cells/progress.ts'),
        'cells/sparkline': r('src/cells/sparkline.ts'),
        'cells/link': r('src/cells/link.ts'),
        'cells/star': r('src/cells/star.ts'),
        'cells/heatmap': r('src/cells/heatmap.ts'),
        'cells/conditional': r('src/cells/conditional.ts'),
        'cells/autoformat': r('src/cells/autoformat.ts'),
        'cells/descriptors': r('src/cells/descriptors.ts'),
        'cells/registry': r('src/cells/registry.ts'),
        'adapters/inline': r('src/adapters/inline.ts'),
        'adapters/json': r('src/adapters/json.ts'),
        'adapters/csv': r('src/adapters/csv.ts'),
        'adapters/google-sheets': r('src/adapters/google-sheets.ts'),
        'adapters/xml': r('src/adapters/xml.ts'),
        'adapters/pagination-link': r('src/adapters/pagination-link.ts'),
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.mjs`,
    },
    rollupOptions: {
      // Optional peer deps: never bundle, always dynamic import
      external: ['xlsx', 'jspdf', 'jspdf-autotable'],
      output: {
        // Preserve module directory structure in output
        preserveModules: false,
      },
    },
  },
  plugins: [
    dts({
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/tablecrafter.js',
      ],
      outDir: 'dist/v3',
      insertTypesEntry: false,
      rollupTypes: false,
      tsconfigPath: './tsconfig.v3.json',
    }),
    buildCdnIife(),
  ],
});
