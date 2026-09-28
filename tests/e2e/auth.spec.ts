import { expect, test, type Page } from "@playwright/test";
import { ADMIN, E2E_PASSWORD, ORIGIN, VIEWER, VIEWER_STATE } from "./fixtures";

const noSession = { cookies: [], origins: [] };

async function login(page: Page, email: string, password = E2E_PASSWORD) {
  await page.getByLabel("Adresse email").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
}

test.describe("sans session", () => {
  test.use({ storageState: noSession });

  test("une visite de / redirige vers /login?next=%2F", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(`${ORIGIN}/login?next=%2F`);
    await expect(page.getByRole("heading", { name: "Atlas" })).toBeVisible();
    await expect(page.getByText("Référentiel des entrepôts")).toBeVisible();
    await expect(page.getByLabel("Adresse email")).toBeFocused();
    await expect(page.getByRole("navigation", { name: "Navigation principale" })).toHaveCount(0);
  });

  test("une connexion réussie ramène sur la page demandée", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (r) => requests.push(r.url()));
    await page.goto("/sites?vue=liste");
    await expect(page).toHaveURL(`${ORIGIN}/login?next=%2Fsites%3Fvue%3Dliste`);
    await login(page, ADMIN.email);
    await expect(page).toHaveURL(`${ORIGIN}/sites?vue=liste`);
    await expect(page.getByRole("heading", { level: 1, name: "Sites" })).toBeVisible();
    expect(requests.filter((u) => !u.startsWith(`${ORIGIN}/`) && !u.startsWith("data:"))).toEqual([]);
  });

  test("de mauvais identifiants affichent le message générique", async ({ page }) => {
    await page.goto("/login");
    await login(page, ADMIN.email, "ce n'est pas le bon mot de passe");
    await expect(page.getByRole("alert").filter({ hasText: "Identifiants" })).toHaveText("Identifiants invalides.");
    await login(page, "personne@atlas.local", "peu importe le mot de passe");
    await expect(page.getByRole("alert").filter({ hasText: "Identifiants" })).toHaveText("Identifiants invalides.");
    await expect(page).toHaveURL(/\/login/);
  });

  test("le paramètre next n'accepte pas de redirection externe", async ({ page }) => {
    await page.goto("/login?next=%2F%2Fevil.example");
    await login(page, ADMIN.email);
    await expect(page).toHaveURL(`${ORIGIN}/`);
  });

  test("le mot de passe peut être affiché puis masqué", async ({ page }) => {
    await page.goto("/login");
    const field = page.getByLabel("Mot de passe", { exact: true });
    await field.fill("secret");
    await page.getByRole("button", { name: "Afficher le mot de passe" }).click();
    await expect(field).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Masquer le mot de passe" }).click();
    await expect(field).toHaveAttribute("type", "password");
  });

  test("une route API protégée renvoie 401 sans cookie", async ({ request }) => {
    const response = await request.get("/api/me");
    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({ error: "Authentification requise." });
    expect(response.headers()["location"]).toBeUndefined();
  });

  test("le cookie de session a les attributs attendus et n'est pas lisible en JavaScript", async ({ page, context }) => {
    await page.goto("/login");
    await login(page, ADMIN.email);
    await expect(page).toHaveURL(`${ORIGIN}/`);
    const cookies = await context.cookies();
    expect(cookies).toHaveLength(1);
    const [cookie] = cookies;
    // Production build: COOKIE_SECURE defaults to true → Secure + __Host- prefix.
    expect(cookie).toMatchObject({ name: "__Host-atlas_session", httpOnly: true, secure: true, sameSite: "Lax", path: "/", domain: "localhost" });
    expect(cookie!.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(cookie!.expires).toBeGreaterThan(Date.now() / 1000 + 11 * 3600);
    expect(await page.evaluate(() => document.cookie)).toBe("");

    const me = await page.request.get("/api/me");
    expect(await me.json()).toMatchObject({ email: ADMIN.email, role: "admin", roleLabel: "Administrateur" });
  });

  test("la déconnexion ramène à /login et le bouton précédent ne réaffiche rien de protégé", async ({ page, context }) => {
    await page.goto("/supervision");
    await login(page, ADMIN.email);
    await expect(page.getByRole("heading", { level: 1, name: "Supervision" })).toBeVisible();

    await page.getByRole("button", { name: /Menu utilisateur/ }).click();
    await expect(page.getByRole("menu")).toContainText("admin@atlas.local".replace("admin", "e2e-admin"));
    await expect(page.getByRole("menu")).toContainText("Administrateur");
    await page.getByRole("menuitem", { name: "Se déconnecter" }).click();

    await expect(page).toHaveURL(`${ORIGIN}/login`);
    expect(await context.cookies()).toEqual([]);

    await page.goBack();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "Supervision" })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Navigation principale" })).toHaveCount(0);
    expect((await page.request.get("/api/me")).status()).toBe(401);
  });
});

test.describe("déjà connecté", () => {
  test("/login redirige vers /", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(`${ORIGIN}/`);
  });
});

test.describe("lecteur", () => {
  test.use({ storageState: VIEWER_STATE });

  test("ne voit pas « Administration » et reçoit « Accès refusé » sur /admin", async ({ page }) => {
    await page.goto("/");
    const rail = page.getByRole("navigation", { name: "Navigation principale" });
    await expect(rail.getByRole("link")).toHaveCount(3);
    await expect(rail.getByRole("link", { name: "Administration" })).toHaveCount(0);

    const response = await page.goto("/admin");
    expect(response?.status()).toBe(403);
    await expect(page.getByRole("heading", { name: "Accès refusé" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Administration" })).toHaveCount(0);
  });

  test("le menu utilisateur affiche le rôle en français", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: `Menu utilisateur : ${VIEWER.name}` }).click();
    await expect(page.getByRole("menu")).toContainText("Lecteur");
    await expect(page.getByRole("menu")).toContainText(VIEWER.email);
  });
});
