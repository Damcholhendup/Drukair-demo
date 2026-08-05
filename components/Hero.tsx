"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { DragonMark } from "./Brand";

const EASE = [0.22, 1, 0.36, 1] as const;

export default function Hero() {
  const reduce = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(true);

  const { scrollYProgress } = useScroll();
  // Gentle drift + settle as the hero scrolls away.
  const videoY = useTransform(scrollYProgress, [0, 0.35], ["0%", "12%"]);
  const videoScale = useTransform(scrollYProgress, [0, 0.35], [1.04, 1.14]);
  const copyOpacity = useTransform(scrollYProgress, [0, 0.16], [1, 0]);

  // Honour a reduced-motion preference: hold on a still frame instead.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !reduce) return;
    v.pause();
    setPlaying(false);
  }, [reduce]);

  function togglePlayback() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      void v.play();
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  }

  return (
    <section
      id="top"
      className="relative flex min-h-[100svh] flex-col justify-end overflow-hidden pt-28 pb-16"
    >
      {/* Footage */}
      <motion.div
        style={{ y: reduce ? 0 : videoY, scale: reduce ? 1.04 : videoScale }}
        className="absolute inset-0 -z-10"
      >
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          src="/Video_KB.mp4"
          autoPlay={!reduce}
          loop
          muted
          playsInline
          preload="auto"
          aria-label="Drukair A320neo cruising above the Himalayas"
        />
      </motion.div>

      <div className="hero-scrim pointer-events-none absolute inset-0 -z-10" />

      {/* Copy */}
      <motion.div
        style={{ opacity: copyOpacity }}
        className="relative z-10 mx-auto w-full max-w-6xl px-6"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.7, rotate: -22 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ duration: 1.1, ease: EASE }}
          className="animate-bob mb-7 w-14 text-white"
        >
          <DragonMark className="w-14 drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)]" />
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15, ease: EASE }}
          className="font-mono text-[11px] tracking-[0.42em] text-white/75 uppercase"
        >
          Royal Bhutan Airlines · Concept
        </motion.p>

        <h1 className="mt-5 max-w-3xl text-5xl leading-[0.95] font-semibold tracking-tight text-white drop-shadow-[0_2px_24px_rgba(4,18,30,0.5)] sm:text-6xl lg:text-7xl">
          {["Passenger", "onboarding,", "start to seat."].map((word, i) => (
            <motion.span
              key={word}
              className="mr-[0.3em] inline-block"
              initial={{ opacity: 0, y: 40, rotateX: -50 }}
              animate={{ opacity: 1, y: 0, rotateX: 0 }}
              transition={{ duration: 0.9, delay: 0.25 + i * 0.11, ease: EASE }}
            >
              {i === 2 ? (
                <span className="from-gold-300 via-gold-400 to-saffron-500 bg-gradient-to-r bg-clip-text text-transparent">
                  {word}
                </span>
              ) : (
                word
              )}
            </motion.span>
          ))}
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6, ease: EASE }}
          className="mt-7 max-w-xl text-lg leading-relaxed text-white/80"
        >
          A Drukair website concept walking a passenger through every step of
          getting on board the aircraft. Design and interaction only — no real
          content yet.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.75, ease: EASE }}
          className="mt-10 flex flex-wrap items-center gap-4"
        >
          <a
            href="#journey"
            className="sheen from-saffron-500 to-gold-400 text-ink-900 group inline-flex items-center gap-3 rounded-full bg-gradient-to-r px-7 py-3.5 text-sm font-semibold tracking-wide shadow-lg shadow-black/25 transition-transform duration-300 hover:-translate-y-0.5"
          >
            Walk the process
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
              <path
                d="M5 12h13m0 0-5-5m5 5-5 5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="transition-transform duration-300 group-hover:translate-x-0.5"
              />
            </svg>
          </a>
          <a
            href="#boarding"
            className="glass-dark inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-medium tracking-wide text-white transition-colors duration-300 hover:bg-white/20"
          >
            See the pass
          </a>
        </motion.div>

        <motion.dl
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1 }}
          className="mt-14 grid max-w-2xl grid-cols-3 gap-6 border-t border-white/20 pt-7"
        >
          {[
            ["06", "Steps to board"],
            ["PBH", "Paro · departure"],
            ["A320neo", "Aircraft"],
          ].map(([value, label]) => (
            <div key={label}>
              <dt className="text-gold-300 font-mono text-xl sm:text-2xl">{value}</dt>
              <dd className="mt-1 text-[11px] tracking-[0.18em] text-white/60 uppercase">
                {label}
              </dd>
            </div>
          ))}
        </motion.dl>
      </motion.div>

      {/* Playback control — background video that runs longer than five seconds
          needs a way to stop it. */}
      <button
        type="button"
        onClick={togglePlayback}
        aria-label={playing ? "Pause background video" : "Play background video"}
        className="glass-dark absolute right-5 bottom-5 z-10 grid h-11 w-11 place-items-center rounded-full text-white transition-colors hover:bg-white/20 sm:right-8 sm:bottom-8"
      >
        {playing ? (
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
            <path d="M9 5v14M15 5v14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="ml-0.5 h-4 w-4" aria-hidden="true">
            <path d="M7 4.5v15l12-7.5-12-7.5z" fill="currentColor" />
          </svg>
        )}
      </button>
    </section>
  );
}
