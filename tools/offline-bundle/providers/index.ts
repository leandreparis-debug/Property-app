/** Registry of the providers, in execution order (P1 first). */
import { buildingsProvider } from "./buildings";
import { cadastreProvider } from "./cadastre";
import { companiesProvider } from "./companies";
import { geocodingProvider } from "./geocoding";
import { georisquesProvider } from "./georisques";
import type { Provider, ProviderName } from "./types";
import { PROVIDER_NAMES } from "./types";
import { urbanismeProvider } from "./urbanisme";

/** All providers, in execution order. */
export const PROVIDERS: readonly Provider[] = [
  geocodingProvider,
  buildingsProvider,
  georisquesProvider,
  cadastreProvider,
  urbanismeProvider,
  companiesProvider,
];

/**
 * Selects providers from a comma-separated list (all when empty).
 * @throws {Error} On an unknown name.
 */
export function selectProviders(list: string | undefined): Provider[] {
  if (!list) return [...PROVIDERS];
  const names = list.split(",").map((n) => n.trim()).filter(Boolean);
  for (const n of names) {
    if (!(PROVIDER_NAMES as readonly string[]).includes(n)) throw new Error(`Fournisseur inconnu : ${n} (attendus : ${PROVIDER_NAMES.join(", ")}).`);
  }
  return PROVIDERS.filter((p) => names.includes(p.name as ProviderName));
}
