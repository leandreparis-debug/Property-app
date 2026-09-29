import type { UserRole } from "@/domain/enums";

/** Every permission of the application. */
export const ACTIONS = [
  "site:read",
  "export:read",
  "finance:read",
  "site:write",
  "site:archive",
  "equipment:write",
  "document:upload",
  "plan:calibrate",
  "import:run",
  "enrichment:apply",
  "user:manage",
  "audit:read",
  "settings:manage",
] as const;

/** A permission (resource:verb). */
export type Action = (typeof ACTIONS)[number];

const VIEWER: readonly Action[] = ["site:read", "export:read"];
const EDITOR: readonly Action[] = [...VIEWER, "site:write", "equipment:write", "document:upload", "plan:calibrate"];
const ADMIN: readonly Action[] = [...EDITOR, "site:archive", "import:run", "enrichment:apply", "user:manage", "audit:read", "settings:manage"];

/**
 * The single source of truth: role → allowed actions.
 *
 * `finance:read` (lease financial terms, Financial tab, rent and occupancy
 * cost) is granted role by role, on purpose: withdrawing it from a role is
 * removing `"finance:read"` from that role's line.
 */
export const PERMISSIONS: Readonly<Record<UserRole, ReadonlySet<Action>>> = {
  viewer: new Set<Action>([...VIEWER, "finance:read"]),
  editor: new Set<Action>([...EDITOR, "finance:read"]),
  admin: new Set<Action>([...ADMIN, "finance:read"]),
};

/** Raised when the current user lacks a permission. Maps to HTTP 403. */
export class ForbiddenError extends Error {
  readonly action: Action | undefined;
  constructor(action?: Action) {
    super("Accès refusé.");
    this.name = "ForbiddenError";
    this.action = action;
  }
}

/**
 * Whether a role grants an action. Unknown roles grant nothing.
 * @param role - User role (untrusted string accepted).
 * @param action - Permission to check.
 */
export function can(role: UserRole | string | null | undefined, action: Action): boolean {
  if (role !== "admin" && role !== "editor" && role !== "viewer") return false;
  return PERMISSIONS[role].has(action);
}

/**
 * Throws {@link ForbiddenError} unless the role grants the action.
 * @param role - User role.
 * @param action - Permission required.
 */
export function assertCan(role: UserRole | string | null | undefined, action: Action): void {
  if (!can(role, action)) throw new ForbiddenError(action);
}
