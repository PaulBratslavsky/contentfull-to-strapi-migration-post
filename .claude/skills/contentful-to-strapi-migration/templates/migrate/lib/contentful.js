import { readFileSync } from 'node:fs';

/**
 * Helpers for reading a Contentful export file.
 *
 * `contentful space export` produces a single JSON file shaped like:
 *   { contentTypes: [...], entries: [...], assets: [...], locales: [...] }
 *
 * Every field value is nested under a locale code, e.g.
 *   entry.fields.title = { "en-US": "Hello" }
 *   entry.fields.author = { "en-US": { sys: { type: "Link", linkType: "Entry", id } } }
 *
 * These helpers flatten that to a single working locale so the rest of the
 * migration deals with plain values.
 */

export function loadExport(filePath) {
  const raw = readFileSync(filePath, 'utf8');
  const data = JSON.parse(raw);
  return {
    contentTypes: data.contentTypes ?? [],
    entries: data.entries ?? [],
    assets: data.assets ?? [],
    locales: data.locales ?? [],
  };
}

/** The export's default locale, or a fallback. */
export function defaultLocale(exportData, fallback = 'en-US') {
  const found = exportData.locales.find((l) => l.default);
  return found?.code ?? exportData.locales[0]?.code ?? fallback;
}

/** Read a single field value for the given locale (handles the locale nesting). */
export function field(entry, fieldId, locale) {
  const localized = entry?.fields?.[fieldId];
  if (localized === undefined) return undefined;
  // Prefer the requested locale, fall back to the first available value.
  if (locale in localized) return localized[locale];
  const first = Object.values(localized)[0];
  return first;
}

/** The Contentful content type id of an entry (e.g. "blogPost"). */
export function entryContentTypeId(entry) {
  return entry?.sys?.contentType?.sys?.id;
}

/** All entries of a given content type id. */
export function entriesOfType(exportData, contentTypeId) {
  return exportData.entries.filter((e) => entryContentTypeId(e) === contentTypeId);
}

/** Resolve a Link field value to the linked entry/asset id, or null. */
export function linkId(value) {
  return value?.sys?.id ?? null;
}

/** Resolve an array-of-links field to a list of ids. */
export function linkIds(value) {
  if (!Array.isArray(value)) return [];
  return value.map(linkId).filter(Boolean);
}

/** Index assets by their Contentful sys.id for quick lookup. */
export function indexAssets(exportData) {
  const map = new Map();
  for (const asset of exportData.assets) {
    map.set(asset.sys.id, asset);
  }
  return map;
}
