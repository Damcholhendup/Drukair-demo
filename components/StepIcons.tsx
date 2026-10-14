/** One line-icon per onboarding step, indexed in journey order. */

const common = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const PATHS: React.ReactNode[] = [
  // 01 — Check-in: boarding document (ticket VC issued here)
  <g key="checkin" {...common}>
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <circle cx="8.5" cy="10" r="2.2" />
    <path d="M5 16.5c.6-1.7 1.9-2.6 3.5-2.6s2.9.9 3.5 2.6M14.5 9h4M14.5 12.5h4M14.5 16h2.5" />
  </g>,
  // 02 — Boarding gate: pass being scanned (boarding pass VC issued here)
  <g key="gate" {...common}>
    <path d="M3.5 8.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v1.2a2.3 2.3 0 0 0 0 4.6v1.2a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-1.2a2.3 2.3 0 0 0 0-4.6Z" />
    <path d="M13.5 9v1.5M13.5 13.5V15M8 9v6" />
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
