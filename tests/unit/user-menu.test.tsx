// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { initialsOf, UserMenu } from "@/components/shell/UserMenu";

afterEach(cleanup);

describe("initialsOf", () => {
  it.each([
    ["Admin Démo", "a@b.c", "AD"],
    ["Camille", "a@b.c", "CA"],
    [null, "camille.martin@vigie.local", "CM"],
    ["  ", "jo@vigie.local", "JO"],
  ])("%s / %s → %s", (name, email, expected) => {
    expect(initialsOf(name, email)).toBe(expected);
  });
});

describe("UserMenu", () => {
  it("shows name, email, French role and a logout button posting to the logout route", async () => {
    render(<UserMenu name="Admin Démo" email="admin@vigie.local" role="admin" />);
    const trigger = screen.getByRole("button", { name: "Menu utilisateur : Admin Démo" });
    await userEvent.setup().click(trigger);
    expect(await screen.findByText("Administrateur")).toBeVisible();
    expect(screen.getByText("admin@vigie.local")).toBeVisible();
    const logout = screen.getByRole("menuitem", { name: "Se déconnecter" });
    expect(logout).toHaveAttribute("type", "submit");
    const form = document.getElementById(logout.getAttribute("form")!) as HTMLFormElement;
    expect(form.method).toBe("post");
    expect(form.getAttribute("action")).toBe("/api/auth/logout");
  });
});
