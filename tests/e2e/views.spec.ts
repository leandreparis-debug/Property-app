import { expect, test, type Page } from "@playwright/test";
import type { SiteIndexEntry } from "../../src/domain/site-index";
import { ORIGIN, VIEWER_STATE } from "./fixtures";

async function index(page: Page): Promise<SiteIndexEntry[]> {
  const response = await page.request.get("/api/sites/index");
  expect(response.status()).toBe(200);
  return ((await response.json()) as { entries: SiteIndexEntry[] }).entries;
}

async function openMap(page: Page, path = "/") {
  await page.goto(path);
  await page.waitForFunction(() => window.__vigieMap?.ready === true, null, { timeout: 60_000 });
}

/** Region with the most located sites. */
function busiestRegion(entries: SiteIndexEntry[]): { region: string; codes: string[] } {
  const byRegion = new Map<string, string[]>();
  for (const e of entries) if (e.region && e.lat !== null) byRegion.set(e.region, [...(byRegion.get(e.region) ?? []), e.code]);
  const [region, codes] = [...byRegion].sort((a, b) => b[1].length - a[1].length)[0]!;
  return { region, codes };
}

const listCodes = (page: Page) => page.locator('[data-slot="site-list"] ul button').evaluateAll((els) => els.map((el) => el.textContent ?? ""));

test.describe("filtres sur la carte", () => {
  test("cocher une région : URL, compteur, liste ; rechargement ; retrait de la puce", async ({ page }) => {
    await openMap(page);
    const entries = await index(page);
    const { region, codes } = busiestRegion(entries);

    await page.getByRole("button", { name: /^Filtres/ }).click();
    const panel = page.locator('[data-slot="filter-panel"]');
    await expect(panel).toBeVisible();
    await panel.getByRole("group", { name: "Région" }).getByLabel(region).check();
    await expect(page).toHaveURL(/[?&]region=/);
    const inRegion = entries.filter((e) => e.region === region).length;
    await expect(page.locator('[data-slot="filter-count"]')).toHaveText(`${inRegion} / ${entries.length} sites`);
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);

    await page.getByRole("button", { name: "Liste des sites" }).click();
    const listed = await listCodes(page);
    expect(listed).toHaveLength(codes.length);
    for (const code of codes) expect(listed.some((t) => t.includes(code))).toBe(true);

    await page.reload();
    await page.waitForFunction(() => window.__vigieMap?.ready === true, null, { timeout: 60_000 });
    await expect(page.locator('[data-slot="filter-count"]')).toHaveText(`${inRegion} / ${entries.length} sites`);

    await page.getByRole("button", { name: `Retirer le filtre Région : ${region}` }).click();
    await expect(page).not.toHaveURL(/region=/);
    await expect(page.locator('[data-slot="filter-count"]')).toHaveText(`${entries.length} / ${entries.length} sites`);
  });

  test("légende : un clic sur « Critique » filtre, un second retire le filtre", async ({ page }) => {
    await openMap(page);
    const legend = page.locator('[data-slot="map-legend"]');
    await legend.getByRole("button", { name: "Filtrer le statut Critique" }).click();
    await expect(page).toHaveURL(/[?&]status=critical(&|$)/);
    await expect(legend.getByRole("button", { name: "Retirer le statut Critique" })).toHaveAttribute("aria-pressed", "true");
    await legend.getByRole("button", { name: "Retirer le statut Critique" }).click();
    await expect(page).not.toHaveURL(/status=/);
  });

  test("aucun résultat : état vide et « Effacer les filtres »", async ({ page }) => {
    await openMap(page, "/?q=zzzz-introuvable");
    const empty = page.locator('[data-slot="no-result"]');
    await expect(empty).toContainText("Aucun site ne correspond aux filtres");
    await empty.getByRole("button", { name: "Effacer les filtres" }).click();
    await expect(empty).toHaveCount(0);
    await expect(page).toHaveURL(`${ORIGIN}/`);
  });
});

test.describe("recherche universelle", () => {
  test("partie d'un nom sans accent → Entrée ouvre SitePeek, filtres conservés", async ({ page }) => {
    await page.goto("/");
    const entries = await index(page);
    const target = entries.find((e) => e.lat !== null && /[éèêàôî]/i.test(e.name)) ?? entries.find((e) => e.lat !== null)!;
    const region = target.region!;
    await openMap(page, `/?region=${encodeURIComponent(region)}`);

    await page.keyboard.press("Control+K");
    const dialog = page.getByRole("dialog", { name: "Recherche" });
    const words = target.name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[\s-]+/);
    await dialog.getByRole("combobox").fill(words.slice(-2).join(" "));
    const option = dialog.getByRole("option").filter({ hasText: target.code });
    await expect(option).toBeVisible();
    await option.click();

    const peek = page.locator('[data-slot="site-peek"]');
    await expect(peek).toHaveAttribute("data-code", target.code);
    await expect(page).toHaveURL(new RegExp(`site=${target.code}`));
    await expect(page).toHaveURL(/region=/);
    expect(await page.evaluate(() => window.__vigieMap?.selectedCode)).toBe(target.code);
  });

  test("actions : « Afficher les sites critiques » ; un lieu applique le filtre du département", async ({ page }) => {
    await openMap(page);
    const entries = await index(page);
    await page.keyboard.press("Control+K");
    let dialog = page.getByRole("dialog", { name: "Recherche" });
    await expect(dialog.getByRole("option", { name: /Afficher les sites critiques/ })).toBeVisible(); // empty palette
    await dialog.getByRole("combobox").fill("critiques");
    await dialog.getByRole("option", { name: /Afficher les sites critiques/ }).click();
    await expect(page).toHaveURL(/[?&]status=critical/);

    const dep = entries.find((e) => e.departmentName && e.departmentCode)!;
    await page.keyboard.press("Control+K");
    dialog = page.getByRole("dialog", { name: "Recherche" });
    await dialog.getByRole("combobox").fill(dep.departmentName!);
    await dialog.getByRole("option", { name: new RegExp(`\\(${dep.departmentCode}\\)`) }).click();
    await expect(page).toHaveURL(new RegExp(`[?&]dep=${dep.departmentCode}`));
  });
});

test.describe("liste des sites", () => {
  test("nombre de lignes, tri par surface avec aria-sort, clic sur une ligne", async ({ page }) => {
    await page.goto("/sites");
    const entries = await index(page);
    const rows = page.locator('[data-slot="sites-table"] tbody tr');
    await expect(rows).toHaveCount(entries.length);

    const header = page.getByRole("columnheader", { name: "Surface" });
    await expect(header).toHaveAttribute("aria-sort", "none");
    await header.getByRole("button").click();
    await expect(header).toHaveAttribute("aria-sort", "ascending");
    await expect(page).toHaveURL(/sort=area/);
    const smallest = Math.min(...entries.filter((e) => e.totalArea !== null).map((e) => e.totalArea!));
    const firstCode = await rows.first().getAttribute("data-code");
    expect(entries.find((e) => e.code === firstCode)?.totalArea).toBe(smallest);
    await header.getByRole("button").click();
    await expect(header).toHaveAttribute("aria-sort", "descending");
    await expect(page).toHaveURL(/sort=-area/);

    const first = await rows.first().getAttribute("data-code");
    const id = entries.find((e) => e.code === first)!.id;
    await rows.first().click();
    await expect(page).toHaveURL(`${ORIGIN}/sites/${id}`);
  });

  test("un filtre posé sur la carte est conservé en passant par le rail", async ({ page }) => {
    await openMap(page, "/?status=ok");
    const entries = await index(page);
    await page.getByRole("navigation", { name: "Navigation principale" }).getByRole("link", { name: "Sites", exact: true }).click();
    await expect(page).toHaveURL(`${ORIGIN}/sites?status=ok`);
    await expect(page.locator('[data-slot="sites-table"] tbody tr')).toHaveCount(entries.filter((e) => e.status === "ok").length);
  });
});

test.describe("supervision", () => {
  test("indicateurs cohérents, clic sur une région, mode présentation", async ({ page }) => {
    await page.goto("/supervision");
    const entries = await index(page);
    const kpis = page.locator('[data-slot="kpi"]');
    await expect(kpis.first()).toContainText(String(entries.length));
    const critical = entries.filter((e) => e.status === "critical").length;
    await expect(page.locator('[data-slot="status-shares"] [data-status="critical"] [data-slot="share-count"]')).toHaveText(String(critical));

    const { region } = busiestRegion(entries);
    await page.locator('[data-slot="region-bars"]').getByRole("button", { name: new RegExp(`^Filtrer la région ${region}`) }).click();
    await expect(page).toHaveURL(/[?&]region=/);
    await expect(kpis.first()).toContainText(String(entries.filter((e) => e.region === region).length));

    await page.getByRole("button", { name: "Mode présentation" }).click();
    await expect(page).toHaveURL(/present=1/);
    await expect(page.getByRole("navigation", { name: "Navigation principale" })).toHaveCount(0);
    await expect(page.locator('[data-slot="updated-at"]')).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page).not.toHaveURL(/present=1/);
    await expect(page.getByRole("navigation", { name: "Navigation principale" })).toBeVisible();
  });
});

test.describe("lecteur", () => {
  test.use({ storageState: VIEWER_STATE });

  test("accède aux trois vues, sans requête hors de l'origine", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (r) => requests.push(r.url()));
    await openMap(page);
    await page.goto("/sites");
    await expect(page.locator('[data-slot="sites-table"]')).toBeVisible();
    await page.goto("/supervision");
    await expect(page.locator('[data-slot="kpis"]')).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(requests.filter((u) => !u.startsWith(`${ORIGIN}/`) && !u.startsWith("data:") && !u.startsWith("blob:"))).toEqual([]);
  });
});
