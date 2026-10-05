import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkPlanImage, MAX_PLAN_IMAGE_SIDE, PLAN_IMAGE_MESSAGES, readImageSize } from "@/domain/image-size";

const fixture = (name: string) => new Uint8Array(readFileSync(join(__dirname, "../fixtures/images", name)));

/** A PNG header (signature + IHDR) of the given size, without pixel data. */
function pngHeader(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  return b;
}

describe("readImageSize", () => {
  it("reads PNG, JPEG and the three WebP variants from tiny sample files", () => {
    expect(readImageSize(fixture("tiny.png"))).toEqual({ width: 5, height: 3, format: "png" });
    expect(readImageSize(fixture("tiny.jpg"))).toEqual({ width: 7, height: 4, format: "jpeg" });
    expect(readImageSize(fixture("tiny-lossy.webp"))).toEqual({ width: 9, height: 6, format: "webp" }); // VP8
    expect(readImageSize(fixture("tiny-lossless.webp"))).toEqual({ width: 11, height: 5, format: "webp" }); // VP8L
    expect(readImageSize(fixture("tiny-extended.webp"))).toEqual({ width: 13, height: 8, format: "webp" }); // VP8X
  });

  it("skips JPEG segments placed before the frame header", () => {
    const jpg = fixture("tiny.jpg");
    // Insert a 1 000-byte COM segment right after SOI.
    const com = new Uint8Array(1004);
    com.set([0xff, 0xfe, (1002 >> 8) & 0xff, 1002 & 0xff]);
    const withComment = new Uint8Array([...jpg.subarray(0, 2), ...com, ...jpg.subarray(2)]);
    expect(readImageSize(withComment)).toEqual({ width: 7, height: 4, format: "jpeg" });
  });

  it("returns null for other formats and truncated headers", () => {
    expect(readImageSize(new TextEncoder().encode("%PDF-1.7 ..."))).toBeNull();
    expect(readImageSize(new Uint8Array())).toBeNull();
    expect(readImageSize(fixture("tiny.png").subarray(0, 20))).toBeNull();
    expect(readImageSize(fixture("tiny.jpg").subarray(0, 12))).toBeNull();
    expect(readImageSize(fixture("tiny-lossy.webp").subarray(0, 20))).toBeNull();
  });
});

describe("checkPlanImage", () => {
  it("accepts up to 8192 px per side, refuses beyond with the display-limit message", () => {
    expect(checkPlanImage(pngHeader(MAX_PLAN_IMAGE_SIDE, 4000))).toEqual({ ok: true, size: { width: 8192, height: 4000, format: "png" } });
    expect(checkPlanImage(pngHeader(8193, 10))).toEqual({ ok: false, error: PLAN_IMAGE_MESSAGES.tooLarge });
    expect(PLAN_IMAGE_MESSAGES.tooLarge).toBe("Exportez le plan en 8192 px maximum (limite d'affichage).");
  });

  it("refuses a PDF (export the plan as an image) and a corrupt image", () => {
    expect(checkPlanImage(new TextEncoder().encode("%PDF-1.7"))).toEqual({ ok: false, error: PLAN_IMAGE_MESSAGES.notImage });
    expect(checkPlanImage(fixture("tiny.png").subarray(0, 10))).toEqual({ ok: false, error: PLAN_IMAGE_MESSAGES.unreadable });
    expect(checkPlanImage(pngHeader(0, 10))).toEqual({ ok: false, error: PLAN_IMAGE_MESSAGES.unreadable });
  });
});
