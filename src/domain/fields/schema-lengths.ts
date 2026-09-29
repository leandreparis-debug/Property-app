import { FIELD_ENTITIES } from "./types";

/**
 * Reads the text column lengths of the registry models from a Prisma schema
 * source (`@db.NVarChar(n)`, `@db.Char(n)`; `Max` → `null`).
 * @param schema - Content of `schema.prisma`.
 * @returns `Entity.key` → length.
 */
export function columnLengths(schema: string): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const entity of FIELD_ENTITIES) {
    const block = new RegExp(`\\nmodel ${entity} \\{([\\s\\S]*?)\\n\\}`).exec(schema)?.[1] ?? "";
    for (const line of block.split("\n")) {
      const m = /^\s*(\w+)\s+String\??\s.*@db\.N?(?:Var)?Char\((\d+|Max)\)/.exec(line);
      if (m) out[`${entity}.${m[1]}`] = m[2] === "Max" ? null : Number(m[2]);
    }
  }
  return out;
}
