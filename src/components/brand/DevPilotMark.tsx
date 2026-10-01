/**
 * The DevPilot mark and lockup: a terminal prompt in a rounded chip, then
 * "DevPilot", then "Mission control" in small capitals.
 *
 * ONE DRAWING, EVERYWHERE THE PRODUCT NAMES ITSELF. The hosted dashboard had
 * this mark; this cockpit showed a text glyph in its top bar and an unrelated
 * swept-wing favicon, and the marketing site an older compass logo. Someone
 * moving from the website to the dashboard to `devpilot serve` saw what
 * looked like three products.
 *
 * Drawn as plain SVG rather than taken from an icon font so that the same
 * shapes can be the favicon (`src/app/icon.svg`), which cannot import a
 * component. The chip's border and fill are two solid shapes: a translucent
 * stroke straddles the edge and renders as two bands.
 *
 * The hosted app (`devpilot-website`, components/brand/devpilot-mark.tsx)
 * carries an identical copy. Change both, and the icon files with them.
 */
export function DevPilotMark({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" className={className} role="img" aria-label="DevPilot">
      <rect width="64" height="64" rx="16" fill="#125663" />
      <rect x="2" y="2" width="60" height="60" rx="14" fill="#0B2128" />
      <path
        d="M21.3 22.7 L29.3 30.7 L21.3 38.7 M32 41.3 H42.7"
        fill="none"
        stroke="#67E8F9"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Mark, name, descriptor. The descriptor is hidden below the `lg` breakpoint:
 * this top bar also carries the runway and the fleet summary, and on a narrow
 * window those matter more than the product's subtitle.
 */
export function DevPilotLockup({ markClassName = 'h-7 w-7' }: { markClassName?: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <DevPilotMark className={markClassName} />
      <span className="text-sm font-semibold tracking-tight text-text-primary">DevPilot</span>
      <span className="hidden border-l border-border-default pl-2.5 font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted lg:inline">
        Mission control
      </span>
    </span>
  );
}
