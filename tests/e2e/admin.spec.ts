import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { E2E_STORAGE_ROOT, e2eEnv } from "./e2e-env";
import { EDITOR_STATE, ORIGIN, VIEWER_STATE } from "./fixtures";

/**
 * Step 11 — administration space. Runs as the e2e admin (storage state of
 * the setup project) unless stated otherwise.
 */

const ADMIN_ROUTES = ["/admin", "/admin/operations", "/admin/users", "/admin/audit", "/admin/imports", "/admin/enrichment"] as const;

/** Applies a small fictitious enrichment bundle on the e2e database (DEMO-001: postal code 69800 → 69804). */
function applyDemoEnrichment(): void {
  const file = join(E2E_STORAGE_ROOT, "enrichment-e2e.json");
  writeFileSync(
    file,
    JSON.stringify({
      formatVersion: 1,
      generatedAt: "2026-10-05T08:00:00.000Z",
      generator: "Vigie-offline-bundle/e2e",
      sites: [
        {
          code: "DEMO-001",
          providers: {
            geocoding: {
              status: "ok",
              fetchedAt: "2026-10-05T08:00:00.000Z",
              data: {},
              proposals: [{ target: "Site.postalCode", value: "69804", confidence: 0.95, evidence: "Fixture e2e" }],
              publicData: {},
            },
          },
        },
      ],
    }),
  );
  execFileSync("pnpm", ["-s", "enrichment:apply", "--file", file, "--actor", "e2e-admin@vigie.local"], { env: { ...process.env, ...e2eEnv() }, stdio: "pipe" });
}

async function confirmDialog(page: Page, button: string) {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: button, exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
}

test.describe.serial("parcours administrateur", () => {
  test("lancer un export nocturne puis le télécharger", async ({ page }) => {
    await page.goto("/admin/operations");
    await expect(page.getByRole("heading", { level: 1, name: "Exploitation" })).toBeVisible();
    // No export yet in the e2e storage: the freshness warning is shown, on the screen and in the navigation.
    await expect(page.locator('[data-slot="export-stale"]')).toBeVisible();
    await expect(page.locator('[data-slot="admin-nav-warning"]')).toHaveText("Export en retard");

    const card = page.locator('[data-slot="job-nightly-export"]');
    await card.getByRole("button", { name: "Lancer maintenant" }).click();
    await confirmDialog(page, "Lancer");
    await expect(card.locator('[data-slot="job-last-status"]')).toContainText("Réussie");
    await expect(page.locator('[data-slot="export-stale"]')).toHaveCount(0);

    const row = page.locator('[data-slot="exports-table"] tbody tr').first();
    const [download] = await Promise.all([page.waitForEvent("download"), row.getByRole("link", { name: "sites.csv" }).click()]);
    expect(download.suggestedFilename()).toMatch(/^vigie-\d{4}-\d{2}-\d{2}T\d{4}_[A-Za-z0-9]{8}-sites\.csv$/);
    const content = readFileSync((await download.path())!, "utf8");
    expect(content.startsWith("﻿Site.code;")).toBe(true);
    expect(content).toContain("DEMO-001");
  });

  test("créer un utilisateur, première connexion avec changement de mot de passe forcé", async ({ page, browser }) => {
    await page.goto("/admin/users");
    await page.getByRole("button", { name: "Nouvel utilisateur" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Adresse email").fill("e2e-nouveau@vigie.local");
    await dialog.getByLabel("Nom").fill("Nouvelle Recrue");
    await dialog.getByLabel("Rôle").selectOption("viewer");
    await dialog.getByRole("button", { name: "Créer le compte" }).click();
    const password = (await page.locator('[data-slot="temporary-password"]').textContent())?.trim() ?? "";
    expect(password).toMatch(/^[A-Za-z2-9]{4}(-[A-Za-z2-9]{4}){3}$/);
    await page.getByRole("button", { name: "J'ai transmis le mot de passe" }).click();
    await expect(page.locator('[data-email="e2e-nouveau@vigie.local"]')).toContainText("Mot de passe temporaire");

    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const newcomer = await context.newPage();
    await newcomer.goto("/login");
    await newcomer.getByLabel("Adresse email").fill("e2e-nouveau@vigie.local");
    await newcomer.getByLabel("Mot de passe", { exact: true }).fill(password);
    await newcomer.getByRole("button", { name: "Se connecter" }).click();
    await expect(newcomer).toHaveURL(`${ORIGIN}/account/password`);
    // Every other page sends back to the password change.
    await newcomer.goto("/sites");
    await expect(newcomer).toHaveURL(`${ORIGIN}/account/password`);
    expect((await newcomer.request.get("/api/sites/index")).status()).toBe(403);

    await newcomer.getByLabel("Mot de passe actuel").fill(password);
    await newcomer.getByLabel("Nouveau mot de passe", { exact: true }).fill("Ma nouvelle phrase de passe 2026");
    await newcomer.getByLabel("Confirmer le nouveau mot de passe").fill("Ma nouvelle phrase de passe 2026");
    await newcomer.getByRole("button", { name: "Changer le mot de passe" }).click();
    await expect(newcomer).toHaveURL(`${ORIGIN}/`);
    await newcomer.goto("/sites");
    await expect(newcomer).toHaveURL(`${ORIGIN}/sites`);
    await context.close();
  });

  test("filtrer le journal d'audit", async ({ page }) => {
    await page.goto("/admin/audit");
    await page.getByLabel("Type d'entité").selectOption("User");
    await page.getByLabel("Action").selectOption("CREATE");
    await page.getByRole("button", { name: "Filtrer" }).click();
    await expect(page).toHaveURL(/entity=User/);
    await expect(page).toHaveURL(/action=CREATE/);
    const rows = page.locator('[data-slot="audit-table"] tbody tr');
    await expect(rows.first()).toContainText("Utilisateur");
    await expect(rows.filter({ hasText: "e2e-nouveau@vigie.local" })).toHaveCount(1);
    // A batch link filters on the batch.
    const batch = rows.first().locator("a[title^='Filtrer sur le lot']");
    if ((await batch.count()) > 0) {
      await batch.click();
      await expect(page).toHaveURL(/batch=/);
    }
  });

  test("activer le verrou d'import", async ({ page }) => {
    await page.goto("/admin/imports");
    await expect(page.locator('[data-slot="imports-table"] tbody tr').first()).toContainText("Import réel");
    await expect(page.locator('[data-slot="import-lock-invite"]')).toBeVisible();
    await page.getByRole("button", { name: "Verrouiller l'import" }).click();
    await page.getByRole("dialog").getByLabel("Motif (facultatif)").fill("Import validé (e2e)");
    await confirmDialog(page, "Verrouiller");
    await expect(page.locator('[data-slot="import-locked-banner"]')).toHaveText("La base est la source de vérité. Ne plus réimporter le tableur.");
    // Back to the initial state for the next runs of the suite.
    await page.getByRole("button", { name: "Déverrouiller l'import" }).click();
    await confirmDialog(page, "Déverrouiller");
    await expect(page.locator('[data-slot="import-locked-banner"]')).toHaveCount(0);
  });

  test("traiter une divergence d'enrichissement", async ({ page }) => {
    applyDemoEnrichment();
    await page.goto("/admin/enrichment");
    const row = page.locator('[data-slot="divergences-table"] tbody tr').filter({ hasText: "DEMO-001" });
    await expect(row.locator('[data-slot="current-value"]')).toHaveText("69800");
    await expect(row.locator('[data-slot="proposed-value"]')).toHaveText("69804");
    await row.getByRole("button", { name: "Conserver" }).click();
    await page.getByRole("dialog").getByLabel("Motif (facultatif)").fill("Adresse vérifiée");
    await confirmDialog(page, "Conserver");
    // « À examiner » by default: the dismissed divergence leaves the list.
    await expect(page.locator('[data-slot="divergences-table"] tbody tr').filter({ hasText: "DEMO-001" })).toHaveCount(0);
    await page.goto("/admin/enrichment?status=dismissed");
    await expect(page.locator('[data-slot="divergences-table"] tbody tr').filter({ hasText: "DEMO-001" })).toContainText("Valeur actuelle conservée");
  });
});

test("aucune requête ne sort de l'origine sur les pages d'administration", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  for (const route of ADMIN_ROUTES) {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
  await page.goto("/account/password");
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.filter((url) => !url.startsWith(`${ORIGIN}/`) && !url.startsWith("data:") && !url.startsWith("blob:"))).toEqual([]);
});

for (const [role, state] of [
  ["éditeur", EDITOR_STATE],
  ["lecteur", VIEWER_STATE],
] as const) {
  test.describe(`${role} : aucun accès à l'administration`, () => {
    test.use({ storageState: state });

    test("403 sur chaque route d'administration, routes API refusées", async ({ page, request }) => {
      for (const route of ADMIN_ROUTES) {
        const response = await page.goto(route);
        expect(response?.status(), route).toBe(403);
        await expect(page.getByRole("heading", { name: "Accès refusé" })).toBeVisible();
      }
      await page.goto("/");
      await expect(page.getByRole("navigation", { name: "Navigation principale" }).getByRole("link", { name: "Administration" })).toHaveCount(0);
      expect((await request.get("/api/exports/audit")).status()).toBe(403);
      expect((await request.get("/api/admin/imports/x/report.csv")).status()).toBe(403);
    });
  });
}

test.describe("lecteur : export de la liste", () => {
  test.use({ storageState: VIEWER_STATE });

  test("exporte la liste filtrée en CSV, en-têtes en français", async ({ page }) => {
    await page.goto("/sites?region=Auvergne-Rh%C3%B4ne-Alpes");
    await page.getByRole("button", { name: "Exporter" }).click();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Fichier CSV (.csv)" }).click()]);
    expect(download.suggestedFilename()).toMatch(/^vigie-sites-\d{4}-\d{2}-\d{2}\.csv$/);
    const csv = readFileSync((await download.path())!, "utf8");
    expect(csv.startsWith("﻿Code entrepôt;")).toBe(true);
    const lines = csv.trim().split("\r\n");
    expect(lines.length).toBeGreaterThan(1);
    expect(csv).not.toContain("Hauts-de-France;");
  });
});
