import "server-only";
import { nightlyExportJob } from "../exports/nightly";
import type { JobDefinition } from "./types";

/**
 * Registry of the operations jobs, in display order. Each job lives in its
 * own module; this list is the only place that names them.
 */
export const JOBS: readonly JobDefinition[] = [nightlyExportJob];

/**
 * A job by name.
 * @param name - Job name.
 * @param jobs - Registry (defaults to {@link JOBS}; injectable for tests).
 */
export function findJob(name: string, jobs: readonly JobDefinition[] = JOBS): JobDefinition | undefined {
  return jobs.find((job) => job.name === name);
}
