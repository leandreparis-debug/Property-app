import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Prisma, PrismaClient } from "../../../generated/prisma/client";
import { getAuditContext, type AuditContext } from "./context";
import { ignoredFieldsFor, isAuditedModel, REDACTED, REDACTED_FIELDS, redactRecord } from "./config";
import { diffRecords, type FieldChange } from "./diff";
import { serializeAuditValue } from "./serialize";

/**
 * Prisma client extension that writes `audit_logs` automatically.
 *
 * Guarantees
 * - Every `create`, `update`, `upsert` and `delete` on an audited model writes
 *   its audit lines IN THE SAME TRANSACTION as the change. Lines are queued
 *   and inserted in batches just before the transaction commits (so audit
 *   rows are not visible to reads made earlier in that same transaction). Outside a
 *   transaction, the extension opens one; inside `client.$transaction(fn)` it
 *   reuses the caller's transaction (tracked with AsyncLocalStorage).
 * - Operations that would escape a per-record audit are refused on audited
 *   models: `createMany`, `createManyAndReturn`, `updateMany`,
 *   `updateManyAndReturn`, `deleteMany`, and nested relation writes.
 * - `audit_logs` is append-only through the client: update/upsert/delete
 *   operations on `AuditLog` throw.
 *
 * Limits: raw SQL (`$executeRaw`) and database-level cascades are not
 * audited per row (see docs/security.md).
 */

/** Error raised when a write is refused or cannot be audited. */
export class AuditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuditError";
  }
}

/** Raised on an audited write outside `runWithAuditContext` (dev and test only). */
export class MissingAuditContextError extends AuditError {
  constructor(model: string, operation: string) {
    super(
      `Écriture ${model}.${operation} hors contexte d'audit : l'envelopper dans runWithAuditContext({ actorId, source }, …).`,
    );
    this.name = "MissingAuditContextError";
  }
}

const AUDITED_WRITES = new Set(["create", "update", "upsert", "delete"]);
const REFUSED_BULK = new Set(["createMany", "createManyAndReturn", "updateMany", "updateManyAndReturn", "deleteMany"]);
const AUDIT_LOG_FORBIDDEN = new Set(["update", "updateMany", "updateManyAndReturn", "upsert", "delete", "deleteMany"]);

/** Relation write operators (scalar update operators such as `increment` are allowed). */
const RELATION_OPERATORS = new Set([
  "create",
  "createMany",
  "connect",
  "connectOrCreate",
  "disconnect",
  "delete",
  "deleteMany",
  "update",
  "updateMany",
  "upsert",
]);

type AnyArgs = Record<string, unknown>;
type DelegateMethod = (args?: unknown) => Promise<unknown>;
type Delegate = Record<"create" | "update" | "delete" | "findUnique" | "findUniqueOrThrow", DelegateMethod> &
  Record<string, DelegateMethod | undefined>;
type TxClient = Prisma.TransactionClient;
type AuditRecord = Record<string, unknown> & { id: unknown };

function delegateOf(client: unknown, model: string): Delegate {
  const key = model.charAt(0).toLowerCase() + model.slice(1);
  const delegate = (client as Record<string, Delegate | undefined>)[key];
  if (!delegate) throw new AuditError(`Modèle Prisma inconnu : ${model}`);
  return delegate;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Throws if `data` contains a nested relation write (e.g. `lease: { create }`,
 * `site: { connect }`). Scalar operators (`{ increment: 1 }`, `{ set: "x" }`)
 * are allowed.
 */
function assertNoNestedWrites(model: string, data: unknown): void {
  if (!isPlainObject(data)) return;
  for (const [field, value] of Object.entries(data)) {
    if (!isPlainObject(value)) continue;
    const keys = Object.keys(value);
    const isRelationWrite =
      keys.some((k) => RELATION_OPERATORS.has(k)) || (keys.includes("set") && Array.isArray(value.set));
    if (isRelationWrite) {
      throw new AuditError(
        `Écriture imbriquée refusée sur ${model}.${field} : écrire chaque modèle séparément (clé étrangère) pour que l'audit trace chaque modification.`,
      );
    }
  }
}

function resolveContext(model: string, operation: string): AuditContext {
  const context = getAuditContext();
  if (context) return context;
  if (process.env.NODE_ENV === "production") {
    console.warn(`[vigie] audit : écriture ${model}.${operation} sans contexte, attribuée à la source « system ».`);
    return { actorId: null, source: "system", batchId: null };
  }
  throw new MissingAuditContextError(model, operation);
}

function shapeOf(args: AnyArgs): AnyArgs | null {
  const shape: AnyArgs = {};
  for (const key of ["select", "include", "omit"] as const) {
    if (args[key] !== undefined) shape[key] = args[key];
  }
  return Object.keys(shape).length > 0 ? shape : null;
}

function siteIdOf(model: string, record: Record<string, unknown>): string | null {
  const value = model === "Site" ? record.id : record.siteId;
  return typeof value === "string" ? value : null;
}

function redactChanges(model: string, changes: FieldChange[]): FieldChange[] {
  const redacted = REDACTED_FIELDS[model];
  if (!redacted) return changes;
  const hidden = serializeAuditValue(REDACTED);
  return changes.map((change) =>
    redacted.has(change.field)
      ? { field: change.field, before: change.before === null ? null : hidden, after: change.after === null ? null : hidden }
      : change,
  );
}

interface AuditLine {
  action: "CREATE" | "UPDATE" | "DELETE";
  model: string;
  record: Record<string, unknown>;
  field?: string | null;
  before?: string | null;
  after?: string | null;
}

/** An audit row waiting to be inserted (flushed at the end of the transaction). */
type PendingAuditRow = {
  occurredAt: Date;
  actorId: string | null;
  action: string;
  source: string;
  entityType: string;
  entityId: string;
  siteId: string | null;
  field: string | null;
  beforeValue: string | null;
  afterValue: string | null;
  batchId: string | null;
  comment: string | null;
};

/** Transaction being audited: its client and the audit rows not yet inserted. */
interface AuditTransaction {
  tx: TxClient;
  pending: PendingAuditRow[];
}

/** Rows per INSERT (12 parameters each; SQL Server allows 2 100 per statement). */
const AUDIT_FLUSH_CHUNK = 150;

/**
 * Queues audit lines on the transaction. They are inserted in batches by
 * {@link flushAuditLines} just before the transaction commits — still in the
 * same transaction, so a rollback discards them too.
 */
function writeAuditLines(store: AuditTransaction, context: AuditContext, lines: AuditLine[]): void {
  const occurredAt = new Date();
  for (const line of lines) {
    store.pending.push({
      occurredAt,
      actorId: context.actorId,
      action: line.action,
      source: context.source,
      entityType: line.model,
      entityId: String(line.record.id),
      siteId: siteIdOf(line.model, line.record),
      field: line.field ?? null,
      beforeValue: line.before ?? null,
      afterValue: line.after ?? null,
      batchId: context.batchId ?? null,
      comment: context.comment ?? null,
    });
  }
}

/** Inserts the queued audit lines of a transaction, in order, in batches. */
async function flushAuditLines(store: AuditTransaction): Promise<void> {
  while (store.pending.length > 0) {
    const chunk = store.pending.splice(0, AUDIT_FLUSH_CHUNK);
    await store.tx.auditLog.createMany({ data: chunk });
  }
}

async function auditedCreate(store: AuditTransaction, model: string, data: unknown, context: AuditContext): Promise<AuditRecord> {
  const record = (await delegateOf(store.tx, model).create({ data })) as AuditRecord;
  writeAuditLines(store, context, [
    { action: "CREATE", model, record, after: serializeAuditValue(redactRecord(model, record)) },
  ]);
  return record;
}

async function auditedUpdate(
  store: AuditTransaction,
  model: string,
  where: unknown,
  data: unknown,
  before: AuditRecord,
  context: AuditContext,
): Promise<AuditRecord> {
  const after = (await delegateOf(store.tx, model).update({ where, data })) as AuditRecord;
  const changes = redactChanges(model, diffRecords(before, after, ignoredFieldsFor(model)));
  writeAuditLines(
    store,
    context,
    changes.map((change) => ({ action: "UPDATE", model, record: after, ...change })),
  );
  return after;
}

async function performAuditedWrite(
  store: AuditTransaction,
  model: string,
  operation: string,
  args: AnyArgs,
  context: AuditContext,
): Promise<unknown> {
  const delegate = delegateOf(store.tx, model);
  const shape = shapeOf(args);
  const reshape = async (record: AuditRecord) =>
    shape ? delegate.findUniqueOrThrow({ where: { id: record.id }, ...shape }) : record;

  switch (operation) {
    case "create":
      return reshape(await auditedCreate(store, model, args.data, context));

    case "update": {
      const before = (await delegate.findUnique({ where: args.where })) as AuditRecord | null;
      // Not found: let Prisma raise its usual « record not found » error.
      if (!before) return delegate.update({ where: args.where, data: args.data });
      return reshape(await auditedUpdate(store, model, args.where, args.data, before, context));
    }

    case "upsert": {
      const before = (await delegate.findUnique({ where: args.where })) as AuditRecord | null;
      const record = before
        ? await auditedUpdate(store, model, args.where, args.update, before, context)
        : await auditedCreate(store, model, args.create, context);
      return reshape(record);
    }

    case "delete": {
      const before = (await delegate.findUnique({ where: args.where })) as AuditRecord | null;
      if (!before) return delegate.delete({ where: args.where });
      const result = shape ? await delegate.findUniqueOrThrow({ where: { id: before.id }, ...shape }) : before;
      await delegate.delete({ where: args.where });
      writeAuditLines(store, context, [
        { action: "DELETE", model, record: before, before: serializeAuditValue(redactRecord(model, before)) },
      ]);
      return result;
    }

    default:
      throw new AuditError(`Opération non auditée : ${model}.${operation}`);
  }
}

/** Options accepted by the interactive form of `$transaction`. */
export interface TransactionOptions {
  maxWait?: number;
  timeout?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
}

/**
 * Wraps a Prisma client with the audit extension.
 *
 * The returned client's `$transaction(fn)` runs `fn` with the audited client
 * itself: every operation inside (audited or not) goes through the same
 * database transaction, together with its audit lines. The array form of
 * `$transaction` is refused (it cannot be audited reliably).
 *
 * @param base - Plain Prisma client (driver adapter already configured).
 * @returns The audited client.
 */
export function withAudit(base: PrismaClient) {
  const transactions = new AsyncLocalStorage<AuditTransaction>();

  const runInTransaction = <R>(fn: (store: AuditTransaction) => Promise<R>, options?: TransactionOptions): Promise<R> => {
    const current = transactions.getStore();
    if (current) return fn(current); // Nested: join the outer transaction (and its pending lines).
    return base.$transaction(async (tx) => {
      const store: AuditTransaction = { tx, pending: [] };
      const result = await transactions.run(store, () => fn(store));
      await flushAuditLines(store); // before commit: same transaction as the changes
      return result;
    }, options);
  };

  const extended = base.$extends({
    name: "vigie-audit",
    client: {
      /**
       * Interactive transaction. `fn` receives the audited client: all its
       * operations, and their audit lines, share one database transaction.
       */
      $transaction<R>(fn: (tx: Prisma.TransactionClient) => Promise<R>, options?: TransactionOptions): Promise<R> {
        if (typeof fn !== "function") {
          throw new AuditError("Forme tableau de $transaction refusée : utiliser $transaction(async (tx) => …).");
        }
        return runInTransaction(() => fn(extended as unknown as Prisma.TransactionClient), options);
      },
    },
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const current = transactions.getStore();

          if (model === "AuditLog" && AUDIT_LOG_FORBIDDEN.has(operation)) {
            throw new AuditError(`Le journal d'audit est en ajout seul : ${operation} interdit sur AuditLog.`);
          }

          if (!isAuditedModel(model) || (!AUDITED_WRITES.has(operation) && !REFUSED_BULK.has(operation))) {
            // Reads and unaudited models: run in the current transaction, if any.
            if (!current) return query(args);
            const method = delegateOf(current.tx, model)[operation];
            if (!method) throw new AuditError(`Opération inconnue : ${model}.${operation}`);
            return method(args);
          }

          if (REFUSED_BULK.has(operation)) {
            throw new AuditError(
              `${model}.${operation} refusé : les opérations en masse échappent à l'audit ligne à ligne. Écrire enregistrement par enregistrement.`,
            );
          }

          const input = (args ?? {}) as AnyArgs;
          if (operation === "upsert") {
            assertNoNestedWrites(model, input.create);
            assertNoNestedWrites(model, input.update);
          } else {
            assertNoNestedWrites(model, input.data);
          }
          const context = resolveContext(model, operation);
          return runInTransaction((store) => performAuditedWrite(store, model, operation, input, context));
        },
      },
    },
  });

  return extended;
}

/** Prisma client with the audit extension. */
export type AuditedPrismaClient = ReturnType<typeof withAudit>;
