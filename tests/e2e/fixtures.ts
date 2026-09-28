/** Shared constants of the end-to-end suite. */
export const ORIGIN = "http://localhost:3000";
export const E2E_PASSWORD = "Phrase de passe e2e Vigie 2026";
export const ADMIN = { email: "e2e-admin@vigie.local", name: "Admin E2E", role: "admin" } as const;
export const VIEWER = { email: "e2e-viewer@vigie.local", name: "Lecteur E2E", role: "viewer" } as const;
export const ADMIN_STATE = "tests/e2e/.auth/admin.json";
export const VIEWER_STATE = "tests/e2e/.auth/viewer.json";
