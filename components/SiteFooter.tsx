import { DragonMark, PrayerRibbon, Wordmark } from "./Brand";

export default function SiteFooter() {
  return (
    <footer className="bg-ink-900 relative text-white">
      <PrayerRibbon />

      <div className="mx-auto w-full max-w-6xl px-6 py-14">
        <div className="flex flex-col justify-between gap-10 sm:flex-row sm:items-end">
          <div>
            <div className="flex items-center gap-3 text-white">
              <DragonMark className="w-10" />
              <Wordmark className="inline-flex" />
            </div>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-white/55">
              A Drukair website concept for the passenger onboarding process.
              Design demonstration — not affiliated with, or endorsed by, the
              airline.
            </p>
          </div>

          <div className="font-mono text-[10px] tracking-[0.24em] text-white/45 uppercase">
            <p>Paro · Bhutan</p>
            <p className="mt-2">Single-page concept</p>
          </div>
        </div>

        <div className="mt-12 h-px bg-white/15" />

        <p className="mt-6 font-mono text-[10px] tracking-[0.2em] text-white/35 uppercase">
          Placeholder content throughout
        </p>
      </div>
    </footer>
  );
}
