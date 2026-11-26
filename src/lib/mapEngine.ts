// MapLibre and everything it needs at runtime. Imported only through loadMapLib (./mapLib),
// so the build puts it in its own chunk instead of the app's main bundle.
import { Map as MapLibreMap, Marker, NavigationControl, setWorkerUrl } from 'maplibre-gl'
// v6 loads its tile worker from a separate file; the build emits it (see vite.config.ts)
import mapWorkerUrl from 'virtual:maplibre-worker-url'
import 'maplibre-gl/dist/maplibre-gl.css'

if (mapWorkerUrl) setWorkerUrl(mapWorkerUrl)

// Only what the app uses, so the bundler can drop the rest of MapLibre's exports.
export default { Map: MapLibreMap, Marker, NavigationControl }
