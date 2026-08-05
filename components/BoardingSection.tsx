import BoardingPass from "./BoardingPass";
import Reveal from "./Reveal";

/** Closing section. The seat picker that used to live here has been removed,
 *  so the pass carries a fixed seat and this no longer needs client state. */
export default function BoardingSection() {
  return (
    <section id="boarding" className="relative overflow-hidden py-24 sm:py-28">
      <div className="from-haze-50 to-haze-100 absolute inset-0 bg-gradient-to-b" />
      <div className="from-haze-300/40 absolute -right-40 bottom-0 h-[30rem] w-[30rem] rounded-full bg-gradient-to-br to-transparent blur-3xl" />

      <div className="relative mx-auto w-full max-w-6xl px-6">
        <div className="grid gap-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center lg:gap-20">
          <Reveal className="min-w-0">
            <p className="text-saffron-600 font-mono text-[11px] tracking-[0.4em] uppercase">
              Final step
            </p>
            <h2 className="text-ink-900 mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
              Boarding pass in hand
            </h2>
            <p className="text-ink-500 mt-5 max-w-md leading-relaxed">
              The last thing between the gate and the cabin. Tilt it, then scan
              it at the gate. Placeholder data throughout.
            </p>

            <div className="mt-9 space-y-4">
              {[
                ["Gate", "02 · Paro International"],
                ["Boards", "09:40 · 25 minutes before departure"],
                ["Cabin", "A320neo · Economy"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="border-haze-200 flex items-baseline gap-4 border-b pb-3"
                >
                  <span className="text-ink-400 w-20 shrink-0 font-mono text-[10px] tracking-[0.2em] uppercase">
                    {label}
                  </span>
                  <span className="text-ink-700 text-sm">{value}</span>
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal delay={0.12} className="min-w-0">
            <BoardingPass />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
