import "dotenv/config";

/**
 * Connection string of the integration-test database. Derived from
 * DATABASE_URL (same server, database `vigie_test`) unless TEST_DATABASE_URL
 * is set. Refuses any database whose name does not end with `_test`, so the
 * reset in global-setup can never hit the development database.
 */
export function testDatabaseUrl(): string {
  const explicit = process.env.TEST_DATABASE_URL;
  const base = process.env.DATABASE_URL;
  if (!explicit && !base) throw new Error("DATABASE_URL (ou TEST_DATABASE_URL) manquante : voir .env.example.");
  const url = explicit ?? base!.replace(/database=[^;]+/i, "database=vigie_test");
  const name = /database=([^;]+)/i.exec(url)?.[1];
  if (!name?.endsWith("_test")) {
    throw new Error(`Base de test refusée (« ${name ?? "?"} ») : son nom doit se terminer par « _test ».`);
  }
  return url;
}
