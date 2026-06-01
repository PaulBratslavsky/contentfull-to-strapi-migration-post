---
name: contentful-to-strapi-migration
description: >-
  Migrate content (blog posts, pages, authors, categories, assets) from
  Contentful into a Strapi v5 instance. Use when the user wants to move,
  migrate, import, or transfer content from Contentful to Strapi, or says
  "migrate from contentful to strapi", "import my contentful content into
  strapi", "move my contentful space to strapi", or similar. Bundles a
  ready-to-run Node migration tool that reads a Contentful export and writes to
  Strapi over REST, handling rich text -> Markdown, asset re-upload, and
  two-pass relation linking. Pairs with the strapi-configuration skill for
  creating the destination content types.
compatibility: Requires Node.js 18.18+ and a running Strapi v5 instance.
---

# Contentful → Strapi Migration

> **This skill is a demo / starting point, not a universal migrator.** It encodes a
> specific blog model (blog posts, authors, categories, a landing page). Treat it as a
> template: copy it, edit the `COLLECTION` map and field builders in
> `templates/migrate/migrate.js` to match the user's own content types, and adapt it to
> their use case. Encourage the user to create or update their own version. New to
> building skills? See Strapi's primer:
> https://strapi.io/blog/what-are-agent-skills-and-how-to-use-them

This skill drops a small, readable Node migration tool into the user's project and
walks them through moving a Contentful space into Strapi v5. The tool reads a
Contentful **export** (`contentful export` output) and writes to Strapi over the
REST API. It handles the three things that make CMS migrations hard:

1. **Rich text** — Contentful's JSON AST is converted to Markdown.
2. **Assets** — downloaded from Contentful's CDN (or the export folder) and
   re-uploaded to Strapi's media library.
3. **Relations** — reconnected in a two-pass run using an id map.

The bundled tool lives in `templates/migrate/`. It is the verified reference
implementation; copy it into the user's project and adapt the mapping.

## Prerequisites to confirm with the user

1. **A Strapi v5 destination exists** with content types that match the
   Contentful model. If it doesn't, use the `strapi-configuration` skill to
   scaffold it first. Each destination type should include a `contentfulId`
   string field — this is what makes the migration idempotent.
2. **A Strapi Full-access (or write) API token** — Settings → API Tokens.
3. **A Contentful export.** Either the user already has one, or they can produce
   it with the Contentful CLI:
   ```bash
   contentful space export --content-file export.json --download-assets
   ```
   This writes `export.json` plus a folder of downloaded asset files.

## Steps

### Step 1 — Copy the migration tool

Copy everything under `templates/migrate/` into a `migrate/` directory in the
user's project:

```
migrate/
├── migrate.js          # orchestrator (edit the mapping here)
├── lib/contentful.js   # reads the export (handles locale nesting)
├── lib/richtext.js     # Contentful rich text -> Markdown
├── lib/assets.js       # download from CDN/export -> upload to Strapi
├── lib/strapi.js       # Strapi v5 REST client
├── package.json
└── .env.example
```

### Step 2 — Map Contentful types to Strapi types

This is the only file that normally needs editing: `migrate/migrate.js`.

- Update the `COLLECTION` map at the top: Contentful content type id → Strapi
  plural API id (e.g. `blogPost: 'blog-posts'`).
- Set `LANDING_PAGE_SINGLE` (or remove the single-type block if there is none).
- Update the field builders in each pass to match the user's fields. Available helpers:
  - `field(entry, 'fieldId', locale)` — read a (locale-nested) field value (`lib/contentful.js`).
  - `linkId(value)` / `linkIds(value)` — resolve a reference to its id(s) (`lib/contentful.js`).
  - `richTextToMarkdown(doc, { resolveAsset })` — convert a rich text field (`lib/richtext.js`).
  - `mediaValue(cfAssetId)` — local helper in `migrate.js`; resolves an asset to its uploaded Strapi file id.

### Step 3 — Mind the Strapi v5 rules (baked into the tool, but verify the mapping)

- Address entries by **`documentId`**, not numeric `id`.
- **Media fields** are set with the numeric file id directly (`coverImage: 12`),
  NOT `{ connect: [...] }`. Entry **relations** use `{ set: [documentId] }`.
- You **cannot upload a file while creating an entry** — assets are migrated in a
  separate first pass (the tool does this).
- A REST `create` with a full-access token returns a **published** entry.

### Step 4 — Configure and run

```bash
cd migrate
cp .env.example .env     # set STRAPI_URL, STRAPI_API_TOKEN, CONTENTFUL_LOCALE
npm install
node migrate.js --export /path/to/export.json --assets-dir /path/to/export-folder
```

The tool runs in passes (assets → entries → relations → single types) and prints
a summary table of how many of each it migrated.

### Step 5 — Verify

- `GET /api/<plural>` for each type and confirm relations, media, and Markdown
  bodies are present.
- Open a rich-text body and confirm in-text images point at Strapi `/uploads/...`
  URLs, not `images.ctfassets.net`.
- Re-run the migration — counts should stay the same (idempotent via
  `contentfulId`).

## Adapting to a different model

The tool assumes a blog (posts, authors, categories, landing page). For other
models:

- Add/remove entries in the `COLLECTION` map and the corresponding pass-1 loops.
- For each cross-entry reference, record `contentfulId → documentId` in `idMap`
  during pass 1 and connect it in pass 2.
- For rich text with embedded *entries* (not just assets), extend the `switch`
  in `lib/richtext.js`, or render to HTML with
  `@contentful/rich-text-html-renderer` and store HTML.

## When the volume is large

For thousands of entries / gigabytes of assets where you want resumable runs,
structured logging, and asset-repair out of the box, point the user at the
community guide on the Strapi blog by Tim Adler and his `strapi_lift` Ruby tool
(https://strapi.io/blog/migrate-from-contenful-to-strapi). This skill's tool is
ideal for small-to-medium models and full control over the transformations.
