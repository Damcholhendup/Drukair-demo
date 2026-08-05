# Drukair — Passenger Onboarding (concept)

A single-page website concept for Drukair walking a passenger through the
process of getting on board the aircraft, from the check-in counter to the
cabin seat. **Design and interaction only — all copy is placeholder.**

Not affiliated with, or endorsed by, Drukair. The dragon mark is an original
abstraction (wing sweep + thunder bolt), not the airline's real logo.

## Stack

| | |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 (`@theme` tokens in `app/globals.css`) |
| Animation | Framer Motion 12 |
| Fonts | Geist Sans + Geist Mono via `next/font` |

The hero plays `public/Video_KB.mp4` — a Drukair A320neo above the Himalayas.
The palette is pitched to that footage: cloud white and pale sky carry the page,
deep navy does the typography, and the accents come off the aircraft's tail.
Apart from the video there are no image assets; every other visual is inline
SVG or CSS.

> **Before this ships:** the clip is 3840×2160 and ~37 MB. That is far heavier
> than a hero background should be — re-encode to 1080p H.264 at roughly
> 2–4 Mbps (plus a WebM), add a `poster` frame, and it will drop to single-digit
> megabytes with no visible loss at this size. Needs `ffmpeg`, which is not
> installed here.

## Getting started

```bash
npm install
npm run dev     # http://localhost:3000
```

```bash
npm run build   # production build
npm run lint    # eslint
npx tsc --noEmit
```

## Layout

```
app/
  layout.tsx              fonts, metadata, page shell
  page.tsx                section composition
  globals.css             design tokens, keyframes, utility classes
components/
  Brand.tsx               DragonMark, Wordmark, PlaneGlyph, PrayerRibbon
  SiteNav.tsx             fixed nav; transparent over the video, white once scrolled
  ScrollProgress.tsx      hairline read-progress bar
  Hero.tsx                full-bleed video, headline, playback control
  Marquee.tsx             infinite ticker
  OnboardingJourney.tsx   the six-step flight-path rail
  StepIcons.tsx           one line icon per step
  BoardingSection.tsx     closing section
  BoardingPass.tsx        tilting pass, gate-scan animation
  SiteFooter.tsx          prayer-flag ribbon, disclaimer
  Reveal.tsx              scroll-in fade/rise wrapper
public/
  Video_KB.mp4            hero footage
```

## The interactive bits

- **Hero** — the video autoplays muted on a loop behind a two-axis scrim, drifts
  and scales slightly on scroll, and the copy fades out as you leave. A pause
  button sits bottom-right, because background motion running longer than five
  seconds needs a way to stop it.
- **Journey rail** — six stages sit on an SVG curve. The aircraft flies between
  them along the real path geometry (`getPointAtLength`), offset onto the path
  normal so it never covers a stage marker; the travelled portion of the rail
  fills in behind it. Auto-advances every 4.6s, pauses while you hover or focus
  the section, and has an Auto/Manual toggle.
- **Step control** — the rail is decorative (`aria-hidden`); the real control is
  a `role="tablist"` chip row that works with arrow keys, Home and End.
- **Boarding pass** — tilts in 3D toward the pointer with a gloss that tracks
  it, and "Scan at the gate" runs a scanner sweep into a BOARDED stamp.

## Notes

- Every animation is gated behind `useReducedMotion` / a
  `prefers-reduced-motion` block. Under that preference the hero video holds on
  a still frame and the rail's auto-advance is disabled outright.
- Randomised decoration (the barcode) comes from a seeded generator at module
  scope so SSR and hydration agree.
- `DragonMark`'s bolt is `currentColor`, so one component serves the dark hero,
  the white nav and the navy footer. Callers must set a text colour on dark
  backgrounds.
- `turbopack.root` is pinned in `next.config.ts` because an unrelated lockfile
  in the home directory would otherwise be inferred as the workspace root.
- A seat-picker section was removed at the client's request; the pass now
  carries a fixed seat (`SEAT` in `BoardingPass.tsx`).
