// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppMonogram } from "@/components/shell/AppMonogram";
import { NavRail } from "@/components/shell/NavRail";
import { TooltipProvider } from "@/components/ui/tooltip";
import { APP_NAME, appMonogram } from "@/config/app";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

afterEach(cleanup);

const ROOT = join(__dirname, "..", "..");
const initial = APP_NAME.charAt(0).toUpperCase();

describe("application name and monogram", () => {
  it("the monogram is the initial of APP_NAME", () => {
    expect(appMonogram()).toBe(initial);
    expect(appMonogram("atelier")).toBe("A");
    expect(appMonogram("")).toBe("?");
  });

  it("the rail displays the initial of APP_NAME", () => {
    const { container } = render(
      <TooltipProvider>
        <NavRail />
      </TooltipProvider>,
    );
    const monogram = container.querySelector('[data-slot="app-monogram"]');
    expect(monogram?.textContent).toBe(initial);
  });

  it("the login screen uses the shared monogram and APP_NAME (no hard-coded letter or name)", () => {
    render(<AppMonogram size="md" />);
    expect(document.querySelector('[data-slot="app-monogram"]')?.textContent).toBe(initial);
    const source = readFileSync(join(ROOT, "src/app/login/page.tsx"), "utf8");
    expect(source).toContain("<AppMonogram");
    expect(source).toContain("{APP_NAME}");
    expect(source).not.toMatch(/>\s*[A-Z]\s*</);
  });

  it("the favicon draws the same monogram", () => {
    const svg = readFileSync(join(ROOT, "src/app/icon.svg"), "utf8");
    expect(svg).toContain(`data-monogram="${initial}"`);
  });

  it("no trace of the former name « atlas » in src/ and public/", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (!entry.endsWith("common-passwords.txt") && /atlas/i.test(readFileSync(path, "latin1"))) offenders.push(path);
      }
    };
    walk(join(ROOT, "src"));
    walk(join(ROOT, "public"));
    expect(offenders).toEqual([]);
  });
});
