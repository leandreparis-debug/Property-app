/**
 * Dimensions of a PNG, JPEG or WebP image read from its HEADER (pure, no
 * dependency, no decoding): used to validate plan images before they are
 * stored and to size the calibration.
 */

/** Largest side accepted for a plan image (MapLibre texture limit on most GPUs). */
export const MAX_PLAN_IMAGE_SIDE = 8192;

/** MIME types accepted for a plan image. */
export const PLAN_IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp"] as const;

/** French messages of the plan image checks. */
export const PLAN_IMAGE_MESSAGES = {
  notImage: "Le plan doit être une image PNG, JPEG ou WebP : exportez le plan AutoCAD en image.",
  unreadable: "Dimensions de l'image illisibles : le fichier est peut-être corrompu.",
  tooLarge: `Exportez le plan en ${MAX_PLAN_IMAGE_SIDE} px maximum (limite d'affichage).`,
} as const;

/** Dimensions and detected format of an image. */
export interface ImageSize {
  width: number;
  height: number;
  format: "png" | "jpeg" | "webp";
}

const u16be = (b: Uint8Array, o: number) => (b[o]! << 8) | b[o + 1]!;
const u16le = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);
const u24le = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16);
const u32be = (b: Uint8Array, o: number) => ((b[o]! << 24) >>> 0) + ((b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!);
const tag = (b: Uint8Array, o: number) => String.fromCharCode(b[o]!, b[o + 1]!, b[o + 2]!, b[o + 3]!);

function png(b: Uint8Array): ImageSize | null {
  // Signature (8) + IHDR length (4) + "IHDR" (4) + width (4) + height (4).
  if (b.length < 24 || tag(b, 12) !== "IHDR") return null;
  return { width: u32be(b, 16), height: u32be(b, 20), format: "png" };
}

/** SOFn markers carrying the frame size (all but DHT C4, JPG C8, DAC CC). */
const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function jpeg(b: Uint8Array): ImageSize | null {
  let o = 2;
  while (o + 4 <= b.length) {
    if (b[o] !== 0xff) return null;
    const marker = b[o + 1]!;
    if (marker === 0xff) {
      o += 1; // fill byte
      continue;
    }
    // Stand-alone markers (TEM, RSTn) have no length.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      o += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null; // EOI / SOS before any SOF
    const length = u16be(b, o + 2);
    if (length < 2) return null;
    if (SOF.has(marker)) {
      if (o + 9 > b.length) return null;
      return { height: u16be(b, o + 5), width: u16be(b, o + 7), format: "jpeg" };
    }
    o += 2 + length;
  }
  return null;
}

function webp(b: Uint8Array): ImageSize | null {
  if (b.length < 30) return null;
  const chunk = tag(b, 12);
  if (chunk === "VP8 ") {
    // Key frame start code 9d 01 2a, then 14-bit width / height.
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff, format: "webp" };
  }
  if (chunk === "VP8L") {
    if (b[20] !== 0x2f) return null;
    const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1, format: "webp" };
  }
  if (chunk === "VP8X") return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1, format: "webp" };
  return null;
}

/**
 * Reads the dimensions of a PNG, JPEG or WebP image from its header.
 * @param bytes - The file content (the first kilobytes are usually enough,
 *   except for JPEGs with large metadata before the frame header).
 * @returns The size and format, or `null` when the format is not one of the
 *   three or the header cannot be read.
 */
export function readImageSize(bytes: Uint8Array): ImageSize | null {
  const b = bytes;
  if (b.length >= 8 && b[0] === 0x89 && tag(b, 1).startsWith("PNG")) return png(b);
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return jpeg(b);
  if (b.length >= 12 && tag(b, 0) === "RIFF" && tag(b, 8) === "WEBP") return webp(b);
  return null;
}

/** Result of {@link checkPlanImage}. */
export type PlanImageCheck = { ok: true; size: ImageSize } | { ok: false; error: string };

/**
 * Validates a plan image: PNG, JPEG or WebP, readable dimensions, each side
 * in [1, {@link MAX_PLAN_IMAGE_SIDE}].
 * @param bytes - The file content.
 */
export function checkPlanImage(bytes: Uint8Array): PlanImageCheck {
  const size = readImageSize(bytes);
  if (!size) {
    const looksLikeImage = (bytes[0] === 0x89 && bytes[1] === 0x50) || (bytes[0] === 0xff && bytes[1] === 0xd8) || (bytes.length >= 12 && tag(bytes, 8) === "WEBP");
    return { ok: false, error: looksLikeImage ? PLAN_IMAGE_MESSAGES.unreadable : PLAN_IMAGE_MESSAGES.notImage };
  }
  if (size.width < 1 || size.height < 1) return { ok: false, error: PLAN_IMAGE_MESSAGES.unreadable };
  if (size.width > MAX_PLAN_IMAGE_SIDE || size.height > MAX_PLAN_IMAGE_SIDE) return { ok: false, error: PLAN_IMAGE_MESSAGES.tooLarge };
  return { ok: true, size };
}
