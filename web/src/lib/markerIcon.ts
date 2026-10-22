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

// Flat round badge used while a route is highlighted (see Map.tsx): one solid white circle,
// tinted per station (`mask: true`) and drawn twice -- once a little larger as the ring, once as
// the coloured fill -- with the delay number on top. Anchored at its centre, unlike the pin.
const BADGE_SIZE = 64

const badgeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${BADGE_SIZE}" height="${BADGE_SIZE}" viewBox="0 0 ${BADGE_SIZE} ${BADGE_SIZE}">
  <circle cx="${BADGE_SIZE / 2}" cy="${BADGE_SIZE / 2}" r="${BADGE_SIZE / 2 - 1}" fill="white"/>
</svg>`

export const ROUTE_BADGE_ICON = {
  url: `data:image/svg+xml;utf8,${encodeURIComponent(badgeSvg)}`,
  width: BADGE_SIZE,
  height: BADGE_SIZE,
  anchorX: BADGE_SIZE / 2,
  anchorY: BADGE_SIZE / 2,
  mask: true,
} as const

// Weather station pin: a map pin like the station pins, so its tip sits exactly on the weather
// station's real location. The head is split in two so the two figures read as two things: the
// upper half is navy and carries the temperature (white numerals), the lower half is ice blue and
// carries the snow depth (navy numerals) -- literally snow-coloured, and no new hue: colour on this
// map is reserved for delay. The grey variant (outline and lower half) means "no figure for this
// route's own trains, the average at the nearby stations is shown", the grey of the delay badges'
// fallback ring. The numerals are written on top by TextLayers (see Map.tsx), so the divider sits
// between the two text lines. Full colour, not a mask. Anchored at the pin's tip.
const WS_SIZE = 64
const WS_PIN_PATH = 'M32 3C18.7 3 8 13.7 8 27c0 17.2 24 34 24 34s24-16.8 24-34C56 13.7 45.3 3 32 3Z'
// Where the head divides, in icon units (the temperature line is centred above it, snow below).
const WS_SPLIT_Y = 32

const weatherPinSvg = (accent: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${WS_SIZE}" height="${WS_SIZE}" viewBox="0 0 64 64">
  <defs><clipPath id="p"><path d="${WS_PIN_PATH}"/></clipPath></defs>
  <g clip-path="url(#p)">
    <rect width="64" height="64" fill="#06101f"/>
    <rect y="${WS_SPLIT_Y}" width="64" height="${64 - WS_SPLIT_Y}" fill="${accent}"/>
  </g>
  <path d="${WS_PIN_PATH}" fill="none" stroke="${accent}" stroke-width="4" stroke-linejoin="round"/>
</svg>`

const weatherPinIcon = (accent: string) =>
  ({
    url: `data:image/svg+xml;utf8,${encodeURIComponent(weatherPinSvg(accent))}`,
    width: WS_SIZE,
    height: WS_SIZE,
    anchorX: WS_SIZE / 2,
    anchorY: WS_SIZE,
    mask: false,
  }) as const

export const WEATHER_PIN_ICON = weatherPinIcon('#9cc3e8')
export const WEATHER_PIN_GREY_ICON = weatherPinIcon('#8597ab')

// The "Live" train: a white disc with a navy train-front glyph, centred. Full colour, no delay
// colour (colour on this map is reserved for delay).
const TRAIN_SIZE = 64

const liveTrainSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${TRAIN_SIZE}" height="${TRAIN_SIZE}" viewBox="0 0 64 64">
  <circle cx="32" cy="32" r="29" fill="#ffffff" stroke="#06101f" stroke-width="4"/>
  <rect x="19" y="15" width="26" height="29" rx="6" fill="#06101f"/>
  <rect x="23" y="19" width="18" height="11" rx="2.5" fill="#ffffff"/>
  <circle cx="26" cy="37" r="2.6" fill="#ffffff"/>
  <circle cx="38" cy="37" r="2.6" fill="#ffffff"/>
  <path d="M23 48l-4 6M41 48l4 6" stroke="#06101f" stroke-width="4" stroke-linecap="round"/>
</svg>`

export const LIVE_TRAIN_ICON = {
  url: `data:image/svg+xml;utf8,${encodeURIComponent(liveTrainSvg)}`,
  width: TRAIN_SIZE,
  height: TRAIN_SIZE,
  anchorX: TRAIN_SIZE / 2,
  anchorY: TRAIN_SIZE / 2,
  mask: false,
} as const
