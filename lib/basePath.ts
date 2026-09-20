/**
 * The subpath the app is served from.
 *
 * One rule, matching `next.config.mjs` and `scripts/build.ts`, so that every
 * link, asset and service worker registration agrees: the site root, unless
 * NEXT_PUBLIC_BASE_PATH asks for a subpath explicitly. Only the GitHub Pages
 * build sets it, to "/tile-game"; dev, the local static build and the
 * Capacitor builds all serve from the root.
 *
 * Note `??` rather than `||`. An explicit empty base path is a real setting,
 * not a missing one, and treating it as missing is what once sent the page
 * looking for /tile-game/_next/... on a site served from the root: the HTML
 * loads, none of the scripts do, and the result is a blank white page.
 *
 * Next replaces `process.env.NEXT_PUBLIC_BASE_PATH` with a literal at build
 * time, so this is resolved in the bundle rather than read at runtime.
 */
export const BASE_PATH: string = process.env.NEXT_PUBLIC_BASE_PATH ?? ""
