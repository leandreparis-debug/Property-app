/**
 * FIXTURES MODE (`--fixtures`): a synthetic `fetch` answering every provider
 * request from the templates of `__fixtures__/` — no network at all.
 *
 * ⚠ The templates are SYNTHETIC (« synthétique — à confirmer par probe »):
 * they follow the documented formats but were not captured from the real
 * services. Run `pnpm bundle:probe` on a connected workstation to confirm.
 *
 * Each template is built around `_referencePoint`; its coordinates are
 * translated onto the requested point, and `{{seed}}`, `{{seed2}}`,
 * `{{insee}}` placeholders are filled in, so every site gets plausible,
 * distinct, deterministic answers.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ENDPOINTS } from "./config";
import type { LonLat } from "./geo";
import type { FetchLike } from "./http";

/** Directory of the templates. */
export const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");

/** Marker every template carries. */
export const FIXTURE_MARKER = "synthétique — à confirmer par probe";

/**
 * Fictitious commune table of the fixtures mode (postal code → name, INSEE
 * code, approximate centre). Covers the sample spreadsheet and the seed.
 */
export const FIXTURE_COMMUNES: Readonly<Record<string, { city: string; insee: string; lonLat: LonLat }>> = {
  "69800": { city: "Saint-Priest", insee: "69290", lonLat: [4.944, 45.696] },
  "59810": { city: "Lesquin", insee: "59343", lonLat: [3.111, 50.589] },
  "13127": { city: "Vitrolles", insee: "13117", lonLat: [5.249, 43.46] },
  "33610": { city: "Cestas", insee: "33122", lonLat: [-0.681, 44.743] },
  "35520": { city: "La Mézière", insee: "35177", lonLat: [-1.755, 48.219] },
  "67100": { city: "Strasbourg", insee: "67482", lonLat: [7.752, 48.573] },
  "31120": { city: "Portet-sur-Garonne", insee: "31433", lonLat: [1.406, 43.523] },
  "95310": { city: "Saint-Ouen-l'Aumône", insee: "95572", lonLat: [2.111, 49.044] },
  "38430": { city: "Moirans", insee: "38239", lonLat: [5.566, 45.325] },
  "21600": { city: "Longvic", insee: "21355", lonLat: [5.064, 47.287] },
  "44470": { city: "Carquefou", insee: "44026", lonLat: [-1.491, 47.297] },
  "94150": { city: "Rungis", insee: "94065", lonLat: [2.349, 48.747] },
  "45770": { city: "Saran", insee: "45302", lonLat: [1.875, 47.95] },
  "57365": { city: "Ennery", insee: "57194", lonLat: [6.221, 49.226] },
  "76530": { city: "Grand-Couronne", insee: "76319", lonLat: [1.006, 49.357] },
  "63510": { city: "Aulnat", insee: "63019", lonLat: [3.168, 45.797] },
  "34740": { city: "Vendargues", insee: "34327", lonLat: [3.97, 43.656] },
  "51100": { city: "Reims", insee: "51454", lonLat: [4.032, 49.258] },
  "20090": { city: "Ajaccio", insee: "2A004", lonLat: [8.738, 41.919] },
  "37100": { city: "Tours", insee: "37261", lonLat: [0.69, 47.418] },
  "80000": { city: "Amiens", insee: "80021", lonLat: [2.296, 49.894] },
};

/**
 * Loads a template.
 * @param name - File name in `__fixtures__/`.
 */
export function loadFixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), "utf8")) as Record<string, unknown>;
}

/** Deterministic integer from a string. */
function seedOf(text: string, digits: number): string {
  const n = parseInt(createHash("sha256").update(text).digest("hex").slice(0, 12), 16) % 10 ** digits;
  return String(n).padStart(digits, "0");
}

/**
 * Instantiates a template: moves it onto `target` and fills the placeholders.
 * @param template - Template (with `_referencePoint`).
 * @param target - Requested point, or null to keep the coordinates.
 * @param vars - Placeholder values.
 */
export function instantiate(template: Record<string, unknown>, target: LonLat | null, vars: Record<string, string>): unknown {
  const ref = template._referencePoint as [number, number];
  const dx = target ? target[0] - ref[0] : 0;
  const dy = target ? target[1] - ref[1] : 0;
  const near = (lon: number, lat: number) => Math.abs(lon - ref[0]) < 0.2 && Math.abs(lat - ref[1]) < 0.2;
  const walk = (value: unknown, key?: string): unknown => {
    if (typeof value === "string") {
      const filled = value.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? "");
      if ((key === "longitude" || key === "latitude") && /^-?\d+\.\d+$/.test(filled)) {
        return String(Number(walk(Number(filled), key)).toFixed(7));
      }
      return filled;
    }
    if (typeof value === "number") {
      if (key === "longitude") return value + dx;
      if (key === "latitude") return value + dy;
      return value;
    }
    if (Array.isArray(value)) {
      if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number" && near(value[0], value[1])) {
        return [value[0] + dx, value[1] + dy, ...value.slice(2)];
      }
      return value.map((v) => walk(v));
    }
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).filter(([k]) => !k.startsWith("_")).map(([k, v]) => [k, walk(v, k)]));
    }
    return value;
  };
  return walk(template);
}

/** Small deterministic offset (±250 m) so geocoded points differ between addresses. */
function jitter(center: LonLat, text: string): LonLat {
  const s = Number(seedOf(text, 6));
  const ox = ((s % 1000) / 1000 - 0.5) * 0.0065;
  const oy = ((Math.floor(s / 1000) % 1000) / 1000 - 0.5) * 0.0045;
  return [center[0] + ox, center[1] + oy];
}

/** Nearest commune of the table. */
function nearestCommune(point: LonLat): { city: string; insee: string; postcode: string } {
  let best: { city: string; insee: string; postcode: string } = { city: "Commune fictive", insee: "69290", postcode: "69800" };
  let bestD = Infinity;
  for (const [postcode, c] of Object.entries(FIXTURE_COMMUNES)) {
    const d = (c.lonLat[0] - point[0]) ** 2 + (c.lonLat[1] - point[1]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = { city: c.city, insee: c.insee, postcode };
    }
  }
  return best;
}

function centroidOfGeom(json: string | null): LonLat | null {
  if (!json) return null;
  const numbers = [...json.matchAll(/\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/g)].map((m) => [Number(m[1]), Number(m[2])] as const);
  if (numbers.length === 0) return null;
  return [numbers.reduce((s, p) => s + p[0], 0) / numbers.length, numbers.reduce((s, p) => s + p[1], 0) / numbers.length];
}

type Answer = { status: number; body: unknown };

function geocodeSearch(q: string): Answer {
  const postcode = /\b(\d{5})\b/.exec(q)?.[1];
  const commune = postcode ? FIXTURE_COMMUNES[postcode] : undefined;
  if (!postcode || !commune) return { status: 200, body: { type: "FeatureCollection", features: [] } };
  const hasNumber = /^\s*\d+/.test(q);
  const point = jitter(commune.lonLat, q);
  const template = loadFixture("geocode-search.json");
  const body = instantiate(template, point, {}) as { features: { properties: Record<string, unknown> }[] };
  for (const f of body.features) Object.assign(f.properties, { postcode, citycode: commune.insee, city: commune.city });
  const first = body.features[0];
  if (first) {
    first.properties.label = `${q}`;
    if (!hasNumber) Object.assign(first.properties, { type: "municipality", score: 0.86 });
  }
  return { status: 200, body };
}

/**
 * Answers one request of the fixtures mode.
 * @param url - Requested URL.
 * @returns Status and JSON body (404 for an unknown endpoint).
 */
export function fixtureAnswer(url: string): Answer {
  const u = new URL(url);
  const base = `${u.origin}${u.pathname}`;
  const p = (name: string) => u.searchParams.get(name);
  const num = (name: string) => Number(p(name));

  if (base === ENDPOINTS.geocodeSearch) return geocodeSearch(p("q") ?? "");
  if (base === ENDPOINTS.geocodeReverse) {
    const point: LonLat = [num("lon"), num("lat")];
    const c = nearestCommune(point);
    const body = instantiate(loadFixture("geocode-reverse.json"), point, {}) as { features: { properties: Record<string, unknown> }[] };
    for (const f of body.features) Object.assign(f.properties, { postcode: c.postcode, citycode: c.insee, city: c.city, label: `1 Allée Fictive ${c.postcode} ${c.city}` });
    return { status: 200, body };
  }
  if (base === ENDPOINTS.wfs && p("TYPENAMES") === ENDPOINTS.wfsBuildingsLayer) {
    const [south, west, north, east] = (p("BBOX") ?? "").split(",").map(Number) as [number, number, number, number];
    return { status: 200, body: instantiate(loadFixture("wfs-batiment.json"), [(west + east) / 2, (south + north) / 2], {}) };
  }
  if (base === ENDPOINTS.georisquesInstallations) {
    const [lon, lat] = (p("latlon") ?? "0,0").split(",").map(Number) as [number, number];
    const seed = seedOf(p("latlon") ?? "", 5);
    return { status: 200, body: instantiate(loadFixture("georisques-installations.json"), [lon, lat], { seed, seed2: seedOf(`${seed}b`, 5) }) };
  }
  const insee = p("code_insee") ?? "";
  if (base === ENDPOINTS.georisquesCommuneRisks) return { status: 200, body: instantiate(loadFixture("georisques-risques.json"), null, { insee }) };
  if (base === ENDPOINTS.georisquesSeismicZone) return { status: 200, body: instantiate(loadFixture("georisques-zonage-sismique.json"), null, { insee }) };
  if (base === ENDPOINTS.georisquesRadon) return { status: 200, body: instantiate(loadFixture("georisques-radon.json"), null, { insee }) };
  if (base === ENDPOINTS.apiCartoParcels || base === ENDPOINTS.apiCartoUrbanZones) {
    const center = centroidOfGeom(p("geom"));
    if (!center) return { status: 400, body: { message: "geom manquant" } };
    const vars = { insee: nearestCommune(center).insee };
    const file = base === ENDPOINTS.apiCartoParcels ? "apicarto-cadastre-parcelle.json" : "apicarto-gpu-zone-urba.json";
    return { status: 200, body: instantiate(loadFixture(file), center, vars) };
  }
  if (base === ENDPOINTS.companiesNearPoint) {
    return { status: 200, body: instantiate(loadFixture("recherche-entreprises-near-point.json"), [num("long"), num("lat")], {}) };
  }
  return { status: 404, body: { message: "Pas de fixture pour cette URL" } };
}

/** A `fetch` served entirely by the fixtures (no network). */
export const fixtureFetch: FetchLike = async (url) => {
  const { status, body } = fixtureAnswer(url);
  const bytes = Buffer.from(JSON.stringify(body));
  return {
    status,
    headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? "application/json" : null) },
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  };
};
