/** Field registry of the site sheet. See docs/data-model.md (« Registre des champs »). */
export * from "./types";
export { FIELD_REGISTRY, fieldsOfSection, getField, hasField, sectionTitle } from "./registry";
export { EXCLUDED_FIELDS, type ExcludedField } from "./excluded";
export { formatFieldValue, isFilledValue, type DateWithPrecision } from "./render";
export { detectReference, REFERENCE_KIND_LABELS, safeExternalUrl, type DetectedReference, type ReferenceKind } from "./links";
