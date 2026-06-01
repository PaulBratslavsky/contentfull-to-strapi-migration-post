# Contentful starter (source space)

A reproducible Contentful **starter**: pull it, run two commands, and you get a sample
blog space — three posts, two authors, three categories, a landing page, and images —
that you can then migrate into Strapi following [the guide](../../migration-guide.md).

This is the *source* of the migration. The destination is [`../strapi-server`](../strapi-server),
and the tool that moves content between them is [`../migrate`](../migrate).

## What you need

- A free [Contentful](https://www.contentful.com/) account and a space.
- A **Content Management API** token (Settings → API keys → Content management tokens →
  *Generate personal token*). A read-only Delivery token is not enough.

## Use it

```bash
npm install
cp .env.example .env        # set CONTENTFUL_SPACE_ID + CONTENTFUL_MANAGEMENT_TOKEN

npm run model               # 1. create the content types (contentful-migration DSL)
npm run seed                # 2. upload images + create/publish the sample entries
npm run export              # 3. export to ../migrate/sample-data/export.json (+ assets)
```

After step 2, open your space in the Contentful web app and you'll see the seeded blog.
Step 3 produces the `export.json` the migration reads.

## What's inside

- `migrations/001-blog-model.js` — the content model as code (`author`, `category`,
  `blogPost`, `landingPage`). Re-runnable against a fresh space.
- `seed.mjs` — creates and publishes the entries and assets via the
  `contentful-management` SDK. Self-contained: it generates its own placeholder images,
  so there are no binary fixtures to manage. Re-running updates existing records
  (deterministic ids) instead of duplicating them.

## Re-running is safe

Both the model migration and the seed are idempotent, so you can run them repeatedly
while you experiment.
