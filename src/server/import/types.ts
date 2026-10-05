/**
 * Types shared by the import modules.
 */
import type { BuildingWorkKind, DatePrecision, ExternalSystem } from "@/domain/enums";
import type { MetricCode } from "@/domain/metrics";
import type { EntityKey } from "./mapping";
import type { CellValue, IcpeHeadingValue, ReferenceKind, Severity } from "./parsers";

/** One line of the anomaly report. */
export interface ImportIssue {
  /** Spreadsheet row (1-based); `null` for file-level anomalies. */
  row: number | null;
  /** Warehouse code of the row, if known. */
  code: string | null;
  /** Source column (header as written in the file). */
  column: string | null;
  severity: Severity;
  /** Stable type key (statistics « avertissements par type »). */
  kind: string;
  /** Original cell content. */
  original: string | null;
  /** Value retained (after correction), if any. */
  retained: string | null;
  /** French message. */
  message: string;
}

/** A cell as read from the workbook: formula results only, plus hyperlink target. */
export interface RawCell {
  value: CellValue;
  hyperlink: string | null;
}

/** A data row of the sheet. */
export interface RawRow {
  /** 1-based row number in the sheet. */
  rowNumber: number;
  /** Cells by 1-based column index. */
  cells: ReadonlyMap<number, RawCell>;
}

/** A yearly metric value from the file (`value` null = present but empty). */
export interface DraftMetric {
  metric: MetricCode;
  year: number;
  value: number | null;
  column: string;
}

/** A derived value read from the sheet, for consistency checks only. */
export interface SheetPerSqm {
  column: string;
  metric: MetricCode;
  year: number;
  value: number;
}

/** Normalised content of one spreadsheet row. */
export interface SiteDraft {
  row: number;
  code: string;
  /**
   * Fields per entity, ONLY for columns present in the file (a column absent
   * from the file never touches the database). `null` = present but empty.
   */
  entities: Record<EntityKey, Map<string, unknown>>;
  /** External ids per system (only systems whose column is present). */
  externalIds: Map<ExternalSystem, string[]>;
  /** Building works per kind (only kinds whose column is present). */
  buildingWorks: Map<BuildingWorkKind, { date: Date; precision: DatePrecision }[]>;
  /** ICPE headings; `undefined` when the column is absent. */
  icpeHeadings: IcpeHeadingValue[] | undefined;
  /** Yearly metrics keyed `METRIC|year`. */
  metrics: Map<string, DraftMetric>;
  /** « Date modif » (ISO date), kept as metadata of the IMPORT audit line. */
  sheetModifiedAt: string | null;
  /** Derived values of the sheet, for checks. */
  sheet: {
    perSqm: SheetPerSqm[];
    arbitrationDate: Date | null;
  };
  /** Classification of reference columns (statistics). */
  references: { column: string; kind: ReferenceKind }[];
}

/** Key of a draft metric. */
export const metricKey = (metric: string, year: number): string => `${metric}|${year}`;
