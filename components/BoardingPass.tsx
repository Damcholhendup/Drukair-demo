"use client";

import {
  AnimatePresence,
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "framer-motion";
import { useState } from "react";
import { DragonMark, PlaneIcon } from "./Brand";

/* Deterministic barcode so SSR and hydration agree. */
const BARS = Array.from({ length: 44 }, (_, i) => ((i * 37) % 5) * 0.6 + 1.2);

const SEAT = "14A";

type Status = "idle" | "scanning" | "boarded";

export default function BoardingPass() {
  const reduce = useReducedMotion();
  const [status, setStatus] = useState<Status>("idle");

  const rotateX = useSpring(0, { stiffness: 180, damping: 18 });
  const rotateY = useSpring(0, { stiffness: 180, damping: 18 });
  const glossX = useMotionValue(50);
  const glossY = useMotionValue(50);

  const gloss = useMotionTemplate`radial-gradient(circle at ${glossX}% ${glossY}%, rgba(255,255,255,0.55), transparent 52%)`;

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (reduce) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    rotateY.set((px - 0.5) * 15);
    rotateX.set((0.5 - py) * 11);
    glossX.set(px * 100);
    glossY.set(py * 100);
  }

  function onPointerLeave() {
    rotateX.set(0);
    rotateY.set(0);
    glossX.set(50);
    glossY.set(50);
  }

  function scan() {
    if (status !== "idle") {
      setStatus("idle");
      return;
    }
    setStatus("scanning");
    window.setTimeout(() => setStatus("boarded"), 1400);
  }

  const fields: [string, string][] = [
    ["Flight", "KB 401"],
    ["Date", "30 JUL"],
    ["Gate", "02"],
    ["Boarding", "09:40"],
    ["Class", "Economy"],
    ["Seq", "021"],
  ];

  return (
    <div className="[perspective:1400px]">
      <motion.div
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        className="relative"
      >
        <div className="border-haze-200 relative overflow-hidden rounded-3xl border bg-white shadow-[0_28px_70px_-24px_rgba(12,35,55,0.35)]">
          {/* Gloss following the pointer */}
          <motion.div
            style={{ background: gloss }}
            className="pointer-events-none absolute inset-0 z-20 mix-blend-soft-light"
            aria-hidden="true"
          />

          {/* Header */}
          <div className="from-ink-900 to-ink-700 relative flex items-center justify-between gap-3 bg-gradient-to-r px-5 py-5 sm:px-7">
            <div className="flex items-center gap-3 text-white">
              <DragonMark className="w-8" />
              <div>
                <p className="text-sm font-semibold tracking-[0.22em] text-white uppercase">
                  Drukair
                </p>
                <p className="text-gold-300/85 font-mono text-[9px] tracking-[0.28em] uppercase">
                  Boarding pass
                </p>
              </div>
            </div>
            <span className="text-gold-300 shrink-0 rounded-full border border-white/30 px-3 py-1 font-mono text-[9px] tracking-[0.2em] uppercase">
              Demo
            </span>
          </div>

          {/* Route */}
          <div className="relative flex items-center justify-between gap-3 px-5 pt-7 sm:gap-4 sm:px-7">
            <div className="shrink-0">
              <p className="text-ink-900 font-mono text-2xl leading-none sm:text-4xl">
                PBH
              </p>
              <p className="text-ink-400 mt-2 text-[11px] tracking-[0.2em] uppercase">
                Paro
              </p>
            </div>

            <div className="relative min-w-0 flex-1 px-1 sm:px-2">
              <svg viewBox="0 0 200 40" className="h-10 w-full" aria-hidden="true">
                <path
                  d="M4 30 Q100 -2 196 30"
                  fill="none"
                  stroke="var(--color-haze-400)"
                  strokeWidth="1"
                  strokeDasharray="4 6"
                />
                <circle cx="4" cy="30" r="2.5" fill="var(--color-saffron-500)" />
                <circle cx="196" cy="30" r="2.5" fill="var(--color-saffron-500)" />
              </svg>
              <motion.div
                className="text-saffron-500 absolute top-0 left-1/2 -translate-x-1/2"
                animate={reduce ? {} : { y: [0, -4, 0] }}
                transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
              >
                <PlaneIcon className="h-5 w-5 rotate-[-8deg]" />
              </motion.div>
            </div>

            <div className="shrink-0 text-right">
              <p className="text-ink-900 font-mono text-2xl leading-none sm:text-4xl">
                BKK
              </p>
              <p className="text-ink-400 mt-2 text-[11px] tracking-[0.2em] uppercase">
                Bangkok
              </p>
            </div>
          </div>

          {/* Passenger + seat */}
          <div className="grid grid-cols-2 gap-6 px-5 pt-8 sm:px-7">
            <div>
              <p className="text-ink-400 font-mono text-[9px] tracking-[0.24em] uppercase">
                Passenger
              </p>
              <p className="text-ink-700 mt-2 font-mono text-lg tracking-[0.18em]">
                — — — —
              </p>
            </div>
            <div className="text-right">
              <p className="text-ink-400 font-mono text-[9px] tracking-[0.24em] uppercase">
                Seat
              </p>
              <p className="text-saffron-600 mt-1 font-mono text-2xl">{SEAT}</p>
            </div>
          </div>

          {/* Field grid */}
          <div className="border-haze-200 mt-7 grid grid-cols-3 gap-x-3 gap-y-5 border-t px-5 py-6 sm:px-7">
            {fields.map(([label, value]) => (
              <div key={label}>
                <p className="text-ink-400 font-mono text-[9px] tracking-[0.22em] uppercase">
                  {label}
                </p>
                <p className="text-ink-800 mt-1.5 font-mono text-sm">{value}</p>
              </div>
            ))}
          </div>

          {/* Tear line with punched-out notches */}
          <div className="relative">
            <div className="bg-haze-100 border-haze-200 absolute top-1/2 -left-3 h-6 w-6 -translate-y-1/2 rounded-full border" />
            <div className="bg-haze-100 border-haze-200 absolute top-1/2 -right-3 h-6 w-6 -translate-y-1/2 rounded-full border" />
            <div className="perforation mx-6 h-0.5" />
          </div>

          {/* Stub */}
          <div className="relative flex flex-col gap-4 px-5 pt-6 pb-7 sm:flex-row sm:items-end sm:justify-between sm:gap-6 sm:px-7">
            <div
              className="flex h-12 min-w-0 items-end gap-[2px] overflow-hidden sm:h-14 sm:gap-[3px]"
              aria-hidden="true"
            >
              {BARS.map((w, i) => (
                <motion.span
                  key={i}
                  className="bg-ink-900/85 block h-full shrink-0"
                  style={{ width: w }}
                  initial={{ scaleY: 0.2, opacity: 0.3 }}
                  whileInView={{ scaleY: 1, opacity: 0.9 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.012 }}
                />
              ))}
            </div>
            <p className="text-ink-400 shrink-0 font-mono text-[10px] tracking-[0.2em]">
              KB401·PBH·BKK
            </p>
          </div>

          {/* Gate scanner sweep */}
          <AnimatePresence>
            {status === "scanning" && (
              <motion.div
                key="sweep"
                className="pointer-events-none absolute inset-x-0 z-30 h-24 bg-[linear-gradient(to_bottom,transparent,rgba(16,185,129,0.28),transparent)]"
                initial={{ top: "-20%", opacity: 0 }}
                animate={{ top: "100%", opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.3, ease: "easeInOut" }}
              />
            )}
          </AnimatePresence>

          {/* BOARDED stamp */}
          <AnimatePresence>
            {status === "boarded" && (
              <motion.div
                key="stamp"
                initial={{ opacity: 0, scale: 2.2, rotate: -26 }}
                animate={{ opacity: 1, scale: 1, rotate: -13 }}
                exit={{ opacity: 0, scale: 1.4 }}
                transition={{ type: "spring", stiffness: 260, damping: 16 }}
                className="pointer-events-none absolute inset-0 z-30 grid place-items-center"
              >
                <span className="rounded-xl border-[3px] border-emerald-600/70 px-7 py-3 font-mono text-2xl tracking-[0.3em] text-emerald-700/85 uppercase">
                  Boarded
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Action */}
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={scan}
          disabled={status === "scanning"}
          className="sheen from-saffron-500 to-gold-400 text-ink-900 inline-flex items-center gap-2.5 rounded-full bg-gradient-to-r px-6 py-3 text-sm font-semibold shadow-md shadow-black/10 transition-transform duration-300 hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-70"
        >
          {status === "idle" && "Scan at the gate"}
          {status === "scanning" && "Scanning…"}
          {status === "boarded" && "Scan again"}
        </button>
        <p className="text-ink-400 font-mono text-[10px] tracking-[0.16em] uppercase">
          {status === "boarded" ? "Welcome aboard" : `Seat ${SEAT} confirmed`}
        </p>
      </div>
    </div>
  );
}
