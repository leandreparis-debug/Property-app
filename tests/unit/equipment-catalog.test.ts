import { describe, expect, it } from "vitest";
import {
  categoryOf,
  distanceM,
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_TYPES,
  equipmentTypeLabel,
  equipmentTypeSchema,
  MAX_EQUIPMENT_DISTANCE_M,
  nextEquipmentLabel,
  withinSiteRadius,
} from "@/domain/equipment/catalog";
import { offsetLngLat } from "@/domain/plan/calibration";
import { PICTOGRAMS } from "@/components/plan/pictograms";

describe("equipment catalog", () => {
  it("unique codes (≤ 40 characters), each type with a label, a category and a drawn icon", () => {
    const codes = EQUIPMENT_TYPES.map((t) => t.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.length).toBeGreaterThanOrEqual(20);
    const categories = new Set<string>(EQUIPMENT_CATEGORIES.map((c) => c.code));
    for (const t of EQUIPMENT_TYPES) {
      expect(t.code).toMatch(/^[A-Z][A-Z0-9_]{1,39}$/);
      expect(t.labelFr).toMatch(/\S/);
      expect(categories.has(t.category)).toBe(true);
      expect(PICTOGRAMS[t.icon], t.icon).toBeDefined();
    }
    // Every category is used and has its own shape.
    for (const c of EQUIPMENT_CATEGORIES) expect(EQUIPMENT_TYPES.some((t) => t.category === c.code)).toBe(true);
    expect(new Set(EQUIPMENT_CATEGORIES.map((c) => c.shape)).size).toBe(EQUIPMENT_CATEGORIES.length);
  });

  it("validates codes with zod; unknown codes are « Autre équipement »", () => {
    expect(equipmentTypeSchema.safeParse("FIRE_HOSE_REEL").success).toBe(true);
    expect(equipmentTypeSchema.safeParse("fire_hose_reel").success).toBe(false);
    expect(equipmentTypeSchema.safeParse("SPRINKLER").success).toBe(false);
    expect(categoryOf("TANK")?.labelFr).toBe("Fluides");
    expect(categoryOf("NOPE")).toBeUndefined();
    expect(equipmentTypeLabel("NOPE")).toBe("Autre équipement");
  });

  it("next automatic label: after the highest number of the type", () => {
    expect(nextEquipmentLabel("FIRE_HOSE_REEL", [])).toBe("RIA 1");
    expect(nextEquipmentLabel("FIRE_HOSE_REEL", ["RIA 1", "RIA 2", "ria 7", "RIA nord", null, "Extincteur 12"])).toBe("RIA 8");
    expect(nextEquipmentLabel("MAIN_LV_PANEL", ["TGBT 1"])).toBe("TGBT 2");
    expect(nextEquipmentLabel("UNKNOWN", [])).toBe("Équipement 1");
  });

  it("1 km radius around the site", () => {
    const site: [number, number] = [2.35, 48.85];
    expect(withinSiteRadius(offsetLngLat(site, 700, 700), site)).toBe(true); // ≈ 990 m
    expect(withinSiteRadius(offsetLngLat(site, 0, 1010), site)).toBe(false);
    expect(Math.abs(distanceM(site, offsetLngLat(site, 0, MAX_EQUIPMENT_DISTANCE_M)) - 1000)).toBeLessThan(2);
    expect(distanceM(site, offsetLngLat(site, 0.5, 0))).toBeCloseTo(0.5, 2);
  });
});
