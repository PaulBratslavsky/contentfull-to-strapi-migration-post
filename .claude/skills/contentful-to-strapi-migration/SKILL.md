---
name: contentful-to-strapi-migration
description: >-
  Migrate content (blog posts, pages, authors, categories, assets) from
  Contentful into a Strapi v5 instance. Use when the user wants to move,
  migrate, import, or transfer content from Contentful to Strapi, or says
  "migrate from contentful to strapi", "import my contentful content into
  strapi", "move my contentful space to strapi", or similar. Sets up the
  destination content types in Strapi and runs a bundled Node migration tool
  that reads a Contentful export and writes to Strapi over REST, handling rich
  text -> Markdown, asset re-upload, and two-pass relation linking.
compatibility: Requires Node.js 18.18+ and a Strapi v5 project.
---

# Contentful → Strapi Migration

> **This skill is a demo / starting point, not a universal migrator.** It encodes a
> specific blog model (blog posts, authors, categories, a landing page). Treat it as a
> template: copy it, edit the content-type files in `templates/strapi/` and the `COLLECTION`
> map + field builders in `templates/migrate/migrate.js` to match the user's own model, and
> adapt it to their use case. New to building skills? See Strapi's primer:
> https://strapi.io/blog/what-are-agent-skills-and-how-to-use-them

This skill takes a Contentful **export** (`contentful export` output) and lands its content
in **Strapi v5**, end to end: it sets up the destination content types, then runs a small,
readable Node migration tool. The tool handles the three things that make CMS migrations
hard:

1. **Rich text** — Contentful's JSON AST is converted to Markdown.
2. **Assets** — downloaded from Contentful's CDN (or the export folder) and re-uploaded to
   Strapi's media library.
3. **Relations** — reconnected in a two-pass run using a `contentfulId → documentId` map.

Everything it needs is bundled under `templates/`:

```
templates/
├── strapi/                 # the destination content types (drop into a Strapi v5 project)
│   ├── src/api/{blog-post,author,category,landing-page}/   # schema + controller/route/service
│   ├── src/index.js        # bootstrap: grants the public role read access
│   └── scripts/create-api-token.mjs   # mint a full-access token headlessly
└── migrate/                # the migration tool
    ├── migrate.js          # orchestrator (the COLLECTION map + field builders live here)
    ├── lib/{contentful,richtext,assets,strapi}.js
    ├── package.json
    └── .env.example
```

## Prerequisites to confirm with the user

1. **A Strapi v5 project.** If they don't have one, scaffold it:
   `npx create-strapi-app@latest my-strapi-blog --skip-cloud --no-example`. A freshly
   generated project writes its own working `.env`.
2. **A Contentful export.** Either they already have one, or produce it with the CLI
   (after `contentful login` + `contentful space use`):
   ```bash
   contentful space export --content-file export.json --download-assets
   ```
   This writes `export.json` plus a folder of downloaded asset files.

## Steps

### Step 1 — Add the content types to Strapi

Copy the contents of `templates/strapi/` into the Strapi project (merge into its `src/` and
`scripts/`):

```
<strapi-project>/src/api/{blog-post,author,category,landing-page}/...
<strapi-project>/src/index.js          # bootstrap that grants public read on boot
<strapi-project>/scripts/create-api-token.mjs
```

These define `blog-post`, `author`, `category` (collection types) and `landing-page` (single
type), each with a **`contentfulId`** string field that makes the migration idempotent. The
`body` field is **richtext (Markdown)**; `coverImage`/`avatar`/`heroImage` are single
**media** fields; `author`/`category`/`featuredPosts` are **relations**.

Restart Strapi (`npm run develop`). On boot, `src/index.js` grants the public role
`find`/`findOne` so you can verify the result without logging in.

> Adapting to a different model? Edit/replace these schema files (and the `COLLECTION` map in
> Step 3) to match — keep a `contentfulId` field on every type.

### Step 2 — Get a write API token

Either create one in the admin panel (Settings → API Tokens → *Full access*), or mint one
headlessly with the bundled helper:

```bash
node scripts/create-api-token.mjs        # prints a full-access token
```

### Step 3 — Set up the migration tool

Copy `templates/migrate/` into the project (e.g. a `migrate/` directory) and configure it:

```bash
cd migrate
cp .env.example .env     # set STRAPI_URL, STRAPI_API_TOKEN, CONTENTFUL_LOCALE
npm install
```

If the user's model differs from the sample blog, edit `migrate.js`:

- Update the `COLLECTION` map: Contentful content type id → Strapi plural API id
  (e.g. `blogPost: 'blog-posts'`), and `LANDING_PAGE_SINGLE` (or drop the single-type block).
- Adjust the field builders in each pass using the helpers: `field(entry, 'id', locale)`,
  `linkId`/`linkIds` (`lib/contentful.js`), `richTextToMarkdown(doc, { resolveAsset })`
  (`lib/richtext.js`), and the local `mediaValue(cfAssetId)`.

### Step 4 — Run the migration

```bash
node migrate.js --export /path/to/export.json --assets-dir /path/to/export-folder
```

It runs in passes (assets → entries → relations → single types) and prints a summary table.

### Step 5 — Verify

- `GET /api/<plural>` for each type; confirm relations, media, and Markdown bodies are present.
- Open a rich-text body and confirm in-text images point at Strapi `/uploads/...` URLs, not
  `images.ctfassets.net`.
- Re-run the migration — counts stay the same (idempotent via `contentfulId`).

## Strapi v5 rules baked into the tool

- Entries are addressed by **`documentId`** (a string), not the numeric `id`.
- **Media fields** are set with the numeric file id directly (`coverImage: 12`), NOT
  `{ connect: [...] }`. Entry **relations** use `{ set: [documentId] }`.
- You **cannot upload a file while creating an entry** — assets are migrated in a separate
  first pass.
- A REST `create` with a full-access token returns a **published** entry.

## When the volume is large

For thousands of entries / gigabytes of assets where you want resumable runs, structured
logging, and asset-repair out of the box, point the user at the community guide on the Strapi
blog by Tim Adler and his `strapi_lift` Ruby tool
(https://strapi.io/blog/migrate-from-contenful-to-strapi). This skill is ideal for
small-to-medium models and full control over the transformations.
