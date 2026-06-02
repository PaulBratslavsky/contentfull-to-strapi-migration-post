import 'dotenv/config';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import {
  loadExport,
  defaultLocale,
  field,
  entryContentTypeId,
  linkId,
  linkIds,
} from './lib/contentful.js';
import { richTextToBlocks } from './lib/richtext.js';
import { migrateAssets } from './lib/assets.js';
import { StrapiClient } from './lib/strapi.js';

/**
 * GENERIC, config-driven Contentful → Strapi v5 migration engine.
 *
 * It introspects the export's own content-type definitions and migrates every
 * type and field BY RULE — no per-model field code — so it works for any
 * Contentful space. The model-specific decisions (which types are single, the
 * Strapi api ids, which Array<Symbol> fields to promote to collections) come
 * from `migration.config.json`, which `analyze.js` generates for you.
 *
 *   node analyze.js  --export export.json --out migration.config.json   # 1. plan
 *   node migrate.js  --export export.json [--config migration.config.json]
 */

const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[_\s]+/g, '-').toLowerCase();
const pluralize = (s) =>
  /[^aeiou]y$/.test(s) ? s.replace(/y$/, 'ies') : /(s|x|z|ch|sh)$/.test(s) ? `${s}es` : `${s}s`;
const slugify = (s) =>
  String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--export') args.export = argv[++i];
    else if (argv[i] === '--assets-dir') args.assetsDir = argv[++i];
    else if (argv[i] === '--config') args.config = argv[++i];
  }
  return args;
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var ${name}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return v;
}

function loadConfig(args) {
  const p = args.config || (existsSync('./migration.config.json') ? './migration.config.json' : null);
  if (!p) return { types: {}, promote: {} };
  const c = JSON.parse(readFileSync(p, 'utf8'));
  return { types: c.types || {}, promote: c.promote || {}, locale: c.locale };
}

async function main() {
  const args = parseArgs(process.argv);
  const exportPath = args.export || process.env.CONTENTFUL_EXPORT;
  if (!exportPath) {
    console.error('Pass --export <path/to/export.json> (or set CONTENTFUL_EXPORT).');
    process.exit(1);
  }
  const assetsDir = args.assetsDir || process.env.CONTENTFUL_ASSETS_DIR || path.dirname(exportPath);
  const config = loadConfig(args);

  const strapi = new StrapiClient({
    baseUrl: process.env.STRAPI_URL || 'http://localhost:1337',
    token: requireEnv('STRAPI_API_TOKEN'),
  });

  const data = loadExport(exportPath);
  const locale = process.env.CONTENTFUL_LOCALE || config.locale || defaultLocale(data);

  // Field definitions per content type, straight from the export.
  const fieldDefs = {};
  for (const ct of data.contentTypes) {
    fieldDefs[ct.sys.id] = Object.fromEntries(ct.fields.map((f) => [f.id, f]));
  }
  console.log(
    `Loaded export: ${data.contentTypes.length} content types, ${data.entries.length} entries, ${data.assets.length} assets (locale ${locale})`
  );

  // Resolve a Contentful content-type id to its Strapi API path + kind, from
  // the config when present, otherwise derived.
  const typeCfg = (ctId) => config.types[ctId];
  const isSingle = (ctId) => typeCfg(ctId)?.kind === 'single';
  const apiId = (ctId) => {
    const t = typeCfg(ctId);
    if (t) return t.kind === 'single' ? t.singularName : t.pluralName;
    return pluralize(kebab(ctId)); // fallback
  };

  // --- Pass 0: assets → media library --------------------------------------
  console.log('\n[1/4] Uploading assets to the media library...');
  const assetMap = await migrateAssets(data.assets, { strapi, assetsDir, locale, log: console.log });
  const resolveAsset = (cfAssetId) => assetMap.get(cfAssetId) ?? null;
  const mediaId = (cfAssetId) => assetMap.get(cfAssetId)?.id;

  // Idempotent create-or-update keyed by contentfulId; single types use PUT.
  async function upsert(api, single, contentfulId, payload) {
    if (single) return strapi.putSingle(api, payload);
    const existing = await strapi.findByContentfulId(api, contentfulId);
    return existing ? strapi.update(api, existing.documentId, payload) : strapi.create(api, payload);
  }

  const idMap = new Map(); // Contentful entry id → Strapi documentId (any type)
  const counts = {};
  const bump = (k) => (counts[k] = (counts[k] || 0) + 1);

  const isEntryLink = (def) =>
    (def.type === 'Link' && def.linkType === 'Entry') ||
    (def.type === 'Array' && def.items?.linkType === 'Entry');

  // --- Pass: promote tag-like Array<Symbol> fields to their own collections -
  const promoteMaps = {}; // fieldId → Map(value → documentId)
  const promoteEntries = Object.entries(config.promote || {});
  if (promoteEntries.length) {
    console.log('\n[2/4] Promoting tag-like fields to collections...');
    for (const [fieldId, cfg] of promoteEntries) {
      const values = new Set();
      for (const entry of data.entries) {
        const v = field(entry, fieldId, locale);
        if (Array.isArray(v)) v.forEach((x) => values.add(x));
      }
      const map = new Map();
      for (const value of values) {
        const slug = slugify(value);
        const rec = await upsert(cfg.pluralName, false, `${cfg.singularName}-${slug}`, {
          [cfg.titleField || 'title']: value,
          slug,
          contentfulId: `${cfg.singularName}-${slug}`,
        });
        map.set(value, rec.documentId);
        bump(cfg.pluralName);
      }
      promoteMaps[fieldId] = map;
    }
  } else {
    console.log('\n[2/4] No tag-like fields to promote (skipping).');
  }

  // --- Pass 1: create every entry (scalars, rich text, media) --------------
  console.log('\n[3/4] Creating entries (no cross-entry relations yet)...');
  for (const entry of data.entries) {
    const ctId = entryContentTypeId(entry);
    const defs = fieldDefs[ctId];
    if (!defs) continue;

    const payload = { contentfulId: entry.sys.id };
    for (const [fieldId, def] of Object.entries(defs)) {
      if (isEntryLink(def) || config.promote?.[fieldId]) continue; // relations handled in pass 2
      const v = field(entry, fieldId, locale);
      if (v === undefined) continue;

      if (def.type === 'RichText') payload[fieldId] = richTextToBlocks(v, { resolveAsset });
      else if (def.type === 'Link' && def.linkType === 'Asset') payload[fieldId] = mediaId(linkId(v));
      else if (def.type === 'Array' && def.items?.linkType === 'Asset')
        payload[fieldId] = linkIds(v).map(mediaId).filter((x) => x != null);
      else payload[fieldId] = v; // Symbol, Text, Integer, Number, Boolean, Date, Object(json), Array<Symbol>, ...
    }

    const rec = await upsert(apiId(ctId), isSingle(ctId), entry.sys.id, payload);
    if (rec?.documentId) idMap.set(entry.sys.id, rec.documentId);
    bump(apiId(ctId));
  }

  // --- Pass 2: wire relations now that every entry has a documentId --------
  console.log('\n[4/4] Linking relations...');
  for (const entry of data.entries) {
    const ctId = entryContentTypeId(entry);
    const defs = fieldDefs[ctId];
    if (!defs) continue;
    if (!isSingle(ctId) && !idMap.has(entry.sys.id)) continue;

    const relations = {};
    for (const [fieldId, def] of Object.entries(defs)) {
      if (isEntryLink(def)) {
        const ids = (def.type === 'Array' ? linkIds(field(entry, fieldId, locale)) : [linkId(field(entry, fieldId, locale))])
          .map((cf) => idMap.get(cf))
          .filter(Boolean);
        if (ids.length) relations[fieldId] = { set: ids };
      } else if (config.promote?.[fieldId]) {
        const values = field(entry, fieldId, locale);
        const ids = (Array.isArray(values) ? values : [])
          .map((v) => promoteMaps[fieldId]?.get(v))
          .filter(Boolean);
        if (ids.length) relations[fieldId] = { set: ids };
      }
    }
    if (Object.keys(relations).length) await upsert(apiId(ctId), isSingle(ctId), entry.sys.id, relations);
  }

  console.log('\nMigration complete:');
  console.table(counts);
}

main().catch((err) => {
  console.error('\nMigration failed:', err.message);
  process.exit(1);
});
