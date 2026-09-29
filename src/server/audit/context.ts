import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { AuditSource } from "@/domain/enums";

/** Who is writing, and through which channel. Attached to every audit line. */
export interface AuditContext {
  /** Id of the acting user; `null` for system jobs and anonymous events. */
  actorId: string | null;
  /** Channel of the change. */
  source: AuditSource;
  /** Import or enrichment batch, or one manual save, the change belongs to. */
  batchId?: string | null;
  /** Optional reason given by the user (≤ 500 characters), written on every line. */
  comment?: string | null;
}

/**
 * One storage per PROCESS, not per module instance: Next.js may load this
 * module several times (React Server Components and Server Actions layers,
 * hot reload), while the `db` singleton — and its audit extension — is
 * shared. A module-level instance would then be invisible to the extension.
 */
const STORAGE_KEY = Symbol.for("vigie.audit.context");
const globalStore = globalThis as typeof globalThis & { [STORAGE_KEY]?: AsyncLocalStorage<Readonly<AuditContext>> };
const storage = (globalStore[STORAGE_KEY] ??= new AsyncLocalStorage<Readonly<AuditContext>>());

/**
 * Runs `fn` with an audit context: every audited write performed inside
 * (including in nested async calls) is attributed to this actor and source.
 * Contexts nest: the innermost one wins.
 *
 * The result is awaited INSIDE the context. This matters because Prisma
 * queries are lazy: `runWithAuditContext(ctx, () => db.site.create(…))`
 * returns a PrismaPromise that only executes when awaited.
 *
 * @param context - Actor, source and optional batch.
 * @param fn - Work to run.
 * @returns A promise of the result of `fn`.
 */
export function runWithAuditContext<T>(context: AuditContext, fn: () => T | PromiseLike<T>): Promise<T> {
  return storage.run(Object.freeze({ batchId: null, comment: null, ...context }), async () => await fn());
}

/**
 * The audit context of the current async call chain.
 * @returns The context, or `undefined` outside {@link runWithAuditContext}.
 */
export function getAuditContext(): Readonly<AuditContext> | undefined {
  return storage.getStore();
}
