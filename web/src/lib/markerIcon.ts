/**
 * A single reusable "map pin" marker icon for stations on the map, drawn inline as an SVG
 * data URI rather than a shipped asset file -- the classic teardrop pin with a punched-through
 * circular hole (deck.gl's own IconLayer docs example uses this exact shape). Solid white on
 * transparent, `mask: true` so deck.gl's IconLayer tints it per-station via `getColor` (same
 * delayColor ramp used elsewhere) instead of needing a separate colored icon per delay bucket.
 *
 * The pin's point sits at the icon's bottom edge (anchorY = SIZE), so it anchors exactly at
 * the station's [lon, lat] -- combined with the map's tilted camera, the pin appears to stand
 * up off the surface rather than lying flat like a dot.
 */
const SIZE = 24

// The standard "map pin with a hole" path (viewBox 0 0 24 24) -- the same shape used by
// Google's Material "place" icon and deck.gl's own IconLayer docs example. fill-rule="evenodd"
// makes the inner circle a transparent hole regardless of the two subpaths' winding direction.
const PIN_PATH =
  'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z' +
  'm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z'

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 24 24">
  <path fill-rule="evenodd" clip-rule="evenodd" d="${PIN_PATH}" fill="white"/>
</svg>`

export const STATION_MARKER_ICON = {
  url: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
  width: SIZE,
  height: SIZE,
  anchorX: SIZE / 2,
  anchorY: SIZE,
  mask: true,
} as const

// Same pin, but with a stroke added around the same path -- rendered at the SAME on-screen size
// as STATION_MARKER_ICON (not scaled up), this expands the pin's outer edge outward by half the
// stroke width *and* shrinks its inner hole by half the stroke width, since SVG strokes straddle
// both sides of a path. Tinted solid black and drawn underneath the coloured pin, that gives a
// uniform ring around the whole silhouette -- outer edge and the punched-through hole alike --
// instead of a plain bigger copy of the pin sitting behind it (which only outlines the outer
// edge and distorts the hole).
const outlineSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 24 24">
  <path fill-rule="evenodd" clip-rule="evenodd" d="${PIN_PATH}" fill="white" stroke="white" stroke-width="1.6"/>
</svg>`

export const STATION_MARKER_OUTLINE_ICON = {
  url: `data:image/svg+xml;utf8,${encodeURIComponent(outlineSvg)}`,
  width: SIZE,
  height: SIZE,
  anchorX: SIZE / 2,
  anchorY: SIZE,
  mask: true,
} as const
