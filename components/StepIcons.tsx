/** One line-icon per onboarding step, indexed in journey order. */

const common = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const PATHS: React.ReactNode[] = [
  // 01 — Check-in: boarding document
  <g key="checkin" {...common}>
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <circle cx="8.5" cy="10" r="2.2" />
    <path d="M5 16.5c.6-1.7 1.9-2.6 3.5-2.6s2.9.9 3.5 2.6M14.5 9h4M14.5 12.5h4M14.5 16h2.5" />
  </g>,
  // 02 — Baggage drop: suitcase
  <g key="bag" {...common}>
    <rect x="4" y="7.5" width="16" height="13" rx="2.2" />
    <path d="M9 7.5V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2.5M9.5 11v6M14.5 11v6" />
  </g>,
  // 03 — Security: shield check
  <g key="security" {...common}>
    <path d="M12 3.2 19.5 6v6c0 4.3-3 7.5-7.5 8.8C7.5 19.5 4.5 16.3 4.5 12V6L12 3.2Z" />
    <path d="m8.8 11.9 2.3 2.3 4.1-4.4" />
  </g>,
  // 04 — Immigration: passport stamp
  <g key="immigration" {...common}>
    <circle cx="12" cy="10" r="5.2" />
    <path d="M6.8 10h10.4M12 4.8c1.6 1.4 2.5 3.2 2.5 5.2s-.9 3.8-2.5 5.2c-1.6-1.4-2.5-3.2-2.5-5.2s.9-3.8 2.5-5.2Z" />
    <path d="M5 19.2h14" strokeWidth={2.2} />
  </g>,
  // 05 — Boarding gate: pass being scanned
  <g key="gate" {...common}>
    <path d="M3.5 8.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v1.2a2.3 2.3 0 0 0 0 4.6v1.2a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-1.2a2.3 2.3 0 0 0 0-4.6Z" />
    <path d="M13.5 9v1.5M13.5 13.5V15M8 9v6" />
  </g>,
  // 06 — Cabin seat
  <g key="seat" {...common}>
    <path d="M7 4.5h2.6a2 2 0 0 1 2 1.8l.7 7.2H8.4a2 2 0 0 1-2-1.8L5.8 6.3A1.6 1.6 0 0 1 7 4.5Z" />
    <path d="M12.3 13.5H18a2 2 0 0 1 0 4h-7.6a3 3 0 0 1-3-2.7l-.1-1.3M6 19.5h12" />
  </g>,
];

export function StepIcon({
  index,
  className = "",
}: {
  index: number;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      {PATHS[index] ?? PATHS[0]}
    </svg>
  );
}
