"use client";

import Image from "next/image";
import { assets, brand, copy } from "@/lib/ndi/config";

/**
 * The Bhutan NDI action button.
 *
 * Spec-fixed: the NDI logo is always present, content is centred, and there is
 * at least 10px between the logo and the label. Colour is one of the two
 * permitted pairings — filled `teal` on white text, or white with teal text and
 * a teal border. Shape and size follow the host UI, which the spec allows, so
 * this is pill-shaped to match the rest of the Drukair page.
 *
 * Hover elevates and adds a shadow, as the spec directs.
 */
export default function NdiButton({
  onClick,
  variant = "filled",
  label = copy.loginButton,
  className = "",
}: {
  onClick?: () => void;
  variant?: "filled" | "outline";
  label?: string;
  className?: string;
}) {
  const filled = variant === "filled";

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontFamily: "var(--font-inter)",
        backgroundColor: filled ? brand.teal : brand.white,
        color: filled ? brand.white : brand.teal,
        borderColor: brand.teal,
      }}
      className={`inline-flex h-[50px] w-full max-w-[330px] cursor-pointer items-center justify-center gap-[10px] rounded-full border px-6 text-base font-semibold transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20 ${className}`}
    >
      {assets.logoSrc ? (
        <Image
          src={assets.logoSrc}
          alt="Bhutan NDI"
          width={24}
          height={24}
          className="h-6 w-6 shrink-0 object-contain"
        />
      ) : null}
      <span>{label}</span>
    </button>
  );
}
