import { describe, expect, it } from "vitest";
import type { StyleSpecification } from "maplibre-gl";
import { BASE_META, buildIgnStyle, IGN_LAYER, IGN_VECTOR_STYLE_URL, ignTileUrl, isUsableIgnStyle, setBaseLayer } from "@/components/map/style/ign-style";
import { ACCENT, STATUS_COLORS } from "@/components/map/style/theme";
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

  it("IGN style without the vector style: grey raster Plan IGN and photographs from the WMTS, one visible", () => {
    const style = buildIgnStyle("photo");
    const visibility = (id: string) => (style.layers.find((l) => l.id === id) as { layout?: { visibility?: string } }).layout?.visibility;
    expect(visibility(IGN_LAYER.plan)).toBe("none");
    expect(visibility(IGN_LAYER.photo)).toBe("visible");
    const tiles = Object.values(style.sources).flatMap((s) => (s as { tiles: string[] }).tiles);
    expect(tiles.every((t) => t.startsWith(`${IGN_ORIGIN}/wmts?`) && t.includes("TILEMATRIXSET=PM"))).toBe(true);
    expect(ignTileUrl("X", "image/png")).toContain("FORMAT=image%2Fpng");
    expect(style.glyphs).toBeUndefined();
    const plan = style.layers.find((l) => l.id === IGN_LAYER.plan) as unknown as { paint: Record<string, number> };
    expect(plan.paint["raster-saturation"]).toBe(-1);
  });

  const vector: StyleSpecification = {
    version: 8,
    glyphs: `${IGN_ORIGIN}/annexes/ressources/vectorTiles/fonts/{fontstack}/{range}.pbf`,
    sprite: `${IGN_ORIGIN}/annexes/ressources/vectorTiles/styles/PLAN.IGN/sprite/PlanIgn`,
    sources: { plan_ign: { type: "vector", tiles: [`${IGN_ORIGIN}/tms/1.0.0/PLAN.IGN/{z}/{x}/{y}.pbf`], maxzoom: 18 } },
    layers: [
      { id: "fond", type: "background", paint: { "background-color": "#eeeeee" } },
      { id: "routes", type: "line", source: "plan_ign", "source-layer": "routier_route", paint: { "line-color": "#ffffff" } },
      { id: "cachee", type: "line", source: "plan_ign", "source-layer": "x", layout: { visibility: "none" } },
      { id: "pictos", type: "symbol", source: "plan_ign", "source-layer": "poi", layout: { "icon-image": "eglise" } },
      { id: "villes", type: "symbol", source: "plan_ign", "source-layer": "toponyme", layout: { "text-field": ["get", "texte"] } },
    ],
  };

  it("IGN style with the grey vector plan: layers tagged by base, pictograms dropped, photographs on top", () => {
    expect(IGN_VECTOR_STYLE_URL).toBe(`${IGN_ORIGIN}/annexes/ressources/vectorTiles/styles/PLAN.IGN/gris.json`);
    const style = buildIgnStyle("plan", vector);
    expect(style.glyphs).toBe(vector.glyphs);
    expect(style.sprite).toBe(vector.sprite);
    expect(Object.keys(style.sources)).toEqual(["plan_ign", IGN_LAYER.photo]);
    const ids = style.layers.map((l) => l.id);
    expect(ids).toEqual(["background", "fond", "routes", "cachee", "villes", IGN_LAYER.photo]);
    const layer = (id: string) => style.layers.find((l) => l.id === id) as { layout?: { visibility?: string }; metadata?: Record<string, unknown> };
    expect(layer("routes").layout?.visibility).toBe("visible");
    expect(layer("routes").metadata?.[BASE_META.base]).toBe("plan");
    expect(layer("cachee").layout?.visibility).toBe("none");
    expect(layer(IGN_LAYER.photo).layout?.visibility).toBe("none");
    // The input style is not modified.
    expect(vector.layers[1]).not.toHaveProperty("metadata");
  });

  it("switching base keeps the layers the IGN style hides", () => {
    let style = buildIgnStyle("plan", vector);
    const map = {
      getStyle: () => style,
      setLayoutProperty: (id: string, _: string, value: unknown) => {
        style = { ...style, layers: style.layers.map((l) => (l.id === id ? ({ ...l, layout: { ...l.layout, visibility: value } } as typeof l) : l)) };
      },
    } as unknown as Parameters<typeof setBaseLayer>[0];
    const visible = () => style.layers.filter((l) => l.layout?.visibility !== "none").map((l) => l.id);
    setBaseLayer(map, "photo");
    expect(visible()).toEqual(["background", IGN_LAYER.photo]);
    setBaseLayer(map, "plan");
    expect(visible()).toEqual(["background", "fond", "routes", "villes"]);
  });

  it("a fetched style is used only if all its resources are on the Géoplateforme", () => {
    expect(isUsableIgnStyle(vector)).toBe(true);
    expect(isUsableIgnStyle(null)).toBe(false);
    expect(isUsableIgnStyle({ version: 8, sources: {}, layers: [] })).toBe(false);
    expect(isUsableIgnStyle({ ...vector, glyphs: "https://fonts.example.org/{fontstack}/{range}.pbf" })).toBe(false);
    expect(isUsableIgnStyle({ ...vector, sources: { x: { type: "vector", url: "https://tiles.example.org/tiles.json" } } })).toBe(false);
    expect(isUsableIgnStyle({ ...vector, sprite: [{ id: "a", url: "https://evil.example.org/sprite" }] })).toBe(false);
    expect(isUsableIgnStyle({ ...vector, glyphs: `${IGN_ORIGIN}.evil.example.org/{fontstack}/{range}.pbf` })).toBe(false);
  });

  it("no status color nor accent added to the basemap", () => {
    const text = JSON.stringify([buildIgnStyle("plan"), buildIgnStyle("plan", vector)]).toLowerCase();
    for (const c of [...Object.values(STATUS_COLORS), ACCENT]) expect(text).not.toContain(c.toLowerCase());
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
