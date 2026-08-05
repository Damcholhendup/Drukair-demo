"use client";

import { motion, useMotionValueEvent, useScroll } from "framer-motion";
import { useState } from "react";
import { DragonMark, Wordmark } from "./Brand";

const LINKS = [
  { href: "#journey", label: "Process", compact: true },
  { href: "#boarding", label: "Cabin", compact: true },
  // Dropped on phones — three padded links plus the mark overflow a 390px bar.
  { href: "#top", label: "Top", compact: false },
];

export default function SiteNav() {
  const { scrollY } = useScroll();
  const [lifted, setLifted] = useState(false);

  useMotionValueEvent(scrollY, "change", (v) => setLifted(v > 40));

  return (
    <motion.header
      initial={{ y: -70, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.8, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-x-0 top-0 z-50"
    >
      {/* Over the footage the bar is transparent with white type; once the page
          scrolls it becomes a frosted white bar with navy type. */}
      <div
        className={`transition-all duration-500 ${
          lifted
            ? "border-haze-200 border-b bg-white/85 backdrop-blur-xl"
            : "border-b border-transparent"
        }`}
      >
        <nav className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <a
            href="#top"
            className={`flex shrink-0 items-center gap-3 transition-colors duration-500 ${
              lifted ? "text-ink-900" : "text-white"
            }`}
          >
            <DragonMark className="w-8 sm:w-9" />
            <Wordmark className="hidden sm:inline-flex" />
          </a>

          <div className="flex min-w-0 items-center gap-0.5 sm:gap-2">
            {LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className={`relative rounded-full px-2.5 py-2 font-mono text-[10px] tracking-[0.14em] whitespace-nowrap uppercase transition-colors duration-500 sm:px-4 sm:text-[11px] sm:tracking-[0.2em] ${
                  lifted
                    ? "text-ink-500 hover:text-ink-900"
                    : "text-white/75 hover:text-white"
                } ${l.compact ? "" : "hidden sm:inline-block"}`}
              >
                {l.label}
              </a>
            ))}
            <a
              href="#boarding"
              className={`ml-2 hidden rounded-full border px-5 py-2 font-mono text-[11px] tracking-[0.2em] uppercase transition-colors duration-500 sm:inline-block ${
                lifted
                  ? "border-saffron-500/50 text-saffron-600 hover:bg-saffron-500/10"
                  : "border-white/45 text-white hover:bg-white/15"
              }`}
            >
              Board
            </a>
          </div>
        </nav>
      </div>
    </motion.header>
  );
}
