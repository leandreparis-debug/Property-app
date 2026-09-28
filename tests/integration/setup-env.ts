// Points the application singleton (`db`) at the test database before any
// module under test is imported.
import { testDatabaseUrl } from "./test-db";

process.env.DATABASE_URL = testDatabaseUrl();
