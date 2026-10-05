import { expect, test, type Browser, type Page } from "@playwright/test";
import type { SiteIndexEntry } from "../../src/domain/site-index";
import { ADMIN_STATE, EDITOR, EDITOR_STATE, ORIGIN, VIEWER_STATE } from "./fixtures";

/**
 * Editing of the site sheet. Every test works on its OWN sites (code
 * « E2E-… », created through the « Nouveau site » dialog) and never touches
 * the demo sites; the global setup resets the vigie_e2e database.
 */

const unique = (prefix: string) => `E2E-${prefix}-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1e4)}`;
const nbsp = (s: string | null) => (s ?? "").replace(/[  ]/g, " ");

/** Creates a site through the dialog and returns its id (the sheet is open). */
async function createSite(page: Page, code: string, extra: Record<string, string> = {}): Promise<string> {
  await page.goto("/sites");
  await page.getByRole("button", { name: "Nouveau site" }).click();
  const dialog = page.getByRole("dialog", { name: "Nouveau site" });
  await dialog.getByLabel("Code entrepôt (obligatoire)").fill(code);
  await dialog.getByLabel("Nom (obligatoire)").fill(extra.name ?? `Site ${code}`);
  for (const [label, value] of Object.entries(extra)) if (label !== "name") await dialog.getByLabel(label).fill(value);
  await dialog.getByRole("button", { name: "Créer le site" }).click();
  await page.waitForURL(/\/sites\/[A-Za-z0-9_-]+$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(extra.name ?? `Site ${code}`, { timeout: 20_000 });
  return page.url().split("/sites/")[1]!;
}

/** A notification with this text is shown (several may be visible at once). */
async function expectToast(page: Page, text: string) {
  await expect(page.locator('[data-slot="toast"]').filter({ hasText: text }).first()).toBeVisible();
}

async function index(page: Page): Promise<SiteIndexEntry[]> {
  return ((await (await page.request.get("/api/sites/index")).json()) as { entries: SiteIndexEntry[] }).entries;
}

async function openSection(page: Page, siteId: string, tab: string, section: string) {
  await page.goto(`/sites/${siteId}?tab=${tab}`);
  await page.waitForLoadState("networkidle");
  const block = page.locator(`[data-section="${section}"]`).first();
  await block.getByRole("button", { name: /^Modifier/ }).click();
  await expect(block.locator('[data-slot="section-form"]')).toBeVisible();
  return block;
}

async function contextFor(browser: Browser, state: string) {
  const context = await browser.newContext({ storageState: state, viewport: { width: 1440, height: 900 } });
  return { context, page: await context.newPage() };
}

test.describe("édition — éditeur", () => {
  test.use({ storageState: EDITOR_STATE });

  test("« Nouveau site » : le site apparaît dans /sites et dans la recherche Ctrl+K", async ({ page }) => {
    const code = unique("NEW");
    await createSite(page, code, { name: `Entrepôt ${code}`, "Ville": "Rennes", "Département": "35" });
    await expect(page.locator('[data-slot="site-code"]')).toHaveText(code);
    await page.goto(`/sites?q=${code}`);
    await expect(page.locator(`[data-slot="sites-table"] tbody tr[data-code="${code}"]`)).toBeVisible();
    await page.keyboard.press("Control+K");
    const dialog = page.getByRole("dialog", { name: "Recherche" });
    await dialog.getByRole("combobox").fill(code.toLowerCase());
    await expect(dialog.getByRole("option").filter({ hasText: code })).toBeVisible();
  });

  test("modifier une surface « 12 500,5 » : valeur formatée, provenance « Saisie par… », historique avec motif", async ({ page }) => {
    const siteId = await createSite(page, unique("SURF"));
    const block = await openSection(page, siteId, "technical", "technical_surfaces");
    await block.getByLabel("Entrepôt sec", { exact: false }).first().fill("12 500,5");
    await block.getByLabel("Motif de la modification (facultatif)").fill("Relevé du géomètre 2026");
    await block.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expectToast(page, "1 modification enregistrée");
    const value = page.locator('[data-section="technical_surfaces"] [data-field="SiteTechnical.dryArea"] [data-slot="provenance"]');
    await expect(value).toBeVisible();
    expect(nbsp(await value.textContent())).toContain("12 500,5 m²");
    await value.hover();
    await expect(page.getByRole("tooltip")).toContainText(`Saisie par ${EDITOR.name}`);
    await page.locator('[data-slot="tooltip-content"] [data-slot="history-link"]').click();
    const panel = page.getByRole("dialog", { name: /^Historique — Entrepôt sec/ });
    await expect(panel).toBeVisible();
    const first = panel.locator("li").first();
    expect(nbsp(await first.locator('[data-slot="history-change"]').innerText()).replace(/\s+/g, " ").trim()).toMatch(/^— →( devient)? 12 500,5 m²$/);
    await expect(first).toContainText(`Saisie par ${EDITOR.name}`);
    await expect(first).toContainText("Motif : Relevé du géomètre 2026");
  });

  test("erreur de validation en français, focus sur le champ ; annuler un formulaire modifié demande confirmation", async ({ page }) => {
    const siteId = await createSite(page, unique("VALID"));
    const block = await openSection(page, siteId, "technical", "technical_surfaces");
    const input = block.getByLabel("Terrain", { exact: false }).first();
    await input.fill("douze mille");
    await block.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expect(block.locator('[data-slot="field-error"]').first()).toHaveText("Nombre invalide (exemple : 12 345,67).");
    await expect(block.getByRole("alert").first()).toContainText("Terrain");
    await expect(input).toBeFocused();
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(input).toHaveAttribute("aria-describedby", /error/);

    let asked = "";
    page.once("dialog", async (d) => {
      asked = d.message();
      await d.dismiss();
    });
    await block.getByRole("button", { name: "Annuler", exact: true }).click();
    expect(asked).toBe("Des modifications ne sont pas enregistrées. Les abandonner ?");
    await expect(block.locator('[data-slot="section-form"]')).toBeVisible(); // still editing
    page.once("dialog", (d) => d.accept());
    await page.keyboard.press("Escape");
    await expect(block.locator('[data-slot="section-form"]')).toHaveCount(0);
  });

  test("modifier une valeur annuelle puis ajouter une année", async ({ page }) => {
    const siteId = await createSite(page, unique("METRIC"));
    await page.goto(`/sites/${siteId}?tab=energy`);
    const panel = page.getByRole("tabpanel", { name: "Énergie" });
    await panel.getByRole("button", { name: "Modifier les valeurs" }).click();
    await panel.getByLabel("Ajouter une année").fill("2025");
    await panel.getByRole("button", { name: "Ajouter la colonne" }).click();
    await panel.getByLabel("Consommation d'électricité 2025 (kWh)").fill("1 250 000");
    await panel.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expectToast(page, "1 modification enregistrée");
    await expect(panel.locator('[data-metric="ELECTRICITY"] td[data-year="2025"]')).toContainText("1 250 MWh");

    await panel.getByRole("button", { name: "Modifier les valeurs" }).click();
    await panel.getByLabel("Consommation d'électricité 2025 (kWh)").fill("1 300 000");
    await panel.getByLabel("Ajouter une année").fill("2026");
    await panel.getByRole("button", { name: "Ajouter la colonne" }).click();
    await panel.getByLabel("Consommation de gaz 2026 (kWh)").fill("400 000");
    await page.keyboard.press("Control+Enter");
    await expectToast(page, "2 modifications enregistrées");
    await expect(panel.locator('[data-metric="GAS"] td[data-year="2026"]')).toContainText("400 MWh");
  });

  test("ajouter une rubrique ICPE", async ({ page }) => {
    const siteId = await createSite(page, unique("ICPE"));
    await page.goto(`/sites/${siteId}?tab=icpe`);
    const list = page.locator('[data-slot="list-editor"][data-kind="icpeHeading"]');
    await list.getByRole("button", { name: "Ajouter rubrique" }).click();
    await list.getByLabel("Rubrique").fill("15100");
    await list.getByRole("button", { name: "Enregistrer" }).click();
    await expect(list.getByText("Code de rubrique à 4 chiffres attendu (exemple : 1510).")).toBeVisible();
    await list.getByLabel("Rubrique").fill("1510");
    await list.getByLabel("Régime").selectOption("A");
    await list.getByLabel("Libellé").fill("Entrepôts couverts");
    await list.getByRole("button", { name: "Enregistrer" }).click();
    await expect(list.locator("tbody tr")).toHaveCount(1);
    await expect(list.locator("tbody tr").first()).toContainText("1510");
    await expect(list.locator("tbody tr").first()).toContainText("Autorisation");
  });

  test("ajouter un PDF, le télécharger, puis le supprimer", async ({ page }) => {
    const siteId = await createSite(page, unique("DOC"));
    await page.goto(`/sites/${siteId}?tab=documents`);
    await page.waitForLoadState("networkidle"); // hydrated: the file input listens
    const uploader = page.locator('[data-slot="document-uploader"]');
    const pdf = Buffer.from("%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n");
    // « networkidle » does not guarantee hydration under load: choose the file
    // again until the uploader reacts (its form appears).
    await expect(async () => {
      await uploader.locator('input[type="file"]').setInputFiles({ name: "Bail signé 2026.pdf", mimeType: "application/pdf", buffer: pdf });
      await expect(uploader.getByLabel("Catégorie")).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
    await uploader.getByLabel("Catégorie").selectOption("LEASE");
    await uploader.getByRole("button", { name: "Envoyer" }).click();
    const item = page.locator('[data-slot="documents"][data-category="LEASE"] li').first();
    await expect(item).toContainText("Bail signé 2026.pdf");
    const href = await item.getByRole("link", { name: /Télécharger/ }).getAttribute("href");
    const download = await page.request.get(href!);
    expect(download.status()).toBe(200);
    expect(Buffer.from(await download.body())).toEqual(pdf);

    // An image renamed .pdf is refused, in French.
    await uploader.locator('input[type="file"]').setInputFiles({ name: "photo.pdf", mimeType: "application/pdf", buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) });
    await uploader.getByLabel("Catégorie").selectOption("OTHER");
    await uploader.getByRole("button", { name: "Envoyer" }).click();
    await expect(uploader.getByRole("alert")).toContainText("Le contenu du fichier ne correspond pas à son extension");

    await item.getByRole("button", { name: /Supprimer/ }).click();
    const confirm = page.getByRole("dialog", { name: "Supprimer le document ?" });
    await confirm.getByLabel("Motif (facultatif)").fill("Doublon");
    await confirm.getByRole("button", { name: "Supprimer" }).click();
    await expect(page.locator('[data-slot="documents"][data-category="LEASE"]')).toHaveCount(0);
    expect((await page.request.get(href!)).status()).toBe(404);
  });
});

test.describe("conflits", () => {
  test("même champ dans deux navigateurs : dialogue de conflit, puis « Remplacer par la mienne » ; champs différents : les deux passent", async ({ browser }) => {
    test.setTimeout(90_000);
    const a = await contextFor(browser, EDITOR_STATE);
    const b = await contextFor(browser, ADMIN_STATE);
    try {
      const siteId = await createSite(a.page, unique("CONFLICT"));
      const blockA = await openSection(a.page, siteId, "technical", "technical_surfaces");
      const blockB = await openSection(b.page, siteId, "technical", "technical_surfaces");
      await blockA.getByLabel("Terrain", { exact: false }).first().fill("50 000");
      await blockA.getByLabel("Motif de la modification (facultatif)").fill("Plan cadastral");
      await blockA.getByRole("button", { name: "Enregistrer", exact: true }).click();
      await expectToast(a.page, "1 modification enregistrée");

      await blockB.getByLabel("Terrain", { exact: false }).first().fill("60 000");
      await blockB.getByRole("button", { name: "Enregistrer", exact: true }).click();
      const dialog = b.page.getByRole("dialog", { name: "Modifications concurrentes" });
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText(`modifiée par ${EDITOR.name}`);
      await expect(dialog).toContainText("Motif : Plan cadastral");
      expect(nbsp(await dialog.textContent())).toContain("50 000 m²");
      await dialog.getByRole("button", { name: "Remplacer par la mienne" }).click();
      await expectToast(b.page, "1 modification enregistrée");
      await expect(b.page.locator('[data-field="SiteTechnical.landArea"] [data-slot="provenance"]')).toContainText(/60\s000/);

      // Different fields, forms opened at the same state: both saves succeed.
      const a2 = await openSection(a.page, siteId, "technical", "technical_surfaces");
      const b2 = await openSection(b.page, siteId, "technical", "technical_surfaces");
      await a2.getByLabel("Emballage", { exact: false }).first().fill("1 200");
      await b2.getByLabel("Poste de garde", { exact: false }).first().fill("30");
      await a2.getByRole("button", { name: "Enregistrer", exact: true }).click();
      await expectToast(a.page, "1 modification enregistrée");
      await b2.getByRole("button", { name: "Enregistrer", exact: true }).click();
      await expectToast(b.page, "1 modification enregistrée");
      await b.page.reload();
      await expect(b.page.locator('[data-field="SiteTechnical.packagingArea"] [data-slot="provenance"]')).toContainText(/1\s200/);
      await expect(b.page.locator('[data-field="SiteTechnical.guardHouseArea"] [data-slot="provenance"]')).toContainText("30");
    } finally {
      await a.context.close();
      await b.context.close();
    }
  });
});

test.describe("archivage — administrateur", () => {
  test("l'admin archive un site : il disparaît de la carte et de la liste, puis le désarchive", async ({ page }) => {
    test.setTimeout(120_000); // the map (software WebGL) is loaded in the middle
    const code = unique("ARCH");
    const siteId = await createSite(page, code, { "Latitude (facultative)": "48,85", "Longitude (facultative)": "2,35" });
    expect((await index(page)).some((e) => e.code === code && e.lat !== null)).toBe(true);

    await page.getByRole("button", { name: "Plus d'actions" }).click();
    await page.getByRole("menuitem", { name: "Archiver le site" }).click();
    const dialog = page.getByRole("dialog", { name: "Archiver le site ?" });
    await dialog.getByRole("button", { name: "Archiver" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Motif obligatoire pour archiver un site.");
    await dialog.getByLabel("Motif (obligatoire)").fill("Fermeture du site");
    await dialog.getByRole("button", { name: "Archiver" }).click();
    await expect(page.locator('[data-slot="archived-banner"]')).toBeVisible();
    expect((await index(page)).some((e) => e.code === code)).toBe(false);

    // Map: no longer among the sites of the list panel.
    await page.goto(`/?q=${code}`);
    await page.waitForFunction(() => window.__vigieMap?.ready === true, null, { timeout: 60_000 });
    await expect(page.locator('[data-slot="no-result"]')).toBeVisible();

    // Archived list, then restore from the banner.
    await page.goto("/sites?archived=1");
    await expect(page.locator(`[data-slot="archived-sites"] tr[data-code="${code}"]`)).toBeVisible();
    await page.goto(`/sites/${siteId}`);
    await page.locator('[data-slot="archived-banner"]').getByRole("button", { name: "Désarchiver" }).click();
    await page.getByRole("dialog", { name: "Désarchiver le site ?" }).getByRole("button", { name: "Désarchiver" }).click();
    await expect(page.locator('[data-slot="archived-banner"]')).toHaveCount(0);
    expect((await index(page)).some((e) => e.code === code)).toBe(true);
  });
});

test.describe("édition — lecteur", () => {
  test.use({ storageState: VIEWER_STATE });

  test("aucun bouton « Modifier », ni ajout de document, ni nouveau site ; aucune requête hors de l'origine", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (r) => requests.push(r.url()));
    await page.goto("/sites");
    await expect(page.getByRole("button", { name: "Nouveau site" })).toHaveCount(0);
    const entry = (await index(page))[0]!;
    await page.goto(`/sites/${entry.id}`);
    for (const tab of ["Vue d'ensemble", "Bail", "Exploitation", "Financier", "Énergie", "Technique", "ICPE et risques", "Documents"]) {
      await page.getByRole("tab", { name: tab }).click();
      const panel = page.getByRole("tabpanel", { name: tab });
      await expect(panel.getByRole("button", { name: /^Modifier/ })).toHaveCount(0);
      await expect(panel.getByRole("button", { name: /^Ajouter/ })).toHaveCount(0);
    }
    await expect(page.getByRole("button", { name: "Plus d'actions" })).toHaveCount(0);
    await page.waitForLoadState("networkidle");
    expect(requests.filter((u) => !u.startsWith(`${ORIGIN}/`) && !u.startsWith("data:") && !u.startsWith("blob:"))).toEqual([]);
  });
});
