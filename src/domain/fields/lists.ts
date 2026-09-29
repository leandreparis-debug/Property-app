/**
 * Validation of the editable lists of a site (ICPE headings, building works,
 * external ids), shared by the forms and the Server Actions.
 */
import { z } from "zod";
import { parseDate } from "@/server/import/parsers";
import { BuildingWorkKind, ExternalSystem, IcpeRegime } from "../enums";

const trimmed = (max: number, label: string) =>
  z
    .string()
    .max(max * 4)
    .transform((v) => v.replace(/\s+/g, " ").trim())
    .refine((v) => [...v].length <= max, { error: `${label} : ${max} caractères au maximum.` });

const optionalText = (max: number, label: string) => trimmed(max, label).transform((v) => (v === "" ? null : v));

/** ICPE heading: 4-digit code, regime from the enumeration, optional label. */
export const icpeHeadingSchema = z.object({
  code: z
    .string()
    .transform((v) => v.trim())
    .refine((v) => /^\d{4}$/.test(v), { error: "Code de rubrique à 4 chiffres attendu (exemple : 1510)." }),
  regime: z.enum(IcpeRegime.values, { error: "Régime inconnu." }),
  label: optionalText(500, "Libellé"),
});

/** Building work: kind, date with its precision (optional), description. */
export const buildingWorkSchema = z.object({
  kind: z.enum(BuildingWorkKind.values, { error: "Type de travaux inconnu." }),
  date: z.object({ date: z.string(), precision: z.string() }).transform((v, ctx) => {
    if (v.date.trim() === "") return { date: null, precision: null };
    if (!["day", "month", "year"].includes(v.precision)) {
      ctx.addIssue({ code: "custom", message: "Précision inconnue." });
      return z.NEVER;
    }
    const parsed = parseDate(v.date.trim()).value;
    if (!parsed) {
      ctx.addIssue({ code: "custom", message: "Date invalide." });
      return z.NEVER;
    }
    const d = parsed.date;
    const date = v.precision === "year" ? new Date(Date.UTC(d.getUTCFullYear(), 0, 1)) : v.precision === "month" ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)) : d;
    return { date, precision: v.precision as "day" | "month" | "year" };
  }),
  description: optionalText(2000, "Description"),
});

/** External id: system from the enumeration, value (unique per system across sites). */
export const externalIdSchema = z.object({
  system: z.enum(ExternalSystem.values, { error: "Système inconnu." }),
  value: trimmed(100, "Identifiant").refine((v) => v !== "", { error: "Identifiant obligatoire." }),
});

/** Schema of each list. */
export const LIST_SCHEMAS = { icpeHeading: icpeHeadingSchema, buildingWork: buildingWorkSchema, externalId: externalIdSchema } as const;

/** An editable list. */
export type ListKind = keyof typeof LIST_SCHEMAS;
