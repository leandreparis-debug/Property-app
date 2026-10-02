/**
 * Minimal MBTiles 1.3 writer (SQLite, node:sqlite), used as the intermediate
 * format of the aerial imagery before `pmtiles convert`.
 */
import { DatabaseSync } from "node:sqlite";
import { tilesBounds, xyzToTmsRow, type TileId } from "../tiles";

/** MBTiles writer. */
export class MbtilesWriter {
  private readonly db: DatabaseSync;
  private readonly insert: ReturnType<DatabaseSync["prepare"]>;
  private readonly written: TileId[] = [];

  /**
   * @param path - Output file (created; must not exist or be an MBTiles).
   */
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = OFF;
      PRAGMA synchronous = OFF;
      CREATE TABLE IF NOT EXISTS metadata (name TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE IF NOT EXISTS tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB);
      CREATE UNIQUE INDEX IF NOT EXISTS tile_index ON tiles (zoom_level, tile_column, tile_row);
    `);
    this.insert = this.db.prepare("INSERT OR REPLACE INTO tiles (zoom_level, tile_column, tile_row, tile_data) VALUES (?, ?, ?, ?)");
  }

  /** Adds a tile (XYZ addressing; stored in TMS rows as the spec requires). */
  addTile(tile: TileId, data: Uint8Array): void {
    this.insert.run(tile.z, tile.x, xyzToTmsRow(tile), data);
    this.written.push(tile);
  }

  /** Number of tiles written. */
  get count(): number {
    return this.written.length;
  }

  /** Writes the metadata and closes the database. */
  finish(meta: { name: string; format: "jpg" | "png"; attribution: string; description?: string }): void {
    const zooms = this.written.map((t) => t.z);
    const bounds = tilesBounds(this.written);
    const rows: [string, string][] = [
      ["name", meta.name],
      ["format", meta.format],
      ["type", "overlay"],
      ["version", "1"],
      ["attribution", meta.attribution],
      ["description", meta.description ?? meta.name],
    ];
    if (zooms.length > 0) {
      rows.push(["minzoom", String(Math.min(...zooms))], ["maxzoom", String(Math.max(...zooms))]);
    }
    if (bounds) rows.push(["bounds", bounds.map((b) => b.toFixed(6)).join(",")]);
    const stmt = this.db.prepare("INSERT OR REPLACE INTO metadata (name, value) VALUES (?, ?)");
    for (const [name, value] of rows) stmt.run(name, value);
    this.db.close();
  }
}
