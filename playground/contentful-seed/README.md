# Contentful starter (source space)

A reproducible Contentful **starter**: pull it, run two commands, and you get a sample
blog space — three posts, two authors, three categories, a landing page, and images —
that you can then migrate into Strapi following [the guide](../../migration-guide.md).

This is the *source* of the migration. The destination is [`../strapi-server`](../strapi-server),
and the tool that moves content between them is [`../migrate`](../migrate).

## What you need

- A free [Contentful](https://www.contentful.com/) account and a space.
- The [Contentful CLI](https://www.contentful.com/developers/docs/tutorials/cli/),
  logged in. `contentful login` generates and stores a Content Management token for you —
  no manual token creation needed.

## Use it

```bash
# one-time auth: generates + stores a CMA token and your active space
npm install -g contentful-cli
contentful login
contentful space use --space-id <your-space-id>

npm install
npm run model               # 1. create the content types (contentful-migration DSL)
npm run seed                # 2. upload images + create/publish the sample entries
npm run export              # 3. export to ../migrate/sample-data/export.json (+ assets)
```

All three scripts read the credentials the CLI stored — there's nothing to paste. (Prefer
explicit credentials, e.g. for CI? `cp .env.example .env` and set `CONTENTFUL_SPACE_ID` +
`CONTENTFUL_MANAGEMENT_TOKEN`; env values override the CLI config.)

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
