import { expect, test, type Page } from "@playwright/test";
import type { SiteIndexEntry } from "../../src/domain/site-index";
import { ORIGIN, VIEWER_STATE } from "./fixtures";

async function index(page: Page): Promise<SiteIndexEntry[]> {
  const response = await page.request.get("/api/sites/index");
  expect(response.status()).toBe(200);
  return ((await response.json()) as { entries: SiteIndexEntry[] }).entries;
}

const nbsp = (s: string | null) => (s ?? "").replace(/[  ]/g, " ");
const surface = (m2: number) => `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(m2)} m²`.replace(/[  ]/g, " ");

test.describe("fiche entrepôt", () => {
  test("/sites → clic sur une ligne → fiche avec le bon nom et le bon code", async ({ page }) => {
    await page.goto("/sites");
    const row = page.locator('[data-slot="sites-table"] tbody tr').first();
    const code = await row.getAttribute("data-code");
    const entry = (await index(page)).find((e) => e.code === code)!;
    await row.click();
    await expect(page).toHaveURL(`${ORIGIN}/sites/${entry.id}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(entry.name);
    await expect(page.locator('[data-slot="site-code"]')).toHaveText(entry.code);
    await expect(page.getByRole("navigation", { name: "Fil d'Ariane" })).toContainText(`Sites›${entry.name}`);
  });

  test("onglet dans ?tab=, conservé au rechargement ; clavier dans les onglets", async ({ page }) => {
    await page.goto("/sites");
    const entry = (await index(page))[0]!;
    await page.goto(`/sites/${entry.id}`);
    const tabs = page.getByRole("tablist", { name: "Sections de la fiche" });
    await tabs.getByRole("tab", { name: "Financier" }).click();
    await expect(page).toHaveURL(/[?&]tab=finance/);
    await expect(page.getByRole("tabpanel", { name: "Financier" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("tab", { name: "Financier" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel", { name: "Financier" })).toBeVisible();

    await page.getByRole("tab", { name: "Financier" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Énergie" })).toBeFocused();
    await expect(page).toHaveURL(/[?&]tab=energy/);
    await page.keyboard.press("End");
    await expect(page.getByRole("tab", { name: "Documents" })).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Home");
    await expect(page.getByRole("tab", { name: "Vue d'ensemble" })).toHaveAttribute("aria-selected", "true");
    await expect(page).not.toHaveURL(/tab=/);

    await page.goto(`/sites/${entry.id}?tab=inconnu`);
    await expect(page.getByRole("tab", { name: "Vue d'ensemble" })).toHaveAttribute("aria-selected", "true");
  });

  test("surface et loyer formatés ; infobulle de provenance « Import du tableur »", async ({ page }) => {
    await page.goto("/sites");
    // A site written by the spreadsheet import (the DEMO sites come from the demo seed: « Système »).
    const entries = await index(page);
    const entry = entries.find((e) => e.totalArea !== null && e.code.startsWith("SMP-"));
    test.skip(!entry, "Aucun site importé du tableur dans la base");
    await page.goto(`/sites/${entry!.id}`);
    expect(nbsp(await page.locator('[data-kpi="area"] dd').first().textContent())).toBe(surface(entry!.totalArea!));
    await expect(page.locator('[data-kpi="rent"] dd').first()).toHaveText(/^(\d{1,3}([\u202f\u00a0 ]\d{3})*[\u202f\u00a0 ]€|—)$/);

    const code = page.locator('[data-field="Site.code"] [data-slot="provenance"]');
    await code.hover();
    await expect(page.getByRole("tooltip")).toContainText(/^Import du tableur — \d{1,2} \S+ \d{4}$/);
    await page.mouse.move(0, 0);
    await code.focus();
    await expect(page.getByRole("tooltip")).toContainText("Import du tableur");
  });

  test("un champ manquant attendu est listé", async ({ page }) => {
    await page.goto("/sites");
    const entries = await index(page);
    const noArea = entries.find((e) => e.totalArea === null);
    const target = noArea ?? entries.find((e) => e.completeness < 100)!;
    await page.goto(`/sites/${target.id}`);
    const missing = page.locator('[data-slot="missing-fields"]');
    if (noArea) {
      await expect(missing.locator('[data-missing="referenceArea"]')).toContainText("Surface de référence");
      await expect(missing.locator('[data-missing="referenceArea"]')).toContainText("Tableur : ENTREPOTS TOTAL (RELEVE DE GEOMETRE), SURFACE ENTREPOT TOTAL");
    } else {
      expect(await missing.locator("[data-missing]").count()).toBeGreaterThan(0);
    }
  });

  test.describe("liens et chemins", () => {
    test.use({ permissions: ["clipboard-read", "clipboard-write"] });

    test("lien externe avec rel ; « Copier » d'un chemin réseau", async ({ page }) => {
      await page.goto("/sites");
      const entry = (await index(page)).find((e) => e.code === "SMP-001");
      test.skip(!entry, "Jeu de démonstration sans SMP-001");
      await page.goto(`/sites/${entry!.id}?tab=documents`);
      const panel = page.getByRole("tabpanel", { name: "Documents" });
      const link = panel.locator('[data-field="Lease.documentReference"] a[data-slot="external-link"]');
      await expect(link).toHaveAttribute("href", /^https:\/\//);
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noopener noreferrer");
      await link.hover();
      await expect(page.getByRole("tooltip")).toContainText("Nécessite un accès internet depuis votre poste");
      await expect(panel.locator('a[href^="file:"]')).toHaveCount(0);

      const path = panel.locator('[data-field="SiteTechnical.plansReference"] [data-slot="copyable-path"]');
      const text = (await path.locator("code").textContent())!;
      expect(text.startsWith("\\\\")).toBe(true);
      await path.getByRole("button", { name: /^Copier le chemin/ }).click();
      await expect(path.getByRole("status")).toHaveText("Copié");
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text);
    });
  });

  test("précédent / suivant respecte les filtres et le tri ; raccourcis [ et ]", async ({ page }) => {
    await page.goto("/sites");
    const entries = await index(page);
    // Reference order: the filtered list as /sites shows it.
    await page.goto("/sites?status=ok");
    const codes = await page.locator('[data-slot="sites-table"] tbody tr').evaluateAll((rows) => rows.map((r) => r.getAttribute("data-code")));
    const ok = codes.map((c) => entries.find((e) => e.code === c)!);
    test.skip(ok.length < 3, "Au moins trois sites conformes nécessaires");
    await page.goto(`/sites/${ok[0]!.id}?status=ok`);
    const nav = page.locator('[data-slot="sibling-nav"]');
    await expect(nav.locator('[data-slot="sibling-position"]')).toHaveText(`1 / ${ok.length}`);
    await expect(nav.getByRole("button", { name: "Site précédent" })).toBeDisabled();
    await nav.getByRole("link", { name: "Site suivant" }).click();
    await expect(page).toHaveURL(`${ORIGIN}/sites/${ok[1]!.id}?status=ok`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(ok[1]!.name);
    await page.keyboard.press("]");
    await expect(page).toHaveURL(`${ORIGIN}/sites/${ok[2]!.id}?status=ok`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(ok[2]!.name);
    await page.keyboard.press("[");
    await expect(page).toHaveURL(`${ORIGIN}/sites/${ok[1]!.id}?status=ok`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(ok[1]!.name);

    // Breadcrumb back to the filtered list.
    await page.getByRole("navigation", { name: "Fil d'Ariane" }).getByRole("link", { name: "Sites" }).click();
    await expect(page).toHaveURL(`${ORIGIN}/sites?status=ok`);
  });

  test("identifiant inconnu → 404 « Site introuvable »", async ({ page }) => {
    for (const id of ["cl_inconnu_000000000000000", "..%2Fetc", "x".repeat(40)]) {
      const response = await page.goto(`/sites/${id}`);
      expect(response?.status()).toBe(404);
      await expect(page.getByRole("heading", { name: "Site introuvable" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Retour à la liste des sites" })).toHaveAttribute("href", "/sites");
    }
  });

  test("impression : rail masqué, tous les onglets visibles avec leur titre, statut en texte", async ({ page }) => {
    await page.goto("/sites");
    const entry = (await index(page))[0]!;
    await page.goto(`/sites/${entry.id}`);
    await page.emulateMedia({ media: "print" });
    await expect(page.getByRole("navigation", { name: "Navigation principale" })).toBeHidden();
    await expect(page.locator('[data-slot="command-bar"]')).toBeHidden();
    await expect(page.locator('[data-slot="site-preview"]')).toBeHidden();
    await expect(page.getByRole("tablist")).toBeHidden();
    const panels = page.locator('[role="tabpanel"]');
    await expect(panels).toHaveCount(8);
    for (let i = 0; i < 8; i++) await expect(panels.nth(i)).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Financier" })).toBeVisible();
    await expect(page.locator('[data-slot="print-header"]')).toContainText(`Vigie — Fiche ${entry.name} (${entry.code}) — imprimée le`);
    await expect(page.getByText(/^Statut : /)).toBeVisible();
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(255, 255, 255)");
  });

  test("aucune requête hors de l'origine (aperçu cartographique compris)", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (r) => requests.push(r.url()));
    await page.goto("/sites");
    const entry = (await index(page)).find((e) => e.lat !== null)!;
    await page.goto(`/sites/${entry.id}`);
    await expect(page.locator('[data-slot="site-preview"] canvas')).toBeVisible({ timeout: 30_000 });
    for (const tab of ["Bail", "Financier", "Énergie", "Technique", "ICPE et risques", "Documents"]) await page.getByRole("tab", { name: tab }).click();
    await page.waitForLoadState("networkidle");
    expect(requests.filter((u) => !u.startsWith(`${ORIGIN}/`) && !u.startsWith("data:") && !u.startsWith("blob:"))).toEqual([]);
  });
});

test.describe("fiche entrepôt — lecteur", () => {
  test.use({ storageState: VIEWER_STATE });

  test("un lecteur ne voit pas « Modifier » mais voit « Imprimer »", async ({ page }) => {
    await page.goto("/sites");
    const entry = (await index(page))[0]!;
    await page.goto(`/sites/${entry.id}`);
    await expect(page.getByRole("button", { name: "Imprimer" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Modifier/ })).toHaveCount(0);
  });
});

test.describe("fiche entrepôt — rôle avec droit d'écriture", () => {
  test("« Modifier » est désactivé avec l'infobulle « Disponible prochainement »", async ({ page }) => {
    await page.goto("/sites");
    const entry = (await index(page))[0]!;
    await page.goto(`/sites/${entry.id}`);
    await expect(page.getByRole("button", { name: /Modifier/ })).toBeDisabled();
    await page.locator('[data-slot="edit-disabled"]').hover();
    await expect(page.getByRole("tooltip")).toHaveText("Disponible prochainement");
  });
});
