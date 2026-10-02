import { expect, test } from "@playwright/test";
import { ORIGIN, VIEWER_STATE } from "./fixtures";

test.describe("carte hors ligne", () => {
  test.use({ storageState: VIEWER_STATE });

  test("/api/map-assets/status répond une fois connecté, sans requête externe", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (r) => requests.push(r.url()));
    await page.goto("/");
    const status = await page.evaluate(async () => {
      const response = await fetch("/api/map-assets/status");
      return { code: response.status, cache: response.headers.get("cache-control"), body: (await response.json()) as { installed: unknown; manifest: unknown } };
    });
    expect(status.code).toBe(200);
    expect(status.cache).toBe("no-store");
    expect(typeof status.body.installed).toBe("boolean");
    if (status.body.installed) expect(status.body.manifest).toMatchObject({ name: expect.stringMatching(/^vigie-offline-bundle-\d{8}$/) });
    else expect(status.body.manifest).toBeNull();
    await page.waitForLoadState("networkidle");
    expect(requests.filter((url) => !url.startsWith(`${ORIGIN}/`) && !url.startsWith("data:") && !url.startsWith("blob:"))).toEqual([]);
  });
});

test.describe("sans session", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("/api/map-assets refuse l'accès (401 JSON)", async ({ request }) => {
    for (const path of ["/api/map-assets/status", "/api/map-assets/france.pmtiles"]) {
      const response = await request.get(path);
      expect(response.status()).toBe(401);
      expect(await response.json()).toEqual({ error: "Authentification requise." });
    }
  });
});
