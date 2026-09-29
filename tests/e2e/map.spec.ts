import { spawn, type ChildProcess } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import type { MapSitesData } from "../../src/domain/map-dto";
import { ORIGIN, VIEWER_STATE } from "./fixtures";

/** Waits until the national map signals it is ready (test hook). */
async function openMap(page: Page, path = "/") {
  await page.goto(path);
  await page.waitForFunction(() => window.__vigieMap?.ready === true, null, { timeout: 60_000 });
}

async function mapData(page: Page): Promise<MapSitesData> {
  const response = await page.request.get("/api/map/sites");
  expect(response.status()).toBe(200);
  return (await response.json()) as MapSitesData;
}

test.describe("carte nationale", () => {
  test("la carte s'affiche, en mode de secours, sans requête externe", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (r) => requests.push(r.url()));
    await openMap(page);
    await expect(page.getByRole("region", { name: "Carte des entrepôts" })).toBeVisible();
    const banner = page.locator('[data-slot="fallback-banner"]');
    await expect(banner).toContainText("Fond de carte détaillé non installé");
    await expect(banner).toContainText("docs/offline-bundle.md"); // admin
    await page.waitForLoadState("networkidle");
    expect(requests.filter((u) => !u.startsWith(`${ORIGIN}/`) && !u.startsWith("data:") && !u.startsWith("blob:"))).toEqual([]);
    // Fallback: never a glyph request.
    expect(requests.some((u) => u.includes("/api/map-assets/fonts/"))).toBe(false);
  });

  test("les décomptes de la légende correspondent aux données", async ({ page }) => {
    await openMap(page);
    const data = await mapData(page);
    const legend = page.locator('[data-slot="map-legend"]');
    for (const status of ["critical", "warning", "unknown", "ok"] as const) {
      await expect(legend.locator(`[data-status="${status}"] [data-slot="status-count"]`)).toHaveText(String(data.counts[status]));
    }
  });

  test("liste des sites → SitePeek, ?site= dans l'URL, Échap ferme", async ({ page }) => {
    await openMap(page);
    const data = await mapData(page);
    const target = data.points.features[data.points.features.length - 1]!.properties; // most severe
    await page.getByRole("button", { name: "Liste des sites" }).click();
    await page.locator('[data-slot="site-list"] ul').getByRole("button", { name: new RegExp(target.code) }).click();
    const peek = page.locator('[data-slot="site-peek"]');
    await expect(peek).toBeVisible();
    await expect(peek.getByRole("heading", { level: 2 })).toHaveText(target.name);
    await expect(page).toHaveURL(new RegExp(`\\?site=${target.code}$`));
    expect(await page.evaluate(() => window.__vigieMap?.selectedCode)).toBe(target.code);

    await page.keyboard.press("Escape");
    await expect(peek).toHaveCount(0);
    await expect(page).toHaveURL(`${ORIGIN}/`);
    expect(await page.evaluate(() => window.__vigieMap?.selectedCode)).toBeNull();
  });

  test("/?site=CODE sélectionne le site ; « Ouvrir la fiche » mène à /sites/[id]", async ({ page }) => {
    await page.goto("/");
    const data = await mapData(page);
    const target = data.points.features[0]!.properties;
    await openMap(page, `/?site=${target.code}`);
    const peek = page.locator('[data-slot="site-peek"]');
    await expect(peek).toHaveAttribute("data-code", target.code);
    expect(await page.evaluate(() => window.__vigieMap?.selectedCode)).toBe(target.code);
    await peek.getByRole("link", { name: "Ouvrir la fiche" }).click();
    await expect(page).toHaveURL(`${ORIGIN}/sites/${target.id}`);
    await expect(page.getByRole("heading", { level: 1, name: target.name })).toBeVisible();
  });

  test("la pastille des sites non localisés liste le bon nombre de sites", async ({ page }) => {
    await openMap(page);
    const { unlocated } = await mapData(page);
    const pill = page.locator('[data-slot="unlocated"]');
    if (unlocated.length === 0) {
      await expect(pill).toHaveCount(0);
      return;
    }
    await expect(pill).toContainText(`${unlocated.length} site`);
    await pill.getByRole("button").click();
    await expect(pill.getByRole("link")).toHaveCount(unlocated.length);
  });
});

test.describe("lecteur", () => {
  test.use({ storageState: VIEWER_STATE });

  test("le bandeau du mode de secours ne montre pas la procédure d'installation", async ({ page }) => {
    await openMap(page);
    const banner = page.locator('[data-slot="fallback-banner"]');
    await expect(banner).toHaveText("Fond de carte détaillé non installé");
  });
});

test.describe("chargement", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("/login ne charge aucun script contenant MapLibre", async ({ page }) => {
    const bodies: Promise<string>[] = [];
    page.on("response", (r) => {
      if (r.request().resourceType() === "script") bodies.push(r.text().catch(() => ""));
    });
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    const scripts = await Promise.all(bodies);
    expect(scripts.length).toBeGreaterThan(0);
    expect(scripts.filter((s) => /maplibre/i.test(s))).toEqual([]);
  });
});

test.describe("build de production", () => {
  const PORT = 3100;
  let server: ChildProcess | null = null;

  test.beforeAll(async () => {
    // Same build, started WITHOUT VIGIE_E2E_TEST_HOOKS, like a real deployment.
    const env: Record<string, string | undefined> = { ...process.env, PORT: String(PORT) };
    delete env.VIGIE_E2E_TEST_HOOKS;
    server = spawn("pnpm", ["exec", "next", "start", "-p", String(PORT)], { env: env as unknown as NodeJS.ProcessEnv, stdio: "ignore" });
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(`http://localhost:${PORT}/api/health`)).ok) return;
      } catch {
        // not yet listening
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error("serveur de production non démarré");
  });

  test.afterAll(() => {
    server?.kill();
  });

  test("window.__vigieMap est indéfini", async ({ page }) => {
    await page.goto(`http://localhost:${PORT}/`);
    await expect(page.locator(".maplibregl-canvas")).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(1_000);
    expect(await page.evaluate(() => typeof window.__vigieMap)).toBe("undefined");
  });
});
