// MapLibre's worker (maplibre-gl-worker.mjs) imports a sibling chunk (maplibre-gl-shared.mjs)
// via a relative ES module `import`. Pulling the worker in as a Vite `?url` asset (the
// previous approach) only emits the single file you import -- it does NOT follow or copy
// files that file itself imports. That left maplibre-gl-shared.mjs missing from the
// production build: the worker's own import 404'd (silently, via vite preview's SPA
// fallback returning index.html for the missing path with a 200, which then fails to
// parse as a module), so the worker never loaded. Symptom: no console error, the basemap
// style/attribution loads fine, but no vector tiles ever render -- only layers that don't
// depend on the worker (our deck.gl station/connection layers) show up.
//
// Fix: copy both files verbatim into public/ as static assets, untouched by Vite's bundler,
// so the worker's relative import keeps resolving against its sibling exactly as the
// maplibre-gl package ships them. Map.tsx references the worker by this public path
// directly instead of importing it.
//
// Run via `predev`/`prebuild` (see package.json) so this stays in sync with whatever
// maplibre-gl version is installed -- these copies are gitignored, not checked in.

import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const srcDir = join(here, '..', 'node_modules', 'maplibre-gl', 'dist')
const destDir = join(here, '..', 'public', 'maplibre')

mkdirSync(destDir, { recursive: true })
for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  copyFileSync(join(srcDir, file), join(destDir, file))
}
console.log(`copied maplibre-gl worker files -> ${destDir}`)
