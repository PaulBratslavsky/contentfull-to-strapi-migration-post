import { writeFileSync } from 'node:fs';
import { loadExport, defaultLocale, entryContentTypeId } from './lib/contentful.js';

/**
 * ANALYZE — read a Contentful export and print a migration plan, plus emit a
 * starter `migration.config.json`. This is the deterministic first step: it
 * surfaces every content type and field with its proposed Strapi mapping and
 * FLAGS the judgment calls (single types, tag-like arrays, relations) so they
 * can be decided in the config before any schema is generated or data moved.
 *
 *   node analyze.js --export path/to/export.json [--out migration.config.json]
 */

const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[_\s]+/g, '-').toLowerCase();
const pluralize = (s) =>
  /[^aeiou]y$/.test(s) ? s.replace(/y$/, 'ies') : /(s|x|z|ch|sh)$/.test(s) ? `${s}es` : `${s}s`;
const pluralApiId = (id) => pluralize(kebab(id));

// Contentful field type -> proposed Strapi field (for the plan/report).
function proposeStrapi(def) {
  switch (def.type) {
    case 'Symbol':
      return def.id === 'slug' ? 'uid' : 'string';
    case 'Text':
      return 'text';
    case 'RichText':
      return 'blocks (Rich text)';
    case 'Integer':
      return 'integer';
    case 'Number':
      return 'decimal';
    case 'Boolean':
      return 'boolean';
    case 'Date':
      return 'date / datetime';
    case 'Location':
      return 'json';
    case 'Object':
      return 'json';
    case 'Link':
      return def.linkType === 'Asset' ? 'media (single)' : `relation -> ${linkTargets(def)}`;
    case 'Array':
      if (def.items?.linkType === 'Asset') return 'media (multiple)';
      if (def.items?.linkType === 'Entry') return `relation (many) -> ${linkTargets(def.items)}`;
      return 'json  ⚑ tag-like: consider promoting to a collection + relation';
    default:
      return 'json';
  }
}

function linkTargets(def) {
  const v = (def.validations || []).find((x) => x.linkContentType);
  return v ? v.linkContentType.join('|') : 'entry';
}

function main() {
  const argv = process.argv;
  let exportPath, outPath;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--export') exportPath = argv[++i];
    else if (argv[i] === '--out') outPath = argv[++i];
  }
  if (!exportPath) {
    console.error('Usage: node analyze.js --export <export.json> [--out migration.config.json]');
    process.exit(1);
  }

  const data = loadExport(exportPath);
  const locale = defaultLocale(data);

  // Count entries per content type.
  const counts = {};
  for (const e of data.entries) {
    const id = entryContentTypeId(e);
    counts[id] = (counts[id] || 0) + 1;
  }

  const config = { locale, types: {}, promote: {} };

  console.log(`\nMigration plan  (locale: ${locale})`);
  console.log(`${data.contentTypes.length} content types · ${data.entries.length} entries · ${data.assets.length} assets\n`);

  for (const ct of data.contentTypes) {
    const id = ct.sys.id;
    const n = counts[id] || 0;
    const singleCandidate = n === 1;
    const kind = singleCandidate ? 'single?' : 'collection';
    config.types[id] = {
      singularName: kebab(id),
      pluralName: pluralApiId(id),
      displayName: ct.name,
      kind: singleCandidate ? 'single' : 'collection',
    };

    console.log(`■ ${ct.name}  (id: ${id}) — ${n} entr${n === 1 ? 'y' : 'ies'} → ${pluralApiId(id)} [${kind}]`);
    if (singleCandidate) console.log(`    ⚑ only one entry — likely a Strapi SINGLE type (confirm in config)`);
    for (const f of ct.fields) {
      const proposed = proposeStrapi(f);
      console.log(`    - ${f.id}: ${f.type}${f.linkType ? `<${f.linkType}>` : ''}  →  ${proposed}`);
      if (f.type === 'Array' && f.items?.type === 'Symbol') {
        // suggest promoting this tag-like field to its own collection + relation
        const singular = kebab(f.id).replace(/s$/, '');
        config.promote[f.id] = config.promote[f.id] || {
          singularName: singular,
          pluralName: pluralApiId(singular),
          displayName: singular.charAt(0).toUpperCase() + singular.slice(1),
          titleField: 'title',
        };
      }
    }
    console.log('');
  }

  console.log('Legend: ⚑ = a decision to confirm in migration.config.json before generating schema.\n');
  console.log('Next: review the config below, set kinds/promotions, then generate the Strapi');
  console.log('content types and run the migration.\n');
  console.log(JSON.stringify(config, null, 2));

  if (outPath) {
    writeFileSync(outPath, JSON.stringify(config, null, 2) + '\n');
    console.log(`\nWrote starter config → ${outPath}`);
  }
}

main();
