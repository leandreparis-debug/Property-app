/**
 * Change planning: compares a {@link SiteDraft} with the current database
 * state and decides every write, applying the preservation rule. Pure
 * function — the dry run reports this plan; the real run hands it to the
 * writer. Both therefore agree exactly.
 */
import type { DatePrecision, ExternalSystem } from "@/domain/enums";
import type { EntityKey } from "./mapping";
import { describeValue } from "./normalize";
import type { ImportIssue, SiteDraft } from "./types";

/** Prisma model of each one-to-one entity. */
export const ENTITY_MODELS: Readonly<Record<EntityKey, string>> = {
  site: "Site",
  lease: "Lease",
  serviceContract: "ServiceContract",
  technical: "SiteTechnical",
  icpe: "SiteIcpe",
  energy: "SiteEnergyProfile",
};

/** French label of each entity, for the report. */
export const ENTITY_LABELS: Readonly<Record<string, string>> = {
  site: "Site",
  lease: "Bail",
  serviceContract: "Contrat de prestation",
  technical: "Technique",
  icpe: "ICPE",
  energy: "Énergie",
  externalId: "Identifiant externe",
  buildingWork: "Travaux",
  icpeHeading: "Rubrique ICPE",
  metric: "Indicateur annuel",
};

/** A site as currently stored. */
export interface ExistingSite {
  id: string;
  code: string;
  fields: Record<string, unknown>;
  oneToOne: Partial<Record<Exclude<EntityKey, "site">, { id: string; fields: Record<string, unknown> }>>;
  externalIds: { id: string; system: string; value: string }[];
  buildingWorks: { id: string; kind: string; date: Date | null; datePrecision: string | null }[];
  icpeHeadings: { id: string; code: string; regime: string | null }[];
  metrics: { id: string; metric: string; year: number; value: unknown; source: string }[];
}

/** Answers « was the last write of this field made by a user or the enrichment? ». */
export interface PreservationIndex {
  /** Field-level: last CREATE/UPDATE touching `field` of the record. */
  isFieldPreserved(model: string, id: string, field: string): boolean;
  /** Record-level: last CREATE/UPDATE of the record, any field. */
  isRecordPreserved(model: string, id: string): boolean;
}

/** A preservation index that preserves nothing (empty database, `--force`). */
export const NO_PRESERVATION: PreservationIndex = {
  isFieldPreserved: () => false,
  isRecordPreserved: () => false,
};

/** Planning context shared by all sites of one run. */
export interface PlanContext {
  force: boolean;
  preservation: PreservationIndex;
  /**
   * Owner (site code) of every external id `SYSTEM|value`, from the database,
   * updated as rows are planned (a value claimed by an earlier row).
   */
  externalOwners: Map<string, string>;
}

/** One planned (or preserved) change, for the report. */
export interface ChangeLine {
  row: number;
  code: string;
  entity: string;
  field: string;
  before: string | null;
  after: string | null;
  action: "création" | "modification" | "suppression" | "préservé";
}

/** Write of a one-to-one entity (or of the site itself). */
export interface EntityWrite {
  entity: EntityKey;
  model: string;
  /** Existing id (update) or null (create). */
  id: string | null;
  data: Record<string, unknown>;
}

/** Everything to write for one site. */
export interface SitePlan {
  row: number;
  code: string;
  sheetModifiedAt: string | null;
  existingId: string | null;
  action: "create" | "update" | "unchanged";
  writes: EntityWrite[];
  externalIds: { create: { system: string; value: string }[]; delete: { id: string }[] };
  buildingWorks: {
    create: { kind: string; date: Date; datePrecision: DatePrecision }[];
    update: { id: string; datePrecision: DatePrecision }[];
    delete: { id: string }[];
  };
  icpeHeadings: { create: { code: string; regime: string }[]; update: { id: string; regime: string }[]; delete: { id: string }[] };
  metrics: {
    create: { metric: string; year: number; value: number }[];
    update: { id: string; value: number; source?: "import" }[];
    delete: { id: string }[];
  };
  changes: ChangeLine[];
  preserved: ChangeLine[];
  issues: ImportIssue[];
}

/**
 * Value equality between the database and the file: Decimal vs number by
 * numeric value, dates by instant, null ≡ undefined.
 */
export function sameValue(stored: unknown, next: unknown): boolean {
  const a = stored ?? null;
  const b = next ?? null;
  if (a === null || b === null) return a === b;
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  if (typeof b === "number") {
    const n = typeof a === "number" ? a : Number(String(a));
    return Number.isFinite(n) && n === b;
  }
  if (typeof a === "object" && typeof (a as { toString(): string }).toString === "function" && typeof b === "string") {
    return String(a) === b;
  }
  return a === b;
}

/**
 * Plans the writes of one site.
 * @param draft - Normalised row.
 * @param existing - Current state, or `null` for a new site.
 * @param context - Preservation rule, external-id owners.
 */
export function planSite(draft: SiteDraft, existing: ExistingSite | null, context: PlanContext): SitePlan {
  const preservation = context.force ? NO_PRESERVATION : context.preservation;
  const plan: SitePlan = {
    row: draft.row,
    code: draft.code,
    sheetModifiedAt: draft.sheetModifiedAt,
    existingId: existing?.id ?? null,
    action: "unchanged",
    writes: [],
    externalIds: { create: [], delete: [] },
    buildingWorks: { create: [], update: [], delete: [] },
    icpeHeadings: { create: [], update: [], delete: [] },
    metrics: { create: [], update: [], delete: [] },
    changes: [],
    preserved: [],
    issues: [],
  };
  const line = (entity: string, field: string, before: unknown, after: unknown, action: ChangeLine["action"]): ChangeLine => ({
    row: draft.row,
    code: draft.code,
    entity: ENTITY_LABELS[entity] ?? entity,
    field,
    before: describeValue(before),
    after: describeValue(after),
    action,
  });

  // ── Site and one-to-one entities ───────────────────────────────────────────
  for (const entity of Object.keys(ENTITY_MODELS) as EntityKey[]) {
    const fields = draft.entities[entity];
    if (fields.size === 0) continue;
    const model = ENTITY_MODELS[entity];
    const stored = entity === "site" ? (existing ? { id: existing.id, fields: existing.fields } : undefined) : existing?.oneToOne[entity];

    if (!stored) {
      const data = Object.fromEntries([...fields].filter(([, v]) => v !== null && v !== undefined));
      if (entity !== "site" && Object.keys(data).length === 0) continue; // nothing to create
      if (entity === "site") data.code = draft.code;
      plan.writes.push({ entity, model, id: null, data });
      for (const [field, value] of Object.entries(data)) plan.changes.push(line(entity, field, null, value, "création"));
      continue;
    }

    const data: Record<string, unknown> = {};
    for (const [field, value] of fields) {
      const before = stored.fields[field];
      if (sameValue(before, value)) continue;
      if (preservation.isFieldPreserved(model, stored.id, field)) {
        plan.preserved.push(line(entity, field, before, value, "préservé"));
        continue;
      }
      data[field] = value;
      plan.changes.push(line(entity, field, before, value, "modification"));
    }
    if (Object.keys(data).length > 0) plan.writes.push({ entity, model, id: stored.id, data });
  }

  // ── External identifiers (several per system allowed) ──────────────────────
  for (const [system, wanted] of draft.externalIds) {
    const current = (existing?.externalIds ?? []).filter((e) => e.system === system);
    for (const value of wanted) {
      if (current.some((e) => e.value.toUpperCase() === value.toUpperCase())) continue;
      const key = `${system}|${value.toUpperCase()}`;
      const owner = context.externalOwners.get(key);
      if (owner !== undefined && owner.toUpperCase() !== draft.code.toUpperCase()) {
        plan.issues.push({
          row: draft.row,
          code: draft.code,
          column: EXTERNAL_COLUMNS[system as ExternalSystem],
          severity: "error",
          kind: "external_id_conflict",
          original: value,
          retained: null,
          message: `Identifiant ${system} « ${value} » déjà rattaché au site « ${owner} » : non importé pour ce site.`,
        });
        continue;
      }
      context.externalOwners.set(key, draft.code);
      plan.externalIds.create.push({ system, value });
      plan.changes.push(line("externalId", system, null, value, "création"));
    }
    for (const row of current) {
      if (wanted.some((v) => v.toUpperCase() === row.value.toUpperCase())) continue;
      if (preservation.isRecordPreserved("SiteExternalId", row.id)) {
        plan.preserved.push(line("externalId", system, row.value, null, "préservé"));
        continue;
      }
      plan.externalIds.delete.push({ id: row.id });
      plan.changes.push(line("externalId", system, row.value, null, "suppression"));
    }
  }

  // ── Building works, synchronised on (kind, date) ───────────────────────────
  for (const [kind, wanted] of draft.buildingWorks) {
    const current = (existing?.buildingWorks ?? []).filter((w) => w.kind === kind);
    for (const work of wanted) {
      const match = current.find((w) => w.date?.getTime() === work.date.getTime());
      if (!match) {
        plan.buildingWorks.create.push({ kind, date: work.date, datePrecision: work.precision });
        plan.changes.push(line("buildingWork", kind, null, work.date, "création"));
      } else if (match.datePrecision !== work.precision) {
        if (preservation.isFieldPreserved("BuildingWork", match.id, "datePrecision")) {
          plan.preserved.push(line("buildingWork", `${kind} (précision)`, match.datePrecision, work.precision, "préservé"));
        } else {
          plan.buildingWorks.update.push({ id: match.id, datePrecision: work.precision });
          plan.changes.push(line("buildingWork", `${kind} (précision)`, match.datePrecision, work.precision, "modification"));
        }
      }
    }
    for (const row of current) {
      if (wanted.some((w) => w.date.getTime() === row.date?.getTime())) continue;
      if (preservation.isRecordPreserved("BuildingWork", row.id)) {
        plan.preserved.push(line("buildingWork", kind, row.date, null, "préservé"));
        continue;
      }
      plan.buildingWorks.delete.push({ id: row.id });
      plan.changes.push(line("buildingWork", kind, row.date, null, "suppression"));
    }
  }

  // ── ICPE headings, synchronised on the code ────────────────────────────────
  if (draft.icpeHeadings !== undefined) {
    const current = existing?.icpeHeadings ?? [];
    for (const heading of draft.icpeHeadings) {
      const match = current.find((h) => h.code === heading.code);
      if (!match) {
        plan.icpeHeadings.create.push({ code: heading.code, regime: heading.regime });
        plan.changes.push(line("icpeHeading", heading.code, null, heading.regime, "création"));
      } else if (match.regime !== heading.regime) {
        if (preservation.isFieldPreserved("IcpeHeading", match.id, "regime")) {
          plan.preserved.push(line("icpeHeading", heading.code, match.regime, heading.regime, "préservé"));
        } else {
          plan.icpeHeadings.update.push({ id: match.id, regime: heading.regime });
          plan.changes.push(line("icpeHeading", heading.code, match.regime, heading.regime, "modification"));
        }
      }
    }
    for (const row of current) {
      if (draft.icpeHeadings.some((h) => h.code === row.code)) continue;
      if (preservation.isRecordPreserved("IcpeHeading", row.id)) {
        plan.preserved.push(line("icpeHeading", row.code, row.regime, null, "préservé"));
        continue;
      }
      plan.icpeHeadings.delete.push({ id: row.id });
      plan.changes.push(line("icpeHeading", row.code, row.regime, null, "suppression"));
    }
  }

  // ── Yearly metrics (rows of source manual/enrichment are preserved) ────────
  for (const metric of draft.metrics.values()) {
    const current = existing?.metrics.find((m) => m.metric === metric.metric && m.year === metric.year);
    const label = `${metric.metric} ${metric.year}`;
    if (!current) {
      if (metric.value === null) continue;
      plan.metrics.create.push({ metric: metric.metric, year: metric.year, value: metric.value });
      plan.changes.push(line("metric", label, null, metric.value, "création"));
      continue;
    }
    if (sameValue(current.value, metric.value)) continue;
    const protectedRow = current.source === "manual" || current.source === "enrichment";
    if (protectedRow && !context.force) {
      plan.preserved.push(line("metric", label, current.value, metric.value, "préservé"));
      continue;
    }
    if (metric.value === null) {
      plan.metrics.delete.push({ id: current.id });
      plan.changes.push(line("metric", label, current.value, null, "suppression"));
    } else {
      plan.metrics.update.push({ id: current.id, value: metric.value, ...(protectedRow ? { source: "import" as const } : {}) });
      plan.changes.push(line("metric", label, current.value, metric.value, "modification"));
    }
  }

  plan.action = !existing ? "create" : plan.changes.length > 0 ? "update" : "unchanged";
  return plan;
}

/** Column holding each external id system (report). */
const EXTERNAL_COLUMNS: Readonly<Record<ExternalSystem, string>> = {
  QLIK_SENSE: "CLES QLICKSENS",
  AL_CODE: "CODE AL",
  RAMSES: "RAMSES",
};

