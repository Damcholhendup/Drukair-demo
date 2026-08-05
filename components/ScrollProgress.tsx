"use client";

import { motion, useScroll, useSpring } from "framer-motion";

/** Hairline flight-path indicator pinned to the top of the viewport. */
export default function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const width = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 26,
    restDelta: 0.001,
  });

  return (
    <motion.div
      aria-hidden="true"
      style={{ scaleX: width }}
      className="from-saffron-500 via-gold-400 to-gold-300 fixed inset-x-0 top-0 z-60 h-[2px] origin-left bg-gradient-to-r"
    />
  );
}
