import { PlaneIcon } from "./Brand";

const ITEMS = [
  "On the wings of the dragon",
  "Paro · PBH",
  "Passenger onboarding",
  "Concept design",
  "Kingdom of Bhutan",
  "Gate to cabin",
];

/** Infinite ticker — the track holds two copies and slides by exactly half. */
export default function Marquee() {
  const track = [...ITEMS, ...ITEMS];

  return (
    <div className="border-haze-200 relative overflow-hidden border-y bg-white py-4">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-white to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-white to-transparent" />

      <div className="animate-marquee flex w-max items-center gap-10">
        {track.map((item, i) => (
          <span
            key={`${item}-${i}`}
            className="text-ink-500 flex shrink-0 items-center gap-10 font-mono text-[11px] tracking-[0.3em] whitespace-nowrap uppercase"
          >
            {item}
            <PlaneIcon className="text-saffron-500/60 h-3.5 w-3.5" />
          </span>
        ))}
      </div>
    </div>
  );
}
