import 'dotenv/config';
import path from 'node:path';
import {
  loadExport,
  defaultLocale,
  field,
  entriesOfType,
  linkId,
  linkIds,
} from './lib/contentful.js';
import { richTextToBlocks } from './lib/richtext.js';
import { migrateAssets } from './lib/assets.js';
import { StrapiClient } from './lib/strapi.js';

/**
 * Contentful content type id  ->  Strapi plural API id.
 * Edit this map (and the field builders below) to match your own model.
 */
const COLLECTION = {
  author: 'authors',
  category: 'categories',
  blogPost: 'blog-posts',
};
const LANDING_PAGE_SINGLE = 'landing-page';

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--export') args.export = argv[++i];
    else if (a === '--assets-dir') args.assetsDir = argv[++i];
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

async function main() {
  const args = parseArgs(process.argv);
  const exportPath = args.export || process.env.CONTENTFUL_EXPORT || './sample-data/export.json';
  const assetsDir = args.assetsDir || process.env.CONTENTFUL_ASSETS_DIR || path.dirname(exportPath);

  const strapi = new StrapiClient({
    baseUrl: process.env.STRAPI_URL || 'http://localhost:1337',
    token: requireEnv('STRAPI_API_TOKEN'),
  });

  const data = loadExport(exportPath);
  const locale = process.env.CONTENTFUL_LOCALE || defaultLocale(data);
  console.log(`Loaded export: ${data.entries.length} entries, ${data.assets.length} assets (locale ${locale})`);

  // Maps used to wire relations in pass 2. Contentful id -> Strapi documentId.
  const idMap = { author: new Map(), category: new Map(), blogPost: new Map() };
  const counts = { assets: 0, authors: 0, categories: 0, posts: 0, landingPage: 0 };

  // --- Pass 0: assets ------------------------------------------------------
  console.log('\n[0/3] Migrating assets...');
  const assetMap = await migrateAssets(data.assets, {
    strapi,
    assetsDir,
    locale,
    log: console.log,
  });
  counts.assets = assetMap.size;

  // Resolve a Contentful asset id to the full Strapi media object — the Blocks
  // rich-text converter embeds it directly in image blocks.
  const resolveAsset = (cfAssetId) => assetMap.get(cfAssetId) ?? null;

  // Idempotent create-or-update keyed by contentfulId.
  async function upsert(plural, contentfulId, payload) {
    const existing = await strapi.findByContentfulId(plural, contentfulId);
    if (existing) return strapi.update(plural, existing.documentId, payload);
    return strapi.create(plural, payload);
  }

  // A single media field in Strapi v5 is set with the numeric file id directly
  // (unlike entry relations, which use { connect: [documentId] }).
  function mediaValue(cfAssetId) {
    const a = cfAssetId ? assetMap.get(cfAssetId) : null;
    return a ? a.id : undefined;
  }

  // --- Pass 1: entries without cross-entry relations -----------------------
  console.log('\n[1/3] Migrating authors, categories, posts (no relations yet)...');

  for (const entry of entriesOfType(data, 'author')) {
    const cfId = entry.sys.id;
    const rec = await upsert(COLLECTION.author, cfId, {
      name: field(entry, 'name', locale),
      bio: field(entry, 'bio', locale),
      avatar: mediaValue(linkId(field(entry, 'avatar', locale))),
      contentfulId: cfId,
    });
    idMap.author.set(cfId, rec.documentId);
    counts.authors++;
  }

  for (const entry of entriesOfType(data, 'category')) {
    const cfId = entry.sys.id;
    const rec = await upsert(COLLECTION.category, cfId, {
      title: field(entry, 'title', locale),
      slug: field(entry, 'slug', locale),
      description: field(entry, 'description', locale),
      contentfulId: cfId,
    });
    idMap.category.set(cfId, rec.documentId);
    counts.categories++;
  }

  for (const entry of entriesOfType(data, 'blogPost')) {
    const cfId = entry.sys.id;
    const body = richTextToBlocks(field(entry, 'body', locale), { resolveAsset });
    const rec = await upsert(COLLECTION.blogPost, cfId, {
      title: field(entry, 'title', locale),
      slug: field(entry, 'slug', locale),
      excerpt: field(entry, 'excerpt', locale),
      body,
      coverImage: mediaValue(linkId(field(entry, 'coverImage', locale))),
      publishedDate: field(entry, 'publishedDate', locale),
      tags: field(entry, 'tags', locale),
      contentfulId: cfId,
    });
    idMap.blogPost.set(cfId, rec.documentId);
    counts.posts++;
  }

  // --- Pass 2: wire relations now that every entry has a documentId --------
  console.log('\n[2/3] Linking relations (author, category, featured posts)...');

  for (const entry of entriesOfType(data, 'blogPost')) {
    const cfId = entry.sys.id;
    const documentId = idMap.blogPost.get(cfId);
    if (!documentId) continue;

    const authorCfId = linkId(field(entry, 'author', locale));
    const categoryCfId = linkId(field(entry, 'category', locale));

    const relations = {};
    if (authorCfId && idMap.author.has(authorCfId)) {
      relations.author = { set: [idMap.author.get(authorCfId)] };
    }
    if (categoryCfId && idMap.category.has(categoryCfId)) {
      relations.category = { set: [idMap.category.get(categoryCfId)] };
    }
    if (Object.keys(relations).length) {
      await strapi.update(COLLECTION.blogPost, documentId, relations);
    }
  }

  // --- Landing page (single type) ------------------------------------------
  console.log('\n[3/3] Migrating landing page...');
  const landing = entriesOfType(data, 'landingPage')[0];
  if (landing) {
    const featuredCfIds = linkIds(field(landing, 'featuredPosts', locale));
    const featuredDocIds = featuredCfIds.map((id) => idMap.blogPost.get(id)).filter(Boolean);
    await strapi.putSingle(LANDING_PAGE_SINGLE, {
      heroTitle: field(landing, 'heroTitle', locale),
      heroSubtitle: field(landing, 'heroSubtitle', locale),
      heroImage: mediaValue(linkId(field(landing, 'heroImage', locale))),
      featuredPosts: { set: featuredDocIds },
      contentfulId: landing.sys.id,
    });
    counts.landingPage = 1;
  }

  // --- Summary -------------------------------------------------------------
  console.log('\nMigration complete:');
  console.table(counts);
}

main().catch((err) => {
  console.error('\nMigration failed:', err.message);
  process.exit(1);
});
