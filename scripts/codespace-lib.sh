#!/usr/bin/env bash
# Helpers shared by the scripts/codespace-*.sh scripts (sourced, not run).

# The commands launched automatically by GitHub Codespaces (postCreate,
# postStart, postAttach) may not receive CODESPACE_NAME and
# GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN, which interactive terminals get
# from /workspaces/.codespaces/shared/.env. Reads ONLY these two variables
# from that file when they are missing (never the tokens it also holds).
load_codespace_env() {
  local shared=/workspaces/.codespaces/shared/.env value
  if [ -z "${CODESPACE_NAME:-}" ] && [ -r "$shared" ]; then
    value=$(grep -E '^CODESPACE_NAME=' "$shared" | tail -1 | cut -d= -f2- | tr -d '"'"'"'\r')
    [ -n "$value" ] && export CODESPACE_NAME="$value"
  fi
  if [ -z "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-}" ] && [ -r "$shared" ]; then
    value=$(grep -E '^GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN=' "$shared" | tail -1 | cut -d= -f2- | tr -d '"'"'"'\r')
    [ -n "$value" ] && export GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN="$value"
  fi
  # Inside a Codespace the domain is app.github.dev unless GitHub says otherwise.
  if [ -n "${CODESPACE_NAME:-}" ] && [ -z "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-}" ]; then
    export GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN=app.github.dev
  fi
  return 0
}

# Whether we run inside a GitHub Codespace whose public address is known.
in_codespace() {
  [ -n "${CODESPACE_NAME:-}" ] && [ -n "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-}" ]
}
