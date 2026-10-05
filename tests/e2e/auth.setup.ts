import { expect, test as setup } from "@playwright/test";
import { ADMIN, ADMIN_STATE, E2E_PASSWORD, EDITOR, EDITOR_STATE, VIEWER, VIEWER_STATE } from "./fixtures";

/** Logs in once per role and saves the session (storage state) for the suites. */
for (const [user, file] of [
  [ADMIN, ADMIN_STATE],
  [VIEWER, VIEWER_STATE],
  [EDITOR, EDITOR_STATE],
] as const) {
  setup(`session ${user.role}`, async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Adresse email").fill(user.email);
    await page.getByLabel("Mot de passe", { exact: true }).fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL("/");
    await page.context().storageState({ path: file });
  });
}
