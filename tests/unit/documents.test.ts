import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { cleanFileName, detectDocumentType, extensionOf, MAX_FILE_NAME } from "@/domain/documents";

const enc = (s: string) => new TextEncoder().encode(s);
const bytes = (...b: number[]) => new Uint8Array(b);

describe("file type by signature", () => {
  it("accepts matching contents", async () => {
    expect(detectDocumentType("bail.pdf", enc("%PDF-1.4\n…"))).toMatchObject({ ok: true, type: { mime: "application/pdf" } });
    expect(detectDocumentType("plan.PNG", bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toMatchObject({ ok: true, type: { ext: "png" } });
    expect(detectDocumentType("photo.jpeg", bytes(0xff, 0xd8, 0xff, 0xe0))).toMatchObject({ ok: true, type: { ext: "jpg", mime: "image/jpeg" } });
    expect(detectDocumentType("vue.webp", enc("RIFF\u0000\u0000\u0000\u0000WEBPVP8 "))).toMatchObject({ ok: true });
    expect(detectDocumentType("plan.dwg", enc("AC1027\u0000\u0000"))).toMatchObject({ ok: true });
    expect(detectDocumentType("plan.dxf", enc("  0\nSECTION\n  2\nHEADER\n"))).toMatchObject({ ok: true });
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("A");
    expect(detectDocumentType("classeur.xlsx", new Uint8Array(await wb.xlsx.writeBuffer()))).toMatchObject({ ok: true });
  });

  it("refuses a content that does not match its extension", async () => {
    const png = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    expect(detectDocumentType("image.pdf", png)).toEqual({ ok: false, error: "Le contenu du fichier ne correspond pas à son extension. (.pdf)" });
    expect(detectDocumentType("plan.dxf", bytes(0x41, 0x43, 0, 0x31))).toMatchObject({ ok: false });
    expect(detectDocumentType("faux.docx", enc("PK\u0003\u0004 [Content_Types].xml xl/workbook.xml"))).toMatchObject({ ok: false });
    expect(detectDocumentType("vrai.docx", enc("PK\u0003\u0004 [Content_Types].xml word/document.xml"))).toMatchObject({ ok: true });
    expect(detectDocumentType("script.pdf", enc("<script>alert(1)</script>"))).toMatchObject({ ok: false });
  });

  it("refuses a type that is not allowed, an empty file", () => {
    for (const name of ["outil.exe", "page.html", "image.svg", "archive.zip", "sans-extension", "bail.pdf.exe"]) {
      expect(detectDocumentType(name, enc("%PDF-1.4"))).toEqual({ ok: false, error: "Type de fichier non autorisé." });
    }
    expect(detectDocumentType("vide.pdf", new Uint8Array())).toEqual({ ok: false, error: "Fichier vide." });
    expect(extensionOf("C:\\docs\\Plan.V2.DWG")).toBe("dwg");
  });
});

describe("file name cleaning", () => {
  it("keeps letters (accents), digits and a few signs; removes paths and control characters", () => {
    expect(cleanFileName("../../etc/Bail signé (2026).pdf")).toBe("Bail signé (2026).pdf");
    expect(cleanFileName("C:\\Users\\x\\Plan <RDC> \u0000\u0007 v2.dwg")).toBe("Plan RDC v2.dwg");
    expect(cleanFileName('a"b|c?d*e.pdf')).toBe("a b c d e.pdf");
    expect(cleanFileName("...")).toBe("document");
    expect(cleanFileName("")).toBe("document");
  });

  it("limits the length and keeps the extension", () => {
    const long = cleanFileName(`${"é".repeat(300)}.pdf`);
    expect([...long].length).toBe(MAX_FILE_NAME);
    expect(long.endsWith(".pdf")).toBe(true);
  });
});
