/**
 * A single reusable "stick + ball" marker icon for stations on the map, drawn inline as an
 * SVG data URI rather than a shipped asset file. Solid white on transparent, `mask: true` so
 * deck.gl's IconLayer tints it per-station via `getColor` (same delayColor ramp used
 * elsewhere) instead of needing a separate colored icon per delay bucket.
 *
 * The stick's base sits at the icon's bottom edge (anchorY = HEIGHT), so it anchors exactly at
 * the station's [lon, lat] and the ball appears to float above that point -- combined with the
 * map's tilted camera, this is what reads as "3D" rather than a flat dot.
 */
const WIDTH = 24
const HEIGHT = 40
const STICK_TOP_Y = 14
const BALL_CENTER_Y = 9
const BALL_RADIUS = 7

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <line x1="${WIDTH / 2}" y1="${HEIGHT}" x2="${WIDTH / 2}" y2="${STICK_TOP_Y}" stroke="white" stroke-width="2" stroke-linecap="round"/>
  <circle cx="${WIDTH / 2}" cy="${BALL_CENTER_Y}" r="${BALL_RADIUS}" fill="white"/>
</svg>`

export const STATION_MARKER_ICON = {
  url: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
  width: WIDTH,
  height: HEIGHT,
  anchorX: WIDTH / 2,
  anchorY: HEIGHT,
  mask: true,
} as const
