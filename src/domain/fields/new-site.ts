/**
 * Validation of the « Nouveau site » dialog, shared by the form and the
 * server: code (upper case, `A-Z 0-9 -`), name, and the location fields of the
 * registry (address, postal code, city, department, optional coordinates).
 */
import { z } from "zod";
import { buildSectionSchema, crossFieldRules } from "./validation";

/** Allowed characters of a warehouse code. */
export const SITE_CODE_PATTERN = /^[A-Z0-9-]{1,50}$/;

/** Code: trimmed, upper case, `A-Z 0-9 -`, 50 characters at most. */
export const siteCodeSchema = z
  .string()
  .transform((v) => v.trim().toUpperCase())
  .refine((v) => v !== "", { error: "Code obligatoire." })
  .refine((v) => SITE_CODE_PATTERN.test(v), { error: "Code : lettres, chiffres et tirets uniquement (50 caractères au maximum)." });

/** Fields of the dialog (form values: strings). */
export const NEW_SITE_FIELDS = ["code", "name", "addressLine", "postalCode", "city", "departmentCode", "latitude", "longitude"] as const;

const location = buildSectionSchema("location");

/** Typed values of a valid dialog. */
export interface NewSiteValues {
  code: string;
  name: string;
  addressLine: string | null;
  postalCode: string | null;
  city: string | null;
  departmentCode: string | null;
  latitude: number | null;
  longitude: number | null;
}

/** Schema of the dialog: typed values, cross-field errors (coordinates) included. */
export const newSiteSchema = z
  .object({
    code: siteCodeSchema,
    name: z
      .string()
      .transform((v) => v.replace(/\s+/g, " ").trim())
      .refine((v) => v !== "", { error: "Nom obligatoire." })
      .refine((v) => [...v].length <= 200, { error: "200 caractères au maximum." }),
    addressLine: z.string().default(""),
    postalCode: z
      .string()
      .default("")
      .refine((v) => v.trim() === "" || /^\d{5}$/.test(v.trim()), { error: "Code postal à 5 chiffres." }),
    city: z.string().default(""),
    departmentCode: z.string().default(""),
    latitude: z.string().default(""),
    longitude: z.string().default(""),
  })
  .transform((v, ctx): NewSiteValues => {
    const { code, name, ...rest } = v;
    const parsed = location.safeParse(rest);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) ctx.addIssue({ code: "custom", message: issue.message, path: issue.path });
      return z.NEVER;
    }
    for (const e of crossFieldRules("location", { ...parsed.data, region: null }).errors) ctx.addIssue({ code: "custom", message: e.message, path: [e.field] });
    const d = parsed.data as Record<string, unknown>;
    const text = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : null);
    const number = (k: string) => (typeof d[k] === "number" ? (d[k] as number) : null);
    return { code, name, addressLine: text("addressLine"), postalCode: text("postalCode"), city: text("city"), departmentCode: text("departmentCode"), latitude: number("latitude"), longitude: number("longitude") };
  });
