// URL of MapLibre's tile worker chunk; empty in dev (see vite.config.ts).
declare module 'virtual:maplibre-worker-url' {
  const url: string
  export default url
}
