import { expect, test, type Page } from "@playwright/test";
import { ORIGIN } from "./fixtures";

// Every test of this file runs as the e2e admin (storage state from the setup project).

const ROUTES = [
  { label: "Carte", path: "/", heading: "Carte des entrepôts" },
  { label: "Sites", path: "/sites", heading: "Sites" },
  { label: "Supervision", path: "/supervision", heading: "Supervision" },
  { label: "Administration", path: "/admin", heading: "Administration" },
] as const;

function rail(page: Page) {
  return page.getByRole("navigation", { name: "Navigation principale" });
}

/** Collects CSP violations reported in the console. */
function trackCspViolations(page: Page): string[] {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /Content Security Policy/i.test(message.text())) {
      violations.push(message.text());
    }
  });
  return violations;
}

test("la page d'accueil affiche le rail, la barre de commande et la légende", async ({ page }) => {
  const csp = trackCspViolations(page);
  await page.goto("/");

  await expect(rail(page)).toBeVisible();
  await expect(rail(page).getByRole("link")).toHaveCount(4);
  await expect(page.getByRole("button", { name: /Rechercher un site, une ville, un code/ })).toBeVisible();

  const legend = page.getByRole("list", { name: "Légende des statuts de conformité" });
  await expect(legend).toBeVisible();
  await expect(legend.getByRole("listitem")).toHaveText([
    "Critique",
    "À surveiller",
    "Non évalué",
    "Conforme",
  ]);
  await expect(page.getByRole("region", { name: "Carte" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.locator("html")).toHaveClass(/dark/);
  expect(csp).toEqual([]);
});

test("le rail permet de naviguer vers les 4 routes", async ({ page }) => {
  await page.goto("/admin");
  for (const route of ROUTES) {
    const link = rail(page).getByRole("link", { name: route.label, exact: true });
    await link.click();
    await expect(page).toHaveURL(`${ORIGIN}${route.path}`);
    await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeAttached();
    await expect(link).toHaveAttribute("aria-current", "page");
    await expect(rail(page).locator('[aria-current="page"]')).toHaveCount(1);
  }
});

test("Ctrl+K ouvre la palette et Échap la ferme", async ({ page }) => {
  await page.goto("/");
  await expect(rail(page)).toBeVisible();

  await page.keyboard.press("Control+K");
  const dialog = page.getByRole("dialog", { name: "Recherche" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("La recherche sera disponible prochainement.")).toBeVisible();
  await expect(dialog.getByRole("combobox")).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("le rail se parcourt au clavier et le focus est visible", async ({ page }) => {
  await page.goto("/");
  await expect(rail(page)).toBeVisible();

  // First Tab stop: the skip link.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Aller au contenu" })).toBeFocused();

  for (const route of ROUTES) {
    await page.keyboard.press("Tab");
    const link = rail(page).getByRole("link", { name: route.label, exact: true });
    await expect(link).toBeFocused();

    // Polled: `transition-colors` also animates outline-color.
    await expect
      .poll(() =>
        link.evaluate((el) => {
          const style = getComputedStyle(el);
          return `${style.outlineStyle} ${parseFloat(style.outlineWidth) >= 2} ${style.outlineColor}`;
        }),
      )
      .toBe("solid true rgb(110, 139, 255)"); // --color-accent
  }

  // Tooltip follows keyboard focus.
  await expect(page.getByRole("tooltip")).toHaveText("Administration");

  // Next stop: the user menu, at the bottom of the rail.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: /Menu utilisateur/ })).toBeFocused();

  // Then the command bar; Enter opens the palette.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: /Rechercher un site/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Recherche" })).toBeVisible();
});

test("aucune requête réseau ne sort de l'origine de l'application", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  const csp = trackCspViolations(page);

  for (const route of ROUTES) {
    await page.goto(route.path);
    await page.waitForLoadState("networkidle");
  }
  await page.keyboard.press("Control+K");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.waitForLoadState("networkidle");

  expect(requests.length).toBeGreaterThan(0);
  const external = requests.filter(
    (url) => !url.startsWith(`${ORIGIN}/`) && !url.startsWith("data:") && !url.startsWith("blob:"),
  );
  expect(external).toEqual([]);
  expect(csp).toEqual([]);
});

test("la réponse de / porte les en-têtes de sécurité", async ({ request }) => {
  const response = await request.get("/");
  expect(response.status()).toBe(200);
  const headers = response.headers();

  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("same-origin");
  expect(headers["permissions-policy"]).toContain("camera=()");
  expect(headers["permissions-policy"]).toContain("geolocation=()");
  expect(headers["x-powered-by"]).toBeUndefined();

  const csp = headers["content-security-policy"] ?? "";
  expect(csp).toContain("default-src 'self'");
  expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
  expect(csp).toContain("img-src 'self' data: blob:");
  expect(csp).toContain("worker-src 'self' blob:");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  expect(csp).not.toMatch(/https?:\/\//);
});

test("le nonce CSP change à chaque requête et figure sur les scripts", async ({ request }) => {
  const nonceOf = async () => {
    const response = await request.get("/");
    const csp = response.headers()["content-security-policy"] ?? "";
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    const html = await response.text();
    return { nonce, html };
  };
  const first = await nonceOf();
  const second = await nonceOf();
  expect(first.nonce).toBeTruthy();
  expect(first.nonce).not.toBe(second.nonce);
  expect(first.html).toContain(`nonce="${first.nonce}"`);
});

test("/api/health renvoie le statut, la version et l'état de la base", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  const body = await response.json();
  expect(body).toMatchObject({ status: "ok", version: expect.any(String), database: "ok" });
  expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
});

test("/dev/design renvoie 404 en production (même connecté)", async ({ page }) => {
  const response = await page.goto("/dev/design");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page introuvable" })).toBeVisible();
});
