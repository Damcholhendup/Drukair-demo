import "server-only";

import QRCode from "qrcode";

export type QrMatrix = {
  /** Modules per side, excluding the quiet zone. */
  size: number;
  /** Row-major bitmap, "1" = dark. Length is size * size. */
  bits: string;
};

/**
 * Builds the QR module matrix rather than a PNG, so the client can draw it as
 * SVG: crisp at any size, themeable, and able to reserve a clean centre for the
 * NDI logo.
 *
 * Error correction is fixed at "H" (~30% recovery) because the spec prefers the
 * NDI logo inside the code, and covering the centre eats into that budget.
 */
export async function buildQrMatrix(text: string): Promise<QrMatrix> {
  const qr = QRCode.create(text, { errorCorrectionLevel: "H" });
  const { size, data } = qr.modules;

  let bits = "";
  for (let i = 0; i < data.length; i++) {
    bits += data[i] ? "1" : "0";
  }

  return { size, bits };
}
