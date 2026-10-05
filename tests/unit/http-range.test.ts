import { describe, expect, it } from "vitest";
import { contentRange, contentTypeFor, etagMatches, makeEtag, parseRange, safeRelativePath, unsatisfiedRange } from "@/server/http/range";

describe("parseRange", () => {
  it("bytes=0-99", () => expect(parseRange("bytes=0-99", 1000)).toEqual({ kind: "range", start: 0, end: 99 }));
  it("bytes=100- (to the end)", () => expect(parseRange("bytes=100-", 1000)).toEqual({ kind: "range", start: 100, end: 999 }));
  it("bytes=-50 (suffix)", () => expect(parseRange("bytes=-50", 1000)).toEqual({ kind: "range", start: 950, end: 999 }));
  it("suffix longer than the file → whole file", () => expect(parseRange("bytes=-5000", 1000)).toEqual({ kind: "range", start: 0, end: 999 }));
  it("end beyond the file is clamped", () => expect(parseRange("bytes=900-5000", 1000)).toEqual({ kind: "range", start: 900, end: 999 }));

  it("multiple ranges: only the first satisfiable one is served (documented)", () => {
    expect(parseRange("bytes=0-9, 20-29", 1000)).toEqual({ kind: "range", start: 0, end: 9 });
    expect(parseRange("bytes=5000-6000, 20-29", 1000)).toEqual({ kind: "range", start: 20, end: 29 });
  });

  it("416: start beyond the size, bytes=-0, empty file", () => {
    expect(parseRange("bytes=1000-", 1000)).toEqual({ kind: "unsatisfiable" });
    expect(parseRange("bytes=-0", 1000)).toEqual({ kind: "unsatisfiable" });
    expect(parseRange("bytes=0-10", 0)).toEqual({ kind: "unsatisfiable" });
  });

  it("invalid syntax or unit → ignored (full response)", () => {
    for (const h of [null, "", "items=0-9", "bytes=abc", "bytes=9-1", "bytes=-", "bytes=1-2-3"]) expect(parseRange(h, 1000)).toEqual({ kind: "none" });
  });

  it("Content-Range values", () => {
    expect(contentRange(0, 99, 1000)).toBe("bytes 0-99/1000");
    expect(unsatisfiedRange(1000)).toBe("bytes */1000");
  });
});

describe("ETag", () => {
  const etag = makeEtag(1000, 1_700_000_000_123.7);

  it("depends on size and mtime", () => {
    expect(etag).toMatch(/^"[0-9a-f]+-[0-9a-f]+"$/);
    expect(makeEtag(1001, 1_700_000_000_123)).not.toBe(etag);
  });

  it("If-None-Match: exact, weak, list, star, other", () => {
    expect(etagMatches(etag, etag)).toBe(true);
    expect(etagMatches(`W/${etag}`, etag)).toBe(true);
    expect(etagMatches(`"x", ${etag}`, etag)).toBe(true);
    expect(etagMatches("*", etag)).toBe(true);
    expect(etagMatches('"other"', etag)).toBe(false);
    expect(etagMatches(null, etag)).toBe(false);
  });
});

describe("content types and paths", () => {
  it("content types", () => {
    expect(contentTypeFor("france.pmtiles")).toBe("application/vnd.pmtiles");
    expect(contentTypeFor("fonts/Noto Sans Regular/0-255.pbf")).toBe("application/x-protobuf");
    expect(contentTypeFor("sprites/v4/dark.json")).toMatch(/^application\/json/);
    expect(contentTypeFor("sprites/v4/dark@2x.PNG")).toBe("image/png");
    expect(contentTypeFor("x.bin")).toBe("application/octet-stream");
  });

  it("safeRelativePath refuses traversal, hidden files and separators", () => {
    expect(safeRelativePath(["fonts", "Noto Sans Regular", "0-255.pbf"])).toBe("fonts/Noto Sans Regular/0-255.pbf");
    for (const bad of [[], [".."], ["a", ".."], [".env"], ["a\\b"], ["a/b"], ["a\0"], [""]]) expect(safeRelativePath(bad)).toBeNull();
  });
});
