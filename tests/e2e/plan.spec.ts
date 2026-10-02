import { expect, test, type Page } from "@playwright/test";
import { fromMercator, mercatorScale, toMercator } from "../../src/domain/geometry";
import { EDITOR_STATE, ORIGIN, VIEWER_STATE } from "./fixtures";

/**
 * Plan tab (step 10), on the vigie_e2e database: DEMO-005 has no footprint
 * (approximate volume) and no plan at the start of the run. The steps depend
 * on each other (upload → calibration → equipments), hence a serial suite.
 */

const SITE_CODE = "DEMO-005";
const CENTER: [number, number] = [-1.753, 48.215];
/** Test plan: 1000 × 500 px = the approximate 2:1 rectangle of 18 900 m² (194.4 × 97.2 m). */
const PLAN = { width: 1000, height: 500, lengthM: Math.sqrt(2 * 18_900) } as const;

/** [lon, lat] of a plan pixel (north up, the plan covers the rectangle). */
function lngLatOf([x, y]: [number, number]): [number, number] {
  const k = mercatorScale(CENTER[1]);
  const mPerPx = PLAN.lengthM / PLAN.width;
  const [cx, cy] = toMercator(CENTER);
  return fromMercator([cx + (x - PLAN.width / 2) * mPerPx * k, cy - (y - PLAN.height / 2) * mPerPx * k]);
}

/** A generated plan image: grid and 4 corner marks (PNG). */
async function planImage(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(({ width, height }) => {
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    const g = c.getContext("2d")!;
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, width, height);
    g.strokeStyle = "#9aa4b5";
    for (let x = 0; x <= width; x += 50) g.strokeRect(x, 0, 0, height);
    for (let y = 0; y <= height; y += 50) g.strokeRect(0, y, width, 0);
    g.lineWidth = 6;
    g.strokeStyle = "#111111";
    g.strokeRect(3, 3, width - 6, height - 6);
    g.fillStyle = "#111111";
    for (const [x, y] of [[0, 0], [width, 0], [width, height], [0, height]]) g.fillRect(x! - 12, y! - 12, 24, 24);
    return c.toDataURL("image/png");
  }, PLAN);
  return Buffer.from(dataUrl.split(",")[1]!, "base64");
}

async function siteId(page: Page, code: string): Promise<string> {
  const entries = ((await (await page.request.get("/api/sites/index")).json()) as { entries: { id: string; code: string }[] }).entries;
  return entries.find((e) => e.code === code)!.id;
}

async function openPlanTab(page: Page, id: string) {
  await page.goto(`/sites/${id}?tab=plan`);
  await page.waitForFunction(() => window.__vigiePlanMap?.ready === true, null, { timeout: 60_000 });
}

/** Every request stays on the application's origin (closed network). */
function trackForeignRequests(page: Page): string[] {
  const foreign: string[] = [];
  page.on("request", (r) => {
    const url = r.url();
    if (!url.startsWith(ORIGIN) && !url.startsWith("data:") && !url.startsWith("blob:")) foreign.push(url);
  });
  return foreign;
}

test.describe.serial("onglet Plan — éditeur", () => {
  test.use({ storageState: EDITOR_STATE });
  test.setTimeout(120_000);
  let id = "";

  test("sans plan : état vide « Aucun plan pour ce site » et volume approximatif", async ({ page }) => {
    const foreign = trackForeignRequests(page);
    id = await siteId(page, SITE_CODE);
    await openPlanTab(page, id);
    await expect(page.getByRole("heading", { name: "Aucun plan pour ce site" })).toBeVisible();
    await expect(page.getByText("Volume approximatif (emprise non renseignée)", { exact: false })).toBeVisible();
    await expect(page.locator('[data-slot="equipment-panel"]')).toContainText("Aucun équipement sur ce site.");
    expect(foreign).toEqual([]);
  });

  test("ajout d'une image de plan, calibration numérique à 4 points (< 1 m), enregistrement", async ({ page }) => {
    const foreign = trackForeignRequests(page);
    await openPlanTab(page, id);
    await page.getByRole("button", { name: "Ajouter un plan" }).first().click();
    const upload = page.getByRole("dialog", { name: "Ajouter un plan" });
    await upload.getByLabel("Image du plan").setInputFiles({ name: "plan-demo-005.png", mimeType: "image/png", buffer: await planImage(page) });
    await expect(upload.getByText("1000 × 500")).toBeVisible();
    await upload.getByRole("button", { name: "Envoyer le plan" }).click();
    await expect(page.getByText("Plan non calibré", { exact: false })).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "Calibrer le plan" }).click();
    const wizard = page.locator('[data-slot="calibration-wizard"]');
    await expect(wizard).toBeVisible();
    const pixels: [number, number][] = [[0, 0], [1000, 0], [1000, 500], [0, 500]];
    for (const [i, px] of pixels.entries()) {
      await wizard.getByRole("button", { name: "Ajouter un point" }).click();
      const [lon, lat] = lngLatOf(px);
      await wizard.getByLabel(`x plan du point ${i + 1}`).fill(String(px[0]));
      await wizard.getByLabel(`y plan du point ${i + 1}`).fill(String(px[1]));
      await wizard.getByLabel(`Latitude du point ${i + 1}`).fill(lat.toFixed(7));
      await wizard.getByLabel(`Longitude du point ${i + 1}`).fill(lon.toFixed(7));
    }
    const quality = wizard.locator('[data-slot="calibration-quality"]');
    await expect(quality).toContainText("Calibration précise");
    const rms = Number((await quality.locator('[data-slot="rms"]').textContent())!.replace(",", "."));
    expect(rms).toBeLessThan(1);
    await wizard.getByRole("button", { name: "Enregistrer la calibration" }).click();
    await expect(wizard).toBeHidden({ timeout: 20_000 });
    await expect(page.locator('[data-slot="plan-status"]')).toContainText("Calibration précise");
    expect(foreign).toEqual([]);
  });

  test("le plan est superposé ; opacité et « Masquer le plan »", async ({ page }) => {
    await openPlanTab(page, id);
    await page.waitForFunction(() => window.__vigiePlanMap?.planVisible === true);
    expect(await page.evaluate(() => window.__vigiePlanMap?.planOpacity)).toBeCloseTo(0.7, 5);
    await page.getByLabel("Opacité du plan").fill("0.4");
    await page.waitForFunction(() => Math.abs((window.__vigiePlanMap?.planOpacity ?? 0) - 0.4) < 1e-6);
    await page.getByRole("button", { name: "Masquer le plan" }).click();
    await page.waitForFunction(() => window.__vigiePlanMap?.planVisible === false);
    await page.getByRole("button", { name: "Afficher le plan" }).click();
    await page.waitForFunction(() => window.__vigiePlanMap?.planVisible === true);
  });

  test("ajout d'un RIA par clic sur le plan, puis déplacement au clavier", async ({ page }) => {
    const foreign = trackForeignRequests(page);
    await openPlanTab(page, id);
    await page.getByLabel("Type de l'équipement à ajouter").selectOption("FIRE_HOSE_REEL");
    await page.getByRole("button", { name: "Ajouter un équipement" }).click();
    await expect(page.locator('[data-slot="placing-banner"]')).toContainText("le plan");
    // Click the plan pixel (500, 250), i.e. the site center.
    const target = lngLatOf([500, 250]);
    const map = page.locator('[data-slot="site-plan-map"]');
    await map.scrollIntoViewIfNeeded();
    const point = await page.evaluate((lngLat) => window.__vigiePlanMap!.project!(lngLat), target);
    await map.click({ position: { x: point.x, y: point.y } });

    const form = page.locator('[data-slot="equipment-form"]');
    await expect(form.getByLabel("Libellé")).toHaveValue("RIA 1");
    await form.getByLabel("Référence").fill("R-E2E-01");
    await form.getByRole("button", { name: "Ajouter l'équipement" }).click();
    await expect(form).toBeHidden({ timeout: 20_000 });
    const row = page.locator('[data-slot="equipment-row"]').filter({ hasText: "RIA 1" });
    await expect(row).toBeVisible();
    await page.waitForFunction(() => window.__vigiePlanMap?.equipments === 1);

    // Selected card: placed on the plan near pixel (500, 250).
    const card = page.locator('[data-slot="equipment-card"]');
    await expect(card).toBeVisible();
    const onPlan = (await card.getByText(/^x \d+ · y \d+ px$/).textContent())!;
    const [px, py] = onPlan.match(/\d+/g)!.map(Number);
    expect(Math.abs(px! - 500)).toBeLessThan(15);
    expect(Math.abs(py! - 250)).toBeLessThan(15);

    // Keyboard move: Shift+→ twice (10 m east), then save.
    const position = card.locator("dd").filter({ hasText: /^-?\d+\.\d{6}, -?\d+\.\d{6}$/ });
    const before = (await position.textContent())!;
    await card.locator('[data-slot="move-pad"]').focus();
    await page.keyboard.press("Shift+ArrowRight");
    await page.keyboard.press("Shift+ArrowRight");
    await card.getByRole("button", { name: "Enregistrer la position" }).click();
    await expect(page.locator('[data-slot="toast"]').filter({ hasText: "Position enregistrée" }).first()).toBeVisible();
    await expect(card.getByRole("button", { name: "Enregistrer la position" })).toBeHidden();
    await expect(position).not.toHaveText(before);
    // After the refresh, the stored position is shown (6 decimals, ≈ 0.1 m).
    await page.reload();
    await page.waitForFunction(() => window.__vigiePlanMap?.ready === true, null, { timeout: 60_000 });
    await page.locator('[data-slot="equipment-row"]').filter({ hasText: "RIA 1" }).click();
    const after = (await page.locator('[data-slot="equipment-card"] dd').filter({ hasText: /^-?\d+\.\d{6}, -?\d+\.\d{6}$/ }).textContent())!;
    const lonBefore = Number(before.split(", ")[1]);
    const lonAfter = Number(after.split(", ")[1]);
    // 10 m east at 48.2° N ≈ 0.000135° of longitude.
    expect(lonAfter - lonBefore).toBeGreaterThan(0.0001);
    expect(lonAfter - lonBefore).toBeLessThan(0.00017);
    expect(foreign).toEqual([]);
  });
});

test.describe("onglet Plan — lecteur", () => {
  test.use({ storageState: VIEWER_STATE });

  test("voit le plan et les équipements, sans aucune action d'édition", async ({ page }) => {
    const id = await siteId(page, SITE_CODE);
    await openPlanTab(page, id);
    const panel = page.locator('[data-slot="plan-panel"]');
    // The editor suite may not have run first in this worker: check what exists.
    await expect(panel).toBeVisible();
    for (const name of ["Ajouter un plan", "Calibrer le plan", "Recalibrer", "Remplacer le plan", "Ajouter un équipement", "Modifier", "Archiver", "Enregistrer la position"]) {
      await expect(panel.getByRole("button", { name, exact: true })).toHaveCount(0);
    }
    await expect(panel.getByLabel("Type de l'équipement à ajouter")).toHaveCount(0);
    for (const radio of await panel.locator('[data-slot="dock-side"] input').all()) await expect(radio).toBeDisabled();
    const rows = panel.locator('[data-slot="equipment-row"]');
    if ((await rows.count()) > 0) {
      await rows.first().click();
      await expect(panel.locator('[data-slot="equipment-card"]')).toBeVisible();
      await expect(panel.locator('[data-slot="move-pad"]')).toHaveCount(0);
    }
  });
});

test.describe("carte nationale — volume du site sélectionné", () => {
  test("volumeParts : 8 cellules et 44 quais pour DEMO-001", async ({ page }) => {
    test.setTimeout(120_000);
    const foreign = trackForeignRequests(page);
    await page.goto("/?site=DEMO-001");
    await page.waitForFunction(() => window.__vigieMap?.ready === true, null, { timeout: 60_000 });
    await page.waitForFunction(() => window.__vigieMap?.volumeParts != null);
    // Seed: 48 320 m² → round(48 320 / 6 000) = 8 cells, round(48 320 / 1 100) = 44 docks (they fit on the facade).
    expect(await page.evaluate(() => window.__vigieMap?.volumeParts)).toEqual({ cells: 8, docks: 44 });
    await expect(page.locator('[data-slot="site-peek"]').filter({ hasText: "Volume approximatif (emprise non renseignée)" }).first()).toBeVisible();
    expect(foreign).toEqual([]);
  });
});
