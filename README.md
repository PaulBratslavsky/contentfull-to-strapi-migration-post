# Migrating a blog from Contentful to Strapi

A runnable, end-to-end example for the post **[migration-guide.md](./migration-guide.md)**.

It moves a blog — landing page, blog posts, authors, categories, and images — from
**Contentful** (source) into **Strapi v5** (destination):

- rich text becomes Markdown,
- assets are re-uploaded into Strapi's media library, and
- relations are reconnected in a two-pass migration.

> **Note on the folder name:** this directory is called
> `how-to-migrate-from-strapi-to-contenful`, but the tutorial goes the other way —
> **Contentful → Strapi**. The name is just a typo'd slug; the content is correct.

## Layout

```
playground/
├── strapi-server/     # DESTINATION — Strapi v5 (blog-post, author, category, landing-page)
├── contentful-seed/   # SOURCE — scripts to build + seed a sample Contentful space
└── migrate/           # the migration tool (reads a Contentful export, writes to Strapi)
```

## Quick start (run the migration with zero Contentful setup)

The `migrate/` tool ships with a sample Contentful **export** (`migrate/sample-data/`),
so you can see the whole pipeline work without a Contentful account.

```bash
# 1. Start the destination
cd playground/strapi-server
npm install
npm run develop          # http://localhost:1337  (create an admin on first run)

# 2. Get a write API token (either create one in the admin panel under
#    Settings → API Tokens → "Full access", or mint one headlessly:)
node scripts/create-api-token.mjs    # prints a token

# 3. Run the migration against the bundled sample export
cd ../migrate
npm install
cp .env.example .env     # paste STRAPI_API_TOKEN from step 2
npm run migrate:sample
```

Then check the result:

```bash
curl http://localhost:1337/api/blog-posts        # 3 posts, with author/category/cover
curl http://localhost:1337/api/landing-page      # hero + featured posts
```

## Full path (use your own Contentful space)

To reproduce the source data in a real Contentful space and migrate that instead:

```bash
cd playground/contentful-seed
npm install
cp .env.example .env     # CONTENTFUL_SPACE_ID + a Content Management token

npm run model            # creates the content types (contentful-migration DSL)
npm run seed             # uploads images + creates/publishes the sample entries
npm run export           # writes ../migrate/sample-data/export.json + downloads assets
```

Now run the migration as above — it will pick up your exported `export.json`.

To migrate a **different** Contentful space, point the tool at any export:

```bash
cd playground/migrate
node migrate.js --export /path/to/export.json --assets-dir /path/to/export-dir
```

## Re-running is safe

Every Strapi record stores its originating `contentfulId`. Re-running the migration
updates the matching record instead of creating a duplicate, and assets already in the
media library (matched by file name) are reused.

## Requirements

- Node.js 18.18+ (uses the built-in `fetch`, `FormData`, and `Blob`)
- For the full path: a free Contentful account + a Content Management API token
# contentfull-to-strapi-migration-post
