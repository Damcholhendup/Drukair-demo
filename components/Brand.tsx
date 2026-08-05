/**
 * Brand primitives — inline SVG so they inherit colour, scale crisply and
 * cost no network requests. The mark is an original abstraction of the
 * "thunder dragon" idea (wing sweep + bolt), not a copy of the real logo.
 */

export function DragonMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="dm-wing" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--color-saffron-600)" />
          <stop offset="55%" stopColor="var(--color-saffron-500)" />
          <stop offset="100%" stopColor="var(--color-gold-300)" />
        </linearGradient>
      </defs>

      {/* Badge ring */}
      <circle
        cx="32"
        cy="32"
        r="29"
        fill="none"
        stroke="var(--color-gold-400)"
        strokeWidth="1.5"
        opacity="0.75"
      />
      <circle
        cx="32"
        cy="32"
        r="24.5"
        fill="none"
        stroke="var(--color-gold-400)"
        strokeWidth="0.75"
        opacity="0.35"
      />

      {/* Three swept feathers reading as a wing in motion */}
      <g fill="none" stroke="url(#dm-wing)" strokeLinecap="round">
        <path d="M14 46C24 42 34 34 44 18" strokeWidth="4.5" />
        <path d="M17 51C29 48 40 40 50 25" strokeWidth="3" opacity="0.85" />
        <path d="M23 54C35 52 45 46 54 34" strokeWidth="1.75" opacity="0.6" />
      </g>

      {/* Thunder bolt — inherits colour so the mark works on the dark hero,
          the white nav and the navy footer without three variants. */}
      <path
        d="M31 12L20 32h8l-3 15 13-21h-8l4-13z"
        fill="currentColor"
        opacity="0.95"
      />
    </svg>
  );
}

/* No display utility baked in: callers own it. Hardcoding `inline-flex` here
   silently beat a caller's `hidden` in the cascade, so the mark never hid. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`items-baseline gap-2 ${className}`}>
      <span className="text-lg font-semibold tracking-[0.2em] uppercase">
        Drukair
      </span>
      <span className="text-saffron-500 font-mono text-[10px] tracking-[0.3em] uppercase">
        KB
      </span>
    </span>
  );
}

/** Top-down airliner silhouette, nose pointing +x, centred on (0,0). */
export function PlaneGlyph({
  className = "",
  fill = "currentColor",
}: {
  className?: string;
  fill?: string;
}) {
  return (
    <g className={className}>
      <path
        transform="translate(-32,-32)"
        d="M62 32 L50 29.5 L44 29 L24 6 L18 6 L22 28 L16 28.5 L10 16 L5 16 L7 29 L2 30.5 L2 33.5 L7 35 L5 48 L10 48 L16 35.5 L22 36 L18 58 L24 58 L44 35 L50 34.5 Z"
        fill={fill}
      />
    </g>
  );
}

/** Same silhouette as a standalone <svg> for use in flowing content. */
export function PlaneIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <g transform="translate(32,32)">
        <PlaneGlyph />
      </g>
    </svg>
  );
}

/** Five-colour ribbon nodding to Bhutanese prayer flags. */
export function PrayerRibbon({ className = "" }: { className?: string }) {
  const colours = ["#1c5c96", "#f6f1e7", "#d8382a", "#1f7a4d", "#f5b841"];
  return (
    <div className={`flex h-1 w-full overflow-hidden ${className}`} aria-hidden="true">
      {colours.map((c) => (
        <span key={c} className="h-full flex-1" style={{ background: c }} />
      ))}
    </div>
  );
}
