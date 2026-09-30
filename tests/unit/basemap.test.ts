import { describe, expect, it } from "vitest";
import { buildIgnStyle, IGN_LAYER, ignTileUrl } from "@/components/map/style/ign-style";
import { pinText } from "@/components/map/site-pins";
import { basemapMode, IGN_ORIGIN, mapOrigins } from "@/lib/basemap";
import { buildContentSecurityPolicy } from "@/lib/csp";

describe("basemap mode", () => {
  it("ign by default; offline only when asked", () => {
    expect(basemapMode({})).toBe("ign");
    expect(basemapMode({ MAP_BASEMAP: "OFFLINE" })).toBe("offline");
    expect(basemapMode({ MAP_BASEMAP: "ign" })).toBe("ign");
    expect(mapOrigins("ign")).toEqual([IGN_ORIGIN]);
    expect(mapOrigins("offline")).toEqual([]);
  });

  it("CSP: only the IGN tile origin is added, and only to img-src and connect-src", () => {
    const closed = buildContentSecurityPolicy("n", false);
    expect(closed).not.toContain("geopf");
    const ign = buildContentSecurityPolicy("n", false, mapOrigins("ign"));
    const directive = (name: string) => ign.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";
    expect(directive("img-src")).toContain(IGN_ORIGIN);
    expect(directive("connect-src")).toContain(IGN_ORIGIN);
    for (const name of ["script-src", "style-src", "font-src", "default-src", "worker-src", "frame-src"]) expect(directive(name)).not.toContain("geopf");
  });

  it("IGN style: Plan IGN and photographs from the Géoplateforme WMTS, one visible", () => {
    const style = buildIgnStyle("photo");
    const visibility = (id: string) => (style.layers.find((l) => l.id === id) as { layout?: { visibility?: string } }).layout?.visibility;
    expect(visibility(IGN_LAYER.plan)).toBe("none");
    expect(visibility(IGN_LAYER.photo)).toBe("visible");
    const tiles = Object.values(style.sources).flatMap((s) => (s as { tiles: string[] }).tiles);
    expect(tiles.every((t) => t.startsWith(`${IGN_ORIGIN}/wmts?`) && t.includes("TILEMATRIXSET=PM"))).toBe(true);
    expect(ignTileUrl("X", "image/png")).toContain("FORMAT=image%2Fpng");
    expect(style.glyphs).toBeUndefined();
  });
});

describe("site pins", () => {
  it("surface, deadline or code", () => {
    const site = { code: "DEMO-001", totalArea: 48320, deadline: "lt6m" as const };
    expect(pinText(site, "surface").replace(/\s/g, " ")).toBe("48 320 m²");
    expect(pinText(site, "deadline")).toBe("< 6 mois");
    expect(pinText(site, "code")).toBe("DEMO-001");
    expect(pinText({ ...site, totalArea: null }, "surface")).toBe("Surface ?");
  });
});
