// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LOGO_THEMES, logoDrawing, VigieIcon, VigieLogo } from "@/components/brand/VigieLogo";
import { MainNav } from "@/components/shell/MainNav";
import { TooltipProvider } from "@/components/ui/tooltip";
import { APP_NAME } from "@/config/app";

vi.mock("next/navigation", () => ({ usePathname: () => "/", useSearchParams: () => new URLSearchParams("status=critical&site=X") }));

afterEach(cleanup);

const ROOT = join(__dirname, "..", "..");
const STATUS_HEX = ["#2fb67c", "#f2a93b", "#f0524f"];

describe("application name and logo", () => {
  it("the full logo is named after APP_NAME and writes it in capitals", () => {
    render(<VigieLogo variant="vertical" size={64} />);
    const logo = screen.getByRole("img", { name: APP_NAME });
    expect(logo.textContent).toBe(APP_NAME.toUpperCase());
  });

  it("the top bar shows the brand symbol (decorative, simplified drawing below 48 px)", () => {
    const { container } = render(
      <TooltipProvider>
        <MainNav />
      </TooltipProvider>,
    );
    const icon = container.querySelector('[data-slot="vigie-icon"]');
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
    expect(icon?.getAttribute("data-drawing")).toBe("32");
    expect(container.textContent).not.toMatch(/^[A-Z]$/m);
  });

  it("drawing by size: never the full symbol under 48 px, never the 32 px one under 24 px", () => {
    expect([logoDrawing(16), logoDrawing(23), logoDrawing(24), logoDrawing(47), logoDrawing(48)]).toEqual(["16", "16", "32", "32", "full"]);
    render(<VigieIcon size={16} />);
    expect(screen.getByRole("img", { name: APP_NAME }).getAttribute("data-drawing")).toBe("16");
  });

  it("the login screen uses the vertical logo inside its heading, no hard-coded name", () => {
    const source = readFileSync(join(ROOT, "src/app/login/page.tsx"), "utf8");
    expect(source).toMatch(/<h1[^>]*>\s*<VigieLogo variant="vertical"/);
    expect(source).not.toMatch(/>\s*Vigie\s*</);
  });

  it("no status color in the logo nor in the favicon", () => {
    const colors = JSON.stringify(LOGO_THEMES).toLowerCase();
    const favicon = readFileSync(join(ROOT, "src/app/icon.svg"), "utf8").toLowerCase();
    for (const hex of STATUS_HEX) {
      expect(colors).not.toContain(hex);
      expect(favicon).not.toContain(hex);
    }
    expect(favicon).toContain("#7cc8e0"); // brand « Signal » cyan
  });

  it("no trace of the former name « atlas » in src/ and public/ (the npm package world-atlas aside)", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (!entry.endsWith("common-passwords.txt") && /atlas/i.test(readFileSync(path, "latin1").replace(/world-atlas/g, ""))) offenders.push(path);
      }
    };
    walk(join(ROOT, "src"));
    walk(join(ROOT, "public"));
    expect(offenders).toEqual([]);
  });
});
