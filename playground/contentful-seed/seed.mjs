/**
 * Seed a Contentful space with the sample blog: authors, categories, posts
 * (with rich text + cover images), and a landing page.
 *
 * Prerequisite: the content model exists. Create it first with
 *   npm run model      (runs migrations/001-blog-model.js via the Contentful CLI)
 *
 * Credentials are auto-discovered, easiest first:
 *   1. After `contentful login` + `contentful space use --space-id <id>`, this
 *      script reads the CLI's stored ~/.contentfulrc.json — nothing to paste.
 *   2. Or set CONTENTFUL_SPACE_ID + CONTENTFUL_MANAGEMENT_TOKEN in a .env file
 *      (handy for CI). Env vars win over the CLI config.
 *
 * Then:  npm run seed
 *
 * Re-running is safe: entries/assets use deterministic ids, so an existing one
 * is updated instead of duplicated.
 */
import 'dotenv/config';
import { deflateSync } from 'node:zlib';
import { homedir } from 'node:os';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import contentful from 'contentful-management';

const LOCALE = 'en-US';

/**
 * `contentful login` stores a generated CMA token, and `contentful space use`
 * stores the active space, in .contentfulrc.json (cwd first, then home dir).
 * We read that so the common path needs no manual token copying.
 */
function cliConfig() {
  for (const p of [join(process.cwd(), '.contentfulrc.json'), join(homedir(), '.contentfulrc.json')]) {
    if (existsSync(p)) {
      try {
        return JSON.parse(readFileSync(p, 'utf8'));
      } catch {
        /* ignore malformed config */
      }
    }
  }
  return {};
}

const cli = cliConfig();
const SPACE_ID = process.env.CONTENTFUL_SPACE_ID || cli.activeSpaceId;
const ENVIRONMENT_ID =
  process.env.CONTENTFUL_ENVIRONMENT_ID || cli.activeEnvironmentId || 'master';
const TOKEN = process.env.CONTENTFUL_MANAGEMENT_TOKEN || cli.managementToken;

if (!SPACE_ID || !TOKEN) {
  console.error(
    'Could not find Contentful credentials.\n' +
      'Easiest: run `contentful login` then `contentful space use --space-id <id>`.\n' +
      'Or set CONTENTFUL_SPACE_ID and CONTENTFUL_MANAGEMENT_TOKEN in a .env file.'
  );
  process.exit(1);
}

// --- placeholder image generation (so the seed needs no binary fixtures) ---
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
};
function solidPng(w, h, [r, g, b]) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const rowLen = w * 3 + 1;
  const raw = Buffer.alloc(rowLen * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = y * rowLen + 1 + x * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- rich text builders ----------------------------------------------------
const text = (value, marks = []) => ({ nodeType: 'text', value, marks: marks.map((type) => ({ type })), data: {} });
const para = (...content) => ({ nodeType: 'paragraph', data: {}, content });
const heading = (level, value) => ({ nodeType: `heading-${level}`, data: {}, content: [text(value)] });
const li = (...content) => ({ nodeType: 'list-item', data: {}, content });
const ul = (...items) => ({ nodeType: 'unordered-list', data: {}, content: items });
const ol = (...items) => ({ nodeType: 'ordered-list', data: {}, content: items });
const quote = (...content) => ({ nodeType: 'blockquote', data: {}, content });
const link = (uri, value) => ({ nodeType: 'hyperlink', data: { uri }, content: [text(value)] });
const embeddedAsset = (assetId) => ({
  nodeType: 'embedded-asset-block',
  data: { target: { sys: { type: 'Link', linkType: 'Asset', id: assetId } } },
  content: [],
});
const doc = (...content) => ({ nodeType: 'document', data: {}, content });

// --- the sample content ----------------------------------------------------
const ASSETS = [
  { id: 'asset-hero', file: 'hero.png', title: 'Hero background', color: [37, 99, 235], size: [1200, 600] },
  { id: 'asset-cover-astro', file: 'astro-cover.png', title: 'Astro cover', color: [124, 58, 237], size: [800, 450] },
  { id: 'asset-cover-strapi', file: 'strapi-cover.png', title: 'Strapi cover', color: [16, 185, 129], size: [800, 450] },
  { id: 'asset-cover-contentful', file: 'contentful-cover.png', title: 'Migration cover', color: [234, 88, 12], size: [800, 450] },
  { id: 'asset-diagram', file: 'architecture-diagram.png', title: 'Migration architecture diagram', color: [100, 116, 139], size: [900, 500] },
  { id: 'asset-avatar-jane', file: 'jane.png', title: 'Jane Doe avatar', color: [219, 39, 119], size: [256, 256] },
  { id: 'asset-avatar-sam', file: 'sam.png', title: 'Sam Rivera avatar', color: [13, 148, 136], size: [256, 256] },
];

const AUTHORS = [
  { id: 'author-jane', name: 'Jane Doe', bio: 'Jane is a frontend engineer who writes about the modern web and headless CMSes.', avatar: 'asset-avatar-jane' },
  { id: 'author-sam', name: 'Sam Rivera', bio: 'Sam is a backend developer focused on APIs, content modeling, and developer experience.', avatar: 'asset-avatar-sam' },
];

const CATEGORIES = [
  { id: 'cat-tutorials', title: 'Tutorials', slug: 'tutorials', description: 'Step-by-step guides.' },
  { id: 'cat-headless', title: 'Headless CMS', slug: 'headless-cms', description: 'Notes on content infrastructure.' },
  { id: 'cat-migration', title: 'Migration', slug: 'migration', description: 'Moving content between platforms.' },
];

const POSTS = [
  {
    id: 'post-astro',
    title: 'Getting Started with Astro',
    slug: 'getting-started-with-astro',
    excerpt: 'Astro ships zero JavaScript by default. Here is why that matters.',
    publishedDate: '2026-01-11',
    tags: ['astro', 'frontend', 'performance'],
    coverImage: 'asset-cover-astro',
    author: 'author-jane',
    category: 'cat-tutorials',
    body: doc(
      heading(2, 'Why Astro?'),
      para(
        text('Astro renders to '),
        text('static HTML', ['bold']),
        text(' and only hydrates the interactive bits. Read the '),
        link('https://docs.astro.build', 'official docs'),
        text(' for the details.')
      ),
      ul(li(para(text('Zero JS by default'))), li(para(text('Bring your own framework')))),
      para(text('It pairs nicely with any headless CMS.'))
    ),
  },
  {
    id: 'post-strapi',
    title: 'Why We Chose Strapi',
    slug: 'why-we-chose-strapi',
    excerpt: 'An open-source, self-hostable headless CMS with a great developer experience.',
    publishedDate: '2026-01-12',
    tags: ['strapi', 'headless', 'open-source'],
    coverImage: 'asset-cover-strapi',
    author: 'author-sam',
    category: 'cat-headless',
    body: doc(
      para(text('We wanted to own our data and our API. Strapi let us do both.')),
      heading(3, 'The deciding factors'),
      ol(li(para(text('Self-hosting'))), li(para(text('A customizable REST and GraphQL API')))),
      quote(para(text('Owning the backend changed how we ship.', ['italic'])))
    ),
  },
  {
    id: 'post-migration',
    title: 'Migrating from Contentful to Strapi',
    slug: 'migrating-from-contentful-to-strapi',
    excerpt: 'How we moved posts, authors, categories and assets without downtime.',
    publishedDate: '2026-01-13',
    tags: ['migration', 'strapi', 'contentful'],
    coverImage: 'asset-cover-contentful',
    author: 'author-jane',
    category: 'cat-migration',
    body: doc(
      para(text('The migration runs in '), text('two passes', ['bold']), text(': create everything, then wire up relations.')),
      embeddedAsset('asset-diagram'),
      para(text("Rich text becomes Markdown and assets are re-uploaded to Strapi's "), text('media library', ['code']), text('.'))
    ),
  },
];

const LANDING = {
  id: 'landing-home',
  heroTitle: 'The Headless Blog',
  heroSubtitle: 'Tutorials and notes on the modern web, now powered by Strapi.',
  heroImage: 'asset-hero',
  featuredPosts: ['post-migration', 'post-astro'],
};

// --- helpers to create-or-update + publish ---------------------------------
const assetLink = (id) => ({ sys: { type: 'Link', linkType: 'Asset', id } });
const entryLink = (id) => ({ sys: { type: 'Link', linkType: 'Entry', id } });
const loc = (value) => ({ [LOCALE]: value });

async function upsertEntry(env, contentTypeId, id, fields) {
  const localized = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, loc(v)]));
  let entry;
  try {
    entry = await env.getEntry(id);
    entry.fields = localized;
    entry = await entry.update();
  } catch (err) {
    if (err.name !== 'NotFound') throw err;
    entry = await env.createEntryWithId(contentTypeId, id, { fields: localized });
  }
  if (!entry.isPublished() || entry.isUpdated()) entry = await entry.publish();
  return entry;
}

async function upsertAsset(env, def) {
  let asset;
  try {
    asset = await env.getAsset(def.id);
  } catch (err) {
    if (err.name !== 'NotFound') throw err;
    const png = solidPng(def.size[0], def.size[1], def.color);
    asset = await env.createAssetFromFiles({
      fields: {
        title: loc(def.title),
        description: loc(def.title),
        file: loc({ contentType: 'image/png', fileName: def.file, file: png }),
      },
    });
    asset = await asset.processForAllLocales();
  }
  if (!asset.isPublished()) asset = await asset.publish();
  return asset;
}

async function main() {
  const client = contentful.createClient({ accessToken: TOKEN });
  const space = await client.getSpace(SPACE_ID);
  const env = await space.getEnvironment(ENVIRONMENT_ID);

  console.log('Uploading assets...');
  for (const a of ASSETS) {
    await upsertAsset(env, a);
    console.log('  +', a.file);
  }

  console.log('Creating authors...');
  for (const a of AUTHORS) {
    await upsertEntry(env, 'author', a.id, { name: a.name, bio: a.bio, avatar: assetLink(a.avatar) });
  }

  console.log('Creating categories...');
  for (const c of CATEGORIES) {
    await upsertEntry(env, 'category', c.id, { title: c.title, slug: c.slug, description: c.description });
  }

  console.log('Creating blog posts...');
  for (const p of POSTS) {
    await upsertEntry(env, 'blogPost', p.id, {
      title: p.title,
      slug: p.slug,
      excerpt: p.excerpt,
      body: p.body,
      coverImage: assetLink(p.coverImage),
      publishedDate: p.publishedDate,
      tags: p.tags,
      author: entryLink(p.author),
      category: entryLink(p.category),
    });
  }

  console.log('Creating landing page...');
  await upsertEntry(env, 'landingPage', LANDING.id, {
    heroTitle: LANDING.heroTitle,
    heroSubtitle: LANDING.heroSubtitle,
    heroImage: assetLink(LANDING.heroImage),
    featuredPosts: LANDING.featuredPosts.map(entryLink),
  });

  console.log('\nDone. Your Contentful space now has the sample blog.');
  console.log('Export it for the migration with:  npm run export');
}

main().catch((err) => {
  console.error('\nSeed failed:', err.message);
  process.exit(1);
});
