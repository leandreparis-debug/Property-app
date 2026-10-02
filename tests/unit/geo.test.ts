import { describe, expect, it } from "vitest";
import {
  DEPARTMENTS,
  departmentFromPostalCode,
  isInMetropolitanFrance,
  REGIONS,
  resolveDepartment,
  resolveRegion,
} from "@/domain/geo";

describe("reference data", () => {
  it("has the 96 metropolitan departments and the 13 regions", () => {
    expect(DEPARTMENTS).toHaveLength(96);
    expect(new Set(DEPARTMENTS.map((d) => d.code)).size).toBe(96);
    expect(REGIONS).toHaveLength(13);
    expect(new Set(DEPARTMENTS.map((d) => d.region))).toEqual(new Set(REGIONS));
  });

  it("assigns the expected number of departments per region", () => {
    const count = (r: string) => DEPARTMENTS.filter((d) => d.region === r).length;
    expect(count("Île-de-France")).toBe(8);
    expect(count("Corse")).toBe(2);
    expect(count("Auvergne-Rhône-Alpes")).toBe(12);
    expect(count("Nouvelle-Aquitaine")).toBe(12);
    expect(count("Occitanie")).toBe(13);
    expect(count("Grand Est")).toBe(10);
    expect(count("Bretagne")).toBe(4);
  });
});

describe("resolveDepartment", () => {
  it.each([
    ["1", "01"], ["01", "01"], [1, "01"], ["2a", "2A"], ["2B", "2B"], ["95", "95"],
    ["Val-d'Oise", "95"], ["val d oise", "95"], ["VAL D'OISE", "95"], ["Val d’Oise", "95"],
    ["95 - Val-d'Oise", "95"], ["95 Val d'Oise", "95"], ["Val-d'Oise (95)", "95"],
    ["Corse-du-Sud", "2A"], ["haute corse", "2B"], ["Côtes-d'Armor", "22"], ["Territoire de Belfort", "90"], ["Rhône", "69"], ["rhone", "69"],
  ])("%j → %s", (input, code) => {
    expect(resolveDepartment(input)?.code).toBe(code);
  });

  it("returns the name and region", () => {
    expect(resolveDepartment("2A")).toEqual({ code: "2A", name: "Corse-du-Sud", region: "Corse" });
  });

  it.each(["20", "971", "96", "00", "Atlantide", "95 - Isère", "", null, undefined])("rejects %j", (input) => {
    expect(resolveDepartment(input as never)).toBeNull();
  });
});

describe("resolveRegion", () => {
  it("resolves current names without accents, hyphens or case", () => {
    expect(resolveRegion("ile de france")).toEqual({ name: "Île-de-France" });
    expect(resolveRegion("PROVENCE-ALPES-COTE D'AZUR")).toEqual({ name: "Provence-Alpes-Côte d'Azur" });
    expect(resolveRegion("Centre-Val de Loire")).toEqual({ name: "Centre-Val de Loire" });
  });

  it("maps former region names, with a warning", () => {
    expect(resolveRegion("Rhône-Alpes")).toMatchObject({ name: "Auvergne-Rhône-Alpes", warning: expect.stringContaining("Rhône-Alpes") });
    expect(resolveRegion("Picardie")?.name).toBe("Hauts-de-France");
    expect(resolveRegion("Midi-Pyrénées")?.name).toBe("Occitanie");
    expect(resolveRegion("Basse-Normandie")?.name).toBe("Normandie");
    expect(resolveRegion("Limousin")?.name).toBe("Nouvelle-Aquitaine");
  });

  it("accepts abbreviations without warning", () => {
    expect(resolveRegion("IDF")).toEqual({ name: "Île-de-France" });
    expect(resolveRegion("PACA")).toEqual({ name: "Provence-Alpes-Côte d'Azur" });
    expect(resolveRegion("AURA")).toEqual({ name: "Auvergne-Rhône-Alpes" });
  });

  it("returns null for unknown regions", () => {
    expect(resolveRegion("Guadeloupe")).toBeNull();
    expect(resolveRegion("")).toBeNull();
  });
});

describe("postal codes and bounding box", () => {
  it("derives the department from a postal code", () => {
    expect(departmentFromPostalCode("69800")?.code).toBe("69");
    expect(departmentFromPostalCode("20090")?.code).toBe("2A");
    expect(departmentFromPostalCode("20200")?.code).toBe("2B");
    expect(departmentFromPostalCode("97100")).toBeNull();
    expect(departmentFromPostalCode("6980")).toBeNull();
  });

  it("checks metropolitan France, Corsica included", () => {
    expect(isInMetropolitanFrance(48.8566, 2.3522)).toBe(true);
    expect(isInMetropolitanFrance(41.93, 8.74)).toBe(true); // Ajaccio
    expect(isInMetropolitanFrance(51.05, 2.37)).toBe(true); // Dunkerque
    expect(isInMetropolitanFrance(4.9486, 45.7106)).toBe(false); // swapped
    expect(isInMetropolitanFrance(40.4168, -3.7038)).toBe(false); // Madrid
    expect(isInMetropolitanFrance(null, 2)).toBe(false);
  });
});
