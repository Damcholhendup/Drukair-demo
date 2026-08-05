"use client";

import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useSpring,
} from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { PlaneGlyph } from "./Brand";
import NdiButton from "./ndi/NdiButton";
import NdiScanModal from "./ndi/NdiScanModal";
import Reveal from "./Reveal";
import { StepIcon } from "./StepIcons";

/** The six stages a passenger passes through on the way to their seat. */
const STEPS = [
  {
    code: "01",
    title: "Check-in",
    blurb:
      "Prove who you are with your Bhutan NDI wallet. Scan the code, share the requested credential, and check-in completes.",
    meta: ["Bhutan NDI", "T-90 min"],
  },
  {
    code: "02",
    title: "Baggage drop",
    blurb: "Placeholder copy for the baggage drop stage of the onboarding process.",
    meta: ["Tagged", "T-80 min"],
  },
  {
    code: "03",
    title: "Security",
    blurb: "Placeholder copy for the security screening stage of the process.",
    meta: ["Screening", "T-60 min"],
  },
  {
    code: "04",
    title: "Immigration",
    blurb: "Placeholder copy for the immigration and document check stage.",
    meta: ["Documents", "T-45 min"],
  },
  {
    code: "05",
    title: "Boarding gate",
    blurb: "Placeholder copy for the boarding gate and pass scan stage.",
    meta: ["Gate 2", "T-25 min"],
  },
  {
    code: "06",
    title: "Cabin seat",
    blurb: "Placeholder copy for taking your seat inside the aircraft cabin.",
    meta: ["Onboard", "T-10 min"],
  },
] as const;

const RAIL =
  "M 46 182 C 190 62, 336 62, 476 142 C 616 222, 754 220, 890 118 C 968 60, 1064 52, 1158 82";

const DWELL_MS = 4600;

export default function OnboardingJourney() {
  const reduce = useReducedMotion();
  const pathRef = useRef<SVGPathElement>(null);
  const planeRef = useRef<SVGGElement>(null);
  const trailRef = useRef<SVGPathElement>(null);
  const glowRef = useRef<SVGPathElement>(null);

  const [nodes, setNodes] = useState<{ x: number; y: number }[]>([]);
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [held, setHeld] = useState(false);
  const [ndiOpen, setNdiOpen] = useState(false);

  const progress = useSpring(0, {
    stiffness: reduce ? 400 : 46,
    damping: reduce ? 40 : 15,
    mass: 0.9,
  });

  /** Place the plane and reveal the trail up to `v` (0 → 1 along the rail).
   *  The aircraft rides a fixed offset above the rail, on the path normal, so
   *  it never sits on top of a stage marker. */
  const place = useCallback((v: number) => {
    const path = pathRef.current;
    if (!path) return;
    const len = path.getTotalLength();
    const at = Math.max(0, Math.min(1, v)) * len;
    const p = path.getPointAtLength(at);
    const q = path.getPointAtLength(Math.min(len, at + 2));
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

    // Unit normal pointing away from the rail (upward for a rightward tangent).
    const mag = Math.hypot(dx, dy) || 1;
    const OFFSET = 30;
    const nx = (dy / mag) * OFFSET;
    const ny = (-dx / mag) * OFFSET;

    planeRef.current?.setAttribute(
      "transform",
      `translate(${(p.x + nx).toFixed(2)} ${(p.y + ny).toFixed(2)}) rotate(${angle.toFixed(2)}) scale(0.46)`,
    );
    const offset = (1 - Math.max(0, Math.min(1, v))).toFixed(4);
    trailRef.current?.setAttribute("stroke-dashoffset", offset);
    glowRef.current?.setAttribute("stroke-dashoffset", offset);
  }, []);

  // Resolve node coordinates from the rail geometry once it is in the DOM.
  useEffect(() => {
    const path = pathRef.current;
    if (!path) return;
    const len = path.getTotalLength();
    setNodes(
      STEPS.map((_, i) => {
        const p = path.getPointAtLength((i / (STEPS.length - 1)) * len);
        return { x: p.x, y: p.y };
      }),
    );
    place(0);
  }, [place]);

  useMotionValueEvent(progress, "change", place);

  useEffect(() => {
    progress.set(active / (STEPS.length - 1));
  }, [active, progress]);

  // Auto-advance, paused while the visitor is interacting with the section or
  // while the NDI popup is up — the rail must not move out from under it.
  useEffect(() => {
    if (!playing || held || reduce || ndiOpen) return;
    const id = window.setTimeout(
      () => setActive((a) => (a + 1) % STEPS.length),
      DWELL_MS,
    );
    return () => window.clearTimeout(id);
  }, [active, playing, held, reduce, ndiOpen]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const last = STEPS.length - 1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(last, a + 1));
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(last);
    }
  };

  const step = STEPS[active];

  return (
    <section
      id="journey"
      className="relative overflow-hidden py-24 sm:py-28"
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocusCapture={() => setHeld(true)}
      onBlurCapture={() => setHeld(false)}
    >
      <div className="from-haze-100 via-haze-50 to-haze-50 absolute inset-0 bg-gradient-to-b" />
      <div className="from-haze-300/35 absolute -top-32 -left-32 h-[26rem] w-[26rem] rounded-full bg-gradient-to-br to-transparent blur-3xl" />

      <div className="relative mx-auto w-full max-w-6xl px-6">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-saffron-600 font-mono text-[11px] tracking-[0.4em] uppercase">
                The process
              </p>
              <h2 className="text-ink-900 mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
                From the counter to the cabin
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              aria-pressed={playing}
              className="panel text-ink-500 hover:text-ink-900 inline-flex items-center gap-2.5 rounded-full px-5 py-2.5 font-mono text-[11px] tracking-[0.2em] uppercase transition-colors"
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${playing ? "bg-saffron-500 animate-pulse" : "bg-haze-400"}`}
              />
              {playing ? "Auto" : "Manual"}
            </button>
          </div>
        </Reveal>

        {/* ---------- The flight-path rail (pointer-driven, decorative) ---------- */}
        <Reveal delay={0.1}>
          <div
            aria-hidden="true"
            className="relative mt-14 hidden w-full md:block"
            style={{ aspectRatio: "1200 / 240" }}
          >
            <svg
              viewBox="0 0 1200 240"
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full overflow-visible"
            >
              <defs>
                <linearGradient id="rail-live" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="var(--color-saffron-600)" />
                  <stop offset="60%" stopColor="var(--color-saffron-500)" />
                  <stop offset="100%" stopColor="var(--color-gold-400)" />
                </linearGradient>
                <filter id="rail-glow" x="-20%" y="-40%" width="140%" height="180%">
                  <feGaussianBlur stdDeviation="6" />
                </filter>
              </defs>

              {/* Untravelled rail */}
              <path
                ref={pathRef}
                d={RAIL}
                fill="none"
                stroke="var(--color-ink-900)"
                strokeOpacity="0.16"
                strokeWidth="1.5"
                strokeDasharray="5 8"
              />
              {/* Travelled rail — glow layer then crisp layer */}
              <path
                ref={glowRef}
                d={RAIL}
                pathLength="1"
                fill="none"
                stroke="url(#rail-live)"
                strokeWidth="8"
                strokeOpacity="0.22"
                strokeDasharray="1"
                strokeDashoffset="1"
                filter="url(#rail-glow)"
              />
              <path
                ref={trailRef}
                d={RAIL}
                pathLength="1"
                fill="none"
                stroke="url(#rail-live)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray="1"
                strokeDashoffset="1"
              />

              {/* Stage markers. These live inside the SVG so the aircraft,
                  drawn last, passes over them instead of under. */}
              {nodes.map((n, i) => {
                const done = i <= active;
                const isHere = i === active;
                return (
                  <motion.g
                    key={STEPS[i].code}
                    transform={`translate(${n.x} ${n.y})`}
                    onClick={() => setActive(i)}
                    className="cursor-pointer"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.06 * i }}
                  >
                    {/* Generous invisible hit area */}
                    <circle r="30" fill="transparent" />
                    {isHere && (
                      <motion.circle
                        r="20"
                        fill="var(--color-saffron-500)"
                        animate={{ scale: [1, 2.1], opacity: [0.32, 0] }}
                        transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut" }}
                      />
                    )}
                    <circle
                      r={isHere ? 22 : 18}
                      fill="#ffffff"
                      stroke={
                        isHere
                          ? "var(--color-saffron-500)"
                          : done
                            ? "rgba(242,107,29,0.5)"
                            : "var(--color-haze-300)"
                      }
                      strokeWidth={isHere ? 2.5 : 1.5}
                      style={{ transition: "r 400ms ease" }}
                    />
                    <text
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize="13"
                      fontFamily="var(--font-geist-mono), monospace"
                      fill={
                        isHere
                          ? "var(--color-saffron-600)"
                          : done
                            ? "rgba(217,84,26,0.85)"
                            : "var(--color-ink-400)"
                      }
                    >
                      {STEPS[i].code}
                    </text>
                  </motion.g>
                );
              })}

              {/* Aircraft riding the rail — the "you are here" marker */}
              <g ref={planeRef}>
                <g
                  className="text-ink-900"
                  style={{ filter: "drop-shadow(0 1px 3px rgba(12,35,55,0.35))" }}
                >
                  <PlaneGlyph fill="currentColor" />
                </g>
              </g>
            </svg>
          </div>
        </Reveal>

        {/* ---------- Accessible step control ---------- */}
        <Reveal delay={0.15}>
          <div
            role="tablist"
            aria-label="Passenger onboarding steps"
            onKeyDown={onKeyDown}
            className="mt-8 flex snap-x gap-2.5 overflow-x-auto pb-2 md:mt-10 md:flex-wrap md:overflow-visible"
          >
            {STEPS.map((s, i) => (
              <button
                key={s.code}
                role="tab"
                id={`step-tab-${s.code}`}
                aria-selected={i === active}
                aria-controls={`step-panel-${s.code}`}
                tabIndex={i === active ? 0 : -1}
                onClick={() => setActive(i)}
                className={`group flex shrink-0 snap-start items-center gap-2.5 rounded-full border px-4 py-2.5 text-sm whitespace-nowrap transition-all duration-400 ${
                  i === active
                    ? "border-saffron-500/60 bg-saffron-500/10 text-ink-900"
                    : "border-haze-200 text-ink-500 hover:border-haze-400 hover:text-ink-900 bg-white"
                }`}
              >
                <span className="font-mono text-[10px] opacity-60">{s.code}</span>
                <StepIcon
                  index={i}
                  className={`h-4 w-4 transition-colors ${i === active ? "text-saffron-500" : ""}`}
                />
                {s.title}
              </button>
            ))}
          </div>
        </Reveal>

        {/* ---------- Detail panel ---------- */}
        <Reveal delay={0.2}>
          {/* min-height keeps the card from resizing as step copy changes length */}
          <div className="panel relative mt-8 min-h-[15rem] overflow-hidden rounded-3xl p-8 sm:min-h-[13.5rem] sm:p-10">
            {/* dwell timer */}
            <div className="absolute inset-x-0 top-0 h-[2px] overflow-hidden">
              <motion.div
                key={`${active}-${playing}-${held}`}
                className="from-saffron-500 to-gold-400 h-full bg-gradient-to-r"
                initial={{ width: "0%" }}
                animate={{ width: playing && !held && !reduce ? "100%" : "0%" }}
                transition={{ duration: DWELL_MS / 1000, ease: "linear" }}
              />
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={step.code}
                id={`step-panel-${step.code}`}
                role="tabpanel"
                aria-labelledby={`step-tab-${step.code}`}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                /* Quick exit: `mode="wait"` holds the incoming step until the
                   outgoing one finishes, so a slow exit leaves the card
                   visibly empty between steps. */
                exit={{ opacity: 0, y: -14, transition: { duration: 0.16 } }}
                transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                className="grid gap-8 sm:grid-cols-[auto_1fr] sm:items-start sm:gap-10"
              >
                {/* Rotating dial holding the step icon */}
                <div className="relative h-28 w-28 shrink-0">
                  <motion.span
                    className="border-saffron-500/30 absolute inset-0 rounded-full border border-dashed"
                    animate={reduce ? {} : { rotate: 360 }}
                    transition={{ duration: 26, repeat: Infinity, ease: "linear" }}
                  />
                  <span className="from-saffron-500/12 to-gold-400/5 absolute inset-3 rounded-full bg-gradient-to-br" />
                  <span className="text-saffron-500 absolute inset-0 grid place-items-center">
                    <StepIcon index={active} className="h-11 w-11" />
                  </span>
                </div>

                <div>
                  <p className="text-saffron-600/80 font-mono text-[11px] tracking-[0.32em] uppercase">
                    Step {step.code} of {STEPS.length}
                  </p>
                  <h3 className="text-ink-900 mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                    {step.title}
                  </h3>
                  <p className="text-ink-500 mt-4 max-w-xl leading-relaxed">
                    {step.blurb}
                  </p>
                  <div className="mt-6 flex flex-wrap gap-2">
                    {step.meta.map((m) => (
                      <span
                        key={m}
                        className="border-haze-200 text-ink-400 bg-haze-50 rounded-full border px-3 py-1.5 font-mono text-[10px] tracking-[0.16em] uppercase"
                      >
                        {m}
                      </span>
                    ))}
                  </div>

                  {/* Check-in is the live step: it opens a real Bhutan NDI
                      proof request. */}
                  {active === 0 && (
                    <div className="border-haze-200 mt-8 border-t pt-6">
                      <p className="text-ink-400 mb-3 font-mono text-[10px] tracking-[0.2em] uppercase">
                        Verify with Bhutan National Digital Identity
                      </p>
                      <NdiButton onClick={() => setNdiOpen(true)} />
                    </div>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </Reveal>
      </div>

      {/* Mounted only while open so it always opens on a fresh proof request. */}
      <AnimatePresence>
        {ndiOpen && <NdiScanModal onClose={() => setNdiOpen(false)} />}
      </AnimatePresence>
    </section>
  );
}
