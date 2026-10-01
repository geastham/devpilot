/**
 * The DevPilot mark: a compass rose in a ring.
 *
 * One drawing, used wherever the product names itself. The local cockpit used
 * to show a text glyph, the hosted cockpit a terminal icon and the marketing
 * site a 1 MB raster of the full logo squeezed into 32 pixels — three marks
 * for one product, which reads as three products to someone who has just
 * moved from the website to the dashboard to `devpilot serve`.
 *
 * This is the same vector as the favicon (`app/icon.svg`), and is drawn
 * bolder than the source art on purpose: one ring at 3px and a star with real
 * mass is what survives at 16–32px. The hosted app (`devpilot-website`,
 * components/brand/devpilot-mark.tsx) carries an identical copy; change both.
 */
export function DevPilotMark({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="DevPilot"
    >
      <rect width="64" height="64" rx="13" fill="#070A0F" />
      <circle cx="32" cy="32" r="18" fill="none" stroke="#22D3EE" strokeOpacity="0.45" strokeWidth="3" />
      <path d="M32 3 L37.5 26.5 L61 32 L37.5 37.5 L32 61 L26.5 37.5 L3 32 L26.5 26.5 Z" fill="#67E8F9" />
    </svg>
  );
}
