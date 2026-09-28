/**
 * Identity of the application: the ONLY place where its name is written.
 * Every display of the name (document title, metadata, login screen, rail
 * monogram, design system page, report labels) derives from these constants.
 */

/** Name of the application. */
export const APP_NAME = "Vigie";

/** Short description shown under the name. */
export const APP_TAGLINE = "Référentiel des entrepôts";

/** Description of the document (metadata). */
export const APP_DESCRIPTION = "Référentiel des entrepôts logistiques — Carrefour Property";

/**
 * Monogram of the application: the initial of {@link APP_NAME}, upper case.
 * @param name - Application name (defaults to APP_NAME; parameter for tests).
 */
export function appMonogram(name: string = APP_NAME): string {
  return (name.trim().charAt(0) || "?").toLocaleUpperCase("fr-FR");
}
