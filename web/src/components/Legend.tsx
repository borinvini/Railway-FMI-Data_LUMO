import {
  DELAY_RAMP_HEX,
  ROUTE_BADGE_NO_FIGURE,
  ROUTE_BADGE_STEPS,
  rgbCss,
  type BadgeStep,
} from '../lib/colors'
import { WEATHER_PIN_ICON } from '../lib/markerIcon'

// One example delay inside each badge range, so the sample reads like the real badges on the map.
const EXAMPLE_DELAYS = ['1.4', '3.2', '7.6']

// The same ring colour as the map's badges (Map.tsx).
const RING = '#02060d'

/** A small copy of a route badge: a coloured disc with a number in it, ringed like on the map. */
function BadgeSample({ step, value }: { step: BadgeStep; value: string }) {
  return (
    <span
      className="font-board inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] leading-none font-semibold"
      style={{
        background: rgbCss(step.fill),
        color: rgbCss(step.text),
        border: `3px solid ${RING}`,
      }}
      aria-hidden="true"
    >
      {value}
    </span>
  )
}

/** A small copy of the weather pin: the two-tone teardrop with a temperature over a snow depth. */
function PinSample({ temp, snow }: { temp: string; snow: string }) {
  return (
    <span className="relative inline-block h-14 w-14 shrink-0" aria-hidden="true">
      <img src={WEATHER_PIN_ICON.url} alt="" className="absolute inset-0 h-full w-full" />
      {/* The head's two halves meet at half height; the numerals sit centred in each. */}
      <span className="font-board absolute inset-x-0 text-center text-[17px] leading-none font-semibold text-white" style={{ top: '20%' }}>
        {temp}
      </span>
      <span className="font-board absolute inset-x-0 text-center text-[13px] leading-none font-semibold" style={{ top: '48%', color: '#06101f' }}>
        {snow}
      </span>
    </span>
  )
}

/** Plain-language legend, bottom-left over the map (App places it in a row with Reset view). See
 *  CLAUDE.md "Map style". Shows the pin gradient normally; while a route is highlighted, a sample of
 *  every marker that can appear on it, written the way it looks on the map. */
export default function Legend({ routeMode, weatherShown }: { routeMode: boolean; weatherShown: boolean }) {
  if (routeMode) {
    return (
      <div className="w-[280px] rounded-[10px] border border-(--line) bg-(--surface) px-[18px] py-4 backdrop-blur-[8px]">
        <div className="mb-2.5 text-sm text-(--muted)">Average delay at this stop on the route</div>
        <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm text-(--muted)">
          {ROUTE_BADGE_STEPS.map((step, i) => (
            <li key={step.label} className="flex items-center gap-2.5">
              <BadgeSample step={step} value={EXAMPLE_DELAYS[i]} />
              {step.label}
            </li>
          ))}
          <li className="flex items-center gap-2.5">
            <BadgeSample step={ROUTE_BADGE_NO_FIGURE} value="–" />
            {ROUTE_BADGE_NO_FIGURE.label}
          </li>
          {weatherShown && (
            <>
              <li className="mt-1 border-t border-(--line) pt-3">
                {/* Section title; the two explanations sit to the right of the pin, level with the
                    pin's upper (temperature) and lower (snow depth) halves. */}
                <div className="mb-2 text-sm text-(--muted)">Weather station</div>
                <div className="flex items-center gap-3">
                  <PinSample temp={'−3°'} snow="12 cm" />
                  <span className="relative block h-14 flex-1">
                    <span className="absolute left-0 text-sm leading-none text-(--muted)" style={{ top: '16%' }}>Temperature</span>
                    <span className="absolute left-0 text-sm leading-none text-(--muted)" style={{ top: '48%' }}>Snow depth</span>
                  </span>
                </div>
                <div className="mt-1.5 text-sm text-(--muted)">When this route's trains were there</div>
              </li>
            </>
          )}
        </ul>
      </div>
    )
  }

  return (
    <div className="w-[260px] rounded-[10px] border border-(--line) bg-(--surface) px-[18px] py-4 backdrop-blur-[8px]">
      <div className="text-sm text-(--muted)">Average delay at this station</div>
      <div
        className="my-2 h-1.5 rounded-full"
        style={{ background: `linear-gradient(90deg, ${DELAY_RAMP_HEX.join(', ')})` }}
      />
      <div className="flex justify-between text-sm text-(--muted)">
        <span>on time</span>
        <span>8+ min late</span>
      </div>
    </div>
  )
}
