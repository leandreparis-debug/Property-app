/**
 * Offline-bundle tool — configuration.
 *
 * ⚠ tools/offline-bundle/ is THE ONLY PLACE OF THE REPOSITORY ALLOWED TO REACH
 * THE INTERNET. It runs on a connected workstation, never on the Vigie server,
 * and is never imported by the application (src/).
 *
 * Every public endpoint is declared here, with the documentation that
 * justifies it. Formats must be confirmed with `pnpm bundle:probe` on a
 * connected workstation (the fixtures of __fixtures__/ are synthetic).
 */
import type { BundleSource } from "../../src/domain/bundle-manifest";

/** Tool version (User-Agent, manifest). */
export const TOOL_VERSION = "1.0.0";
/** Explicit User-Agent sent to every public service. */
export const USER_AGENT = `Vigie-offline-bundle/${TOOL_VERSION}`;

/** HTTP defaults (overridable per provider). */
export const HTTP_DEFAULTS = {
  /** Requests per second per provider. */
  requestsPerSecond: 5,
  /** Retries on 429 and 5xx (exponential back-off). */
  maxRetries: 3,
  /** First back-off delay (doubled at each retry; Retry-After wins when present). */
  backoffMs: 1000,
  /** Timeout per request. */
  timeoutMs: 15_000,
} as const;

/**
 * Public endpoints.
 *
 * Sources (consulted September 2026):
 * - Geocoding: the historical BAN API (api-adresse.data.gouv.fr) was
 *   transferred to IGN and DECOMMISSIONED at the end of January 2026; the
 *   Géoplateforme geocoding service replaces it with the same query/response
 *   format. https://adresse.data.gouv.fr/blog/lapi-adresse-de-la-base-adresse-nationale-est-transferee-a-lign
 *   and https://geoservices.ign.fr/documentation/services/services-geoplateforme/geocodage
 * - Buildings: Géoplateforme WFS, BD TOPO v3 layer « BDTOPO_V3:batiment »
 *   (attribute « hauteur », identifier « cleabs »).
 *   https://cartes.gouv.fr/aide/fr/guides-utilisateur/utiliser-les-services-de-la-geoplateforme/diffusion/wfs/
 * - Aerial imagery: Géoplateforme WMTS, layer ORTHOIMAGERY.ORTHOPHOTOS with the
 *   TileMatrixSet « PM_0_19 » (was PM_0_21 before July 2025).
 *   https://geoservices.ign.fr/actualites/2025-07-09-mise-%C3%A0-jour-flux-ortho
 * - Géorisques: API v1 (no token; v2 requires one).
 *   https://www.georisques.gouv.fr/doc-api
 * - Cadastre and urban planning: API Carto (IGN), modules cadastre and GPU.
 *   https://apicarto.ign.fr/api/doc/cadastre — https://apicarto.ign.fr/api/doc/gpu
 * - Companies: API Recherche d'entreprises (no key, 7 requests/s per IP).
 *   https://recherche-entreprises.api.gouv.fr/docs/
 * - Basemap: Protomaps daily builds + basemaps-assets (fonts, sprites).
 *   https://docs.protomaps.com/basemaps/downloads
 */
export const ENDPOINTS = {
  geocodeSearch: "https://data.geopf.fr/geocodage/search",
  geocodeReverse: "https://data.geopf.fr/geocodage/reverse",
  wfs: "https://data.geopf.fr/wfs/ows",
  wfsBuildingsLayer: "BDTOPO_V3:batiment",
  wmts: "https://data.geopf.fr/wmts",
  wmtsOrthoLayer: "ORTHOIMAGERY.ORTHOPHOTOS",
  wmtsOrthoTileMatrixSet: "PM_0_19",
  georisquesBase: "https://georisques.gouv.fr/api/v1",
  georisquesInstallations: "https://georisques.gouv.fr/api/v1/installations_classees",
  georisquesCommuneRisks: "https://georisques.gouv.fr/api/v1/gaspar/risques",
  georisquesSeismicZone: "https://georisques.gouv.fr/api/v1/zonage_sismique",
  georisquesRadon: "https://georisques.gouv.fr/api/v1/radon",
  georisquesInstallationPage: "https://www.georisques.gouv.fr/risques/installations/donnees/details/",
  apiCartoParcels: "https://apicarto.ign.fr/api/cadastre/parcelle",
  apiCartoUrbanZones: "https://apicarto.ign.fr/api/gpu/zone-urba",
  companiesNearPoint: "https://recherche-entreprises.api.gouv.fr/near_point",
  protomapsBuilds: "https://build.protomaps.com",
  protomapsBuildsIndex: "https://build-metadata.protomaps.dev/builds.json",
  protomapsAssets: "https://protomaps.github.io/basemaps-assets",
} as const;

/** Rate limits per provider (requests per second), below each service's published limit. */
export const PROVIDER_RATE_LIMITS: Readonly<Record<string, number>> = {
  geocoding: 5,
  buildings: 5,
  georisques: 5,
  cadastre: 5,
  urbanisme: 5,
  companies: 5,
  ortho: 5,
  assets: 5,
};

/** Metropolitan France with a margin (west, south, east, north) — basemap extract. */
export const FRANCE_BBOX = [-5.8, 41.2, 10.0, 51.5] as const;

/** Map defaults. */
export const MAP_DEFAULTS = {
  /** Max zoom of the vector basemap extract. */
  maxzoom: 14,
  /** Aerial imagery zooms around each site. */
  orthoMinZoom: 15,
  orthoMaxZoom: 18,
  /** Radius (m) of aerial imagery around each site. */
  orthoRadiusM: 500,
  /** Size goal of the whole bundle. */
  targetBundleBytes: 2 * 1024 ** 3,
} as const;

/** Font stacks used by the Protomaps v4 « dark » theme. */
export const FONT_STACKS = ["Noto Sans Regular", "Noto Sans Medium", "Noto Sans Italic"] as const;

/**
 * Glyph ranges downloaded (256 code points each): Latin, Latin-1, Latin
 * Extended, Greek, Cyrillic basics and general punctuation — enough for
 * French place names and neighbouring countries' labels.
 */
export const FONT_RANGES = [0, 256, 512, 768, 1024, 8192, 8448, 8704] as const;

/** Sprite sheets of the dark theme (standard and HiDPI). */
export const SPRITE_FILES = ["dark.json", "dark.png", "dark@2x.json", "dark@2x.png"] as const;

/** Sprite version path in basemaps-assets. */
export const SPRITE_VERSION = "v4";

/** Geocoding: minimum score and result types for a coordinates proposal. */
export const GEOCODING_RULES = {
  minScore: 0.8,
  acceptedTypes: ["housenumber", "street"] as readonly string[],
  /** Distance above which existing coordinates are reported as divergent. */
  divergenceMeters: 500,
} as const;

/** Building footprint: search radius and area comparison threshold. */
export const BUILDING_RULES = { radiusM: 250, areaGapRatio: 0.3 } as const;

/** ICPE matching: search radius, match distance, name similarity. */
export const ICPE_RULES = { radiusM: 1000, matchDistanceM: 200, minNameSimilarity: 0.6 } as const;

/** Sources, licences and attributions recorded in the manifest. */
export const SOURCES: readonly BundleSource[] = [
  {
    id: "protomaps-osm",
    name: "Fond de carte vectoriel Protomaps (OpenStreetMap)",
    provider: "Protomaps / contributeurs OpenStreetMap",
    licence: "ODbL 1.0 (données) ; CC0 (schéma Protomaps)",
    licenceUrl: "https://www.openstreetmap.org/copyright",
    attribution: "© contributeurs OpenStreetMap, Protomaps",
    usedFor: ["map/france.pmtiles"],
  },
  {
    id: "protomaps-assets",
    name: "Polices et symboles Protomaps basemaps-assets",
    provider: "Protomaps",
    licence: "SIL Open Font License 1.1 (polices Noto) ; CC0 (symboles)",
    licenceUrl: "https://github.com/protomaps/basemaps-assets",
    attribution: "Polices Noto (OFL), symboles Protomaps",
    usedFor: ["map/fonts", "map/sprites"],
  },
  {
    id: "ign-ortho",
    name: "Orthophotographies IGN (Géoplateforme WMTS)",
    provider: "IGN",
    licence: "Licence Ouverte Etalab 2.0",
    licenceUrl: "https://www.etalab.gouv.fr/licence-ouverte-open-licence/",
    attribution: "© IGN – BD ORTHO",
    usedFor: ["map/ortho-sites.pmtiles"],
  },
  {
    id: "ign-geocoding",
    name: "Géocodage de la Géoplateforme (Base Adresse Nationale)",
    provider: "IGN / BAN",
    licence: "Licence Ouverte Etalab 2.0",
    licenceUrl: "https://www.etalab.gouv.fr/licence-ouverte-open-licence/",
    attribution: "Base Adresse Nationale, IGN",
    usedFor: ["enrichment.json#geocoding"],
  },
  {
    id: "ign-bdtopo",
    name: "BD TOPO – bâtiments (Géoplateforme WFS)",
    provider: "IGN",
    licence: "Licence Ouverte Etalab 2.0",
    licenceUrl: "https://www.etalab.gouv.fr/licence-ouverte-open-licence/",
    attribution: "© IGN – BD TOPO",
    usedFor: ["enrichment.json#buildings"],
  },
  {
    id: "georisques",
    name: "Géorisques (installations classées, risques, sismicité, radon)",
    provider: "Ministère de la Transition écologique / BRGM",
    licence: "Licence Ouverte Etalab 2.0",
    licenceUrl: "https://www.etalab.gouv.fr/licence-ouverte-open-licence/",
    attribution: "Géorisques – MTE / BRGM",
    usedFor: ["enrichment.json#georisques"],
  },
  {
    id: "ign-cadastre",
    name: "Parcellaire Express (API Carto, module cadastre)",
    provider: "IGN / DGFiP",
    licence: "Licence Ouverte Etalab 2.0",
    licenceUrl: "https://www.etalab.gouv.fr/licence-ouverte-open-licence/",
    attribution: "© IGN – DGFiP, Parcellaire Express",
    usedFor: ["enrichment.json#cadastre"],
  },
  {
    id: "gpu",
    name: "Géoportail de l'Urbanisme (API Carto, module GPU)",
    provider: "IGN / DGALN",
    licence: "Licence Ouverte Etalab 2.0",
    licenceUrl: "https://www.etalab.gouv.fr/licence-ouverte-open-licence/",
    attribution: "Géoportail de l'Urbanisme",
    usedFor: ["enrichment.json#urbanisme"],
  },
  {
    id: "recherche-entreprises",
    name: "API Recherche d'entreprises (SIRENE)",
    provider: "DINUM / INSEE",
    licence: "Licence Ouverte Etalab 2.0",
    licenceUrl: "https://www.etalab.gouv.fr/licence-ouverte-open-licence/",
    attribution: "Base SIRENE – INSEE, API Recherche d'entreprises",
    usedFor: ["enrichment.json#companies"],
  },
];
