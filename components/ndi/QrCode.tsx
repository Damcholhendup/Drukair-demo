"use client";

import Image from "next/image";
import { assets, brand } from "@/lib/ndi/config";

export type QrMatrix = { size: number; bits: string };

/**
 * Draws the QR module matrix as SVG. Server-rendered PNGs blur when scaled and
 * can't reserve a clean centre; this can do both.
 *
 * When the NDI logo asset is supplied, a quiet square is punched out of the
 * middle and the logo sits in it — the arrangement the spec prefers. Without the
 * asset the code renders plain, which the spec explicitly permits.
 */
export default function QrCode({
  matrix,
  px = 240,
  className = "",
}: {
  matrix: QrMatrix;
  px?: number;
  className?: string;
}) {
  const { size, bits } = matrix;
  const QUIET = 2; // modules of margin around the code
  const total = size + QUIET * 2;

  const hasLogo = assets.logoSrc.length > 0;
  // Keep the punch-out small enough that "H" error correction can absorb it.
  const holeModules = hasLogo ? Math.round(size * 0.22) : 0;
  const holeStart = Math.floor((size - holeModules) / 2);
  const holeEnd = holeStart + holeModules;

  const rects: React.ReactNode[] = [];
  for (let y = 0; y < size; y++) {
    // Emit horizontal runs instead of one <rect> per module: a 57×57 code drops
    // from ~1600 nodes to a few hundred.
    let runStart = -1;
    for (let x = 0; x <= size; x++) {
      const inHole =
        hasLogo && y >= holeStart && y < holeEnd && x >= holeStart && x < holeEnd;
      const dark = x < size && bits[y * size + x] === "1" && !inHole;

      if (dark && runStart === -1) runStart = x;
      if (!dark && runStart !== -1) {
        rects.push(
          <rect
            key={`${y}-${runStart}`}
            x={runStart + QUIET}
            y={y + QUIET}
            width={x - runStart}
            height={1}
            fill={brand.teal}
          />,
        );
        runStart = -1;
      }
    }
  }

  return (
    <div className={`relative ${className}`} style={{ width: px, height: px }}>
      <svg
        viewBox={`0 0 ${total} ${total}`}
        width={px}
        height={px}
        shapeRendering="crispEdges"
        role="img"
        aria-label="Bhutan NDI proof request QR code"
      >
        <rect width={total} height={total} fill={brand.white} />
        {rects}
      </svg>

      {hasLogo && (
        <span
          className="absolute grid place-items-center rounded-md bg-white"
          style={{
            left: `${((holeStart + QUIET) / total) * 100}%`,
            top: `${((holeStart + QUIET) / total) * 100}%`,
            width: `${(holeModules / total) * 100}%`,
            height: `${(holeModules / total) * 100}%`,
          }}
        >
          <Image
            src={assets.logoSrc}
            alt=""
            width={64}
            height={64}
            className="h-[82%] w-[82%] object-contain"
          />
        </span>
      )}
    </div>
  );
}
