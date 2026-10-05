import { describe, expect, it } from "vitest";
import { serverActionsAllowedOrigins } from "@/lib/allowed-origins";

describe("serverActionsAllowedOrigins", () => {
  it("without the variable, outside a Codespace: only the host of APP_URL (unchanged behaviour)", () => {
    expect(serverActionsAllowedOrigins({ APP_URL: "http://localhost:3000" })).toEqual(["localhost:3000"]);
    expect(serverActionsAllowedOrigins({ APP_URL: "https://vigie.intranet.example" })).toEqual(["vigie.intranet.example"]);
    expect(serverActionsAllowedOrigins({})).toEqual([]);
  });

  it("with the variable: APP_URL host plus each listed host (origins reduced to hosts, blanks and duplicates ignored)", () => {
    expect(
      serverActionsAllowedOrigins({
        APP_URL: "https://vigie-test-3000.app.github.dev",
        SERVER_ACTIONS_ALLOWED_ORIGINS: " vigie-test-3000.app.github.dev , https://autre.example:8443/ ,, ",
      }),
    ).toEqual(["vigie-test-3000.app.github.dev", "autre.example:8443"]);
  });

  it("inside a Codespace without the variable: the forwarded address of the port", () => {
    expect(serverActionsAllowedOrigins({ APP_URL: "http://localhost:3000", CODESPACE_NAME: "vigie-abc", GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: "app.github.dev" })).toEqual([
      "localhost:3000",
      "vigie-abc-3000.app.github.dev",
    ]);
    expect(serverActionsAllowedOrigins({ APP_URL: "https://vigie-abc-3000.app.github.dev", CODESPACE_NAME: "vigie-abc", GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: "app.github.dev" })).toEqual([
      "vigie-abc-3000.app.github.dev",
      "localhost:3000",
    ]);
  });

  it("the variable wins over the Codespace fallback; malformed entries are ignored", () => {
    expect(
      serverActionsAllowedOrigins({ SERVER_ACTIONS_ALLOWED_ORIGINS: "proxy.example, http://", CODESPACE_NAME: "x", GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: "app.github.dev" }),
    ).toEqual(["proxy.example"]);
  });
});
