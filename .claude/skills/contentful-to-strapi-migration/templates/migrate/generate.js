import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { loadExport } from './lib/contentful.js';

/**
 * GENERATE — write Strapi v5 content-type files from a Contentful export + a
 * migration.config.json. Deterministic: same inputs → same schema. This is the
 * "build out the Strapi schema to support the content" step. It maps each
 * Contentful field to a Strapi attribute, makes single types where the config
 * says so, promotes tag-like fields to collections + relations, and adds a
 * `contentfulId` to every type (for idempotent migration).
 *
 *   node generate.js --export export.json --config migration.config.json --out <strapi-project>
 *
 * Writes <out>/src/api/<type>/{content-types,controllers,routes,services}. By
 * default emits TypeScript (.ts) to match `create-strapi-app`; pass --js for a
 * JavaScript project.
 */

const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[_\s]+/g, '-').toLowerCase();
const snake = (s) => kebab(s).replace(/-/g, '_');

function parseArgs(argv) {
  const a = { out: '.', js: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--export') a.export = argv[++i];
    else if (argv[i] === '--config') a.config = argv[++i];
    else if (argv[i] === '--out') a.out = argv[++i];
    else if (argv[i] === '--js') a.js = true;
  }
  return a;
}

// Contentful target content-type id for a Link/Array<Link> Entry field.
function linkTargetCfId(def) {
  const d = def.type === 'Array' ? def.items : def;
  const v = (d.validations || []).find((x) => x.linkContentType);
  return v?.linkContentType?.[0];
}

function attribute(def, ct, types) {
  switch (def.type) {
    case 'Symbol':
      return def.id === 'slug'
        ? { type: 'uid', targetField: ct.displayField || 'title' }
        : { type: 'string' };
    case 'Text':
      return { type: 'text' };
    case 'RichText':
      return { type: 'blocks' };
    case 'Integer':
      return { type: 'integer' };
    case 'Number':
      return { type: 'decimal' };
    case 'Boolean':
      return { type: 'boolean' };
    case 'Date':
      return { type: 'datetime' };
    case 'Object':
    case 'Location':
      return { type: 'json' };
    case 'Link':
      if (def.linkType === 'Asset') return { type: 'media', multiple: false, allowedTypes: ['images', 'files', 'videos'] };
      return relation('manyToOne', def, types);
    case 'Array':
      if (def.items?.linkType === 'Asset') return { type: 'media', multiple: true };
      if (def.items?.linkType === 'Entry') return relation('manyToMany', def, types);
      return { type: 'json' }; // Array<Symbol> stays json unless promoted (handled separately)
    default:
      return { type: 'json' };
  }
}

function relation(kind, def, types) {
  const targetCf = linkTargetCfId(def);
  const t = targetCf && types[targetCf];
  if (!t) return { type: 'json' }; // unknown target → don't break; keep as json
  return { type: 'relation', relation: kind, target: `api::${t.singularName}.${t.singularName}` };
}

function buildSchema(ct, cfg, types, promote) {
  const attributes = {};
  for (const f of ct.fields) {
    if (promote[f.id]) {
      const p = promote[f.id];
      attributes[f.id] = { type: 'relation', relation: 'manyToMany', target: `api::${p.singularName}.${p.singularName}` };
    } else {
      attributes[f.id] = attribute(f, ct, types);
    }
  }
  attributes.contentfulId = { type: 'string' };
  return {
    kind: cfg.kind === 'single' ? 'singleType' : 'collectionType',
    collectionName: snake(cfg.pluralName),
    info: { singularName: cfg.singularName, pluralName: cfg.pluralName, displayName: cfg.displayName || ct.name },
    options: { draftAndPublish: true },
    pluginOptions: {},
    attributes,
  };
}

function promoteSchema(p) {
  return {
    kind: 'collectionType',
    collectionName: snake(p.pluralName),
    info: { singularName: p.singularName, pluralName: p.pluralName, displayName: p.displayName || p.singularName },
    options: { draftAndPublish: true },
    pluginOptions: {},
    attributes: {
      [p.titleField || 'title']: { type: 'string', required: true },
      slug: { type: 'uid', targetField: p.titleField || 'title' },
      contentfulId: { type: 'string' },
    },
  };
}

function writeType(outRoot, singular, schema, ext) {
  const base = path.join(outRoot, 'src', 'api', singular);
  mkdirSync(path.join(base, 'content-types', singular), { recursive: true });
  mkdirSync(path.join(base, 'controllers'), { recursive: true });
  mkdirSync(path.join(base, 'routes'), { recursive: true });
  mkdirSync(path.join(base, 'services'), { recursive: true });
  writeFileSync(path.join(base, 'content-types', singular, 'schema.json'), JSON.stringify(schema, null, 2) + '\n');

  const factory = (fn) =>
    ext === 'ts'
      ? `import { factories } from '@strapi/strapi';\n\nexport default factories.${fn}('api::${singular}.${singular}');\n`
      : `'use strict';\n\nconst { factories } = require('@strapi/strapi');\n\nmodule.exports = factories.${fn}('api::${singular}.${singular}');\n`;
  writeFileSync(path.join(base, 'controllers', `${singular}.${ext}`), factory('createCoreController'));
  writeFileSync(path.join(base, 'routes', `${singular}.${ext}`), factory('createCoreRouter'));
  writeFileSync(path.join(base, 'services', `${singular}.${ext}`), factory('createCoreService'));
}

function main() {
  const a = parseArgs(process.argv);
  if (!a.export || !a.config) {
    console.error('Usage: node generate.js --export <export.json> --config <migration.config.json> --out <strapi-project> [--js]');
    process.exit(1);
  }
  const data = loadExport(a.export);
  const config = JSON.parse(readFileSync(a.config, 'utf8'));
  const types = config.types || {};
  const promote = config.promote || {};
  const ext = a.js ? 'js' : 'ts';
  const ctById = Object.fromEntries(data.contentTypes.map((ct) => [ct.sys.id, ct]));

  let n = 0;
  for (const [ctId, cfg] of Object.entries(types)) {
    const ct = ctById[ctId];
    if (!ct) {
      console.warn(`  ! config type "${ctId}" not in export — skipping`);
      continue;
    }
    writeType(a.out, cfg.singularName, buildSchema(ct, cfg, types, promote), ext);
    console.log(`  + ${cfg.singularName} (${cfg.kind})`);
    n++;
  }
  // Promoted (tag-like) collections.
  const promoted = new Map();
  for (const p of Object.values(promote)) promoted.set(p.singularName, p);
  for (const p of promoted.values()) {
    writeType(a.out, p.singularName, promoteSchema(p), ext);
    console.log(`  + ${p.singularName} (collection, promoted)`);
    n++;
  }

  console.log(`\nGenerated ${n} content types into ${path.join(a.out, 'src/api')} (${ext}).`);
  console.log('Restart Strapi (or let develop mode reload), then run migrate.js.');
}

main();
