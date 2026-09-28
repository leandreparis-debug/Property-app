// Points the application singleton (`db`) at the test database before any
// module under test is imported.
import { testDatabaseUrl } from "./test-db";

process.env.DATABASE_URL = testDatabaseUrl();

// Import reports of the tests go to a temporary folder, not ./storage.
process.env.STORAGE_ROOT = `${process.env.TMPDIR ?? "/tmp"}/atlas-test-storage`;
