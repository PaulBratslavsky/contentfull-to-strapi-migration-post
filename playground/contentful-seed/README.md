# Contentful starter (source space)

A reproducible Contentful **starter**: pull it, run two commands, and you get a sample
blog space — three posts, two authors, three categories, a landing page, and images —
that you can then migrate into Strapi following [the guide](../../migration-guide.md).

This is the *source* of the migration. The destination (a Strapi v5 project) and the tool
that moves content into it both live in the **`contentful-to-strapi-migration` skill** at
[`../../.claude/skills/contentful-to-strapi-migration`](../../.claude/skills/contentful-to-strapi-migration).

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
npm run export              # 3. export to ./export/export.json (+ downloaded assets)
```

All three scripts read the credentials the CLI stored — there's nothing to paste. (Prefer
explicit credentials, e.g. for CI? `cp .env.example .env` and set `CONTENTFUL_SPACE_ID` +
`CONTENTFUL_MANAGEMENT_TOKEN`; env values override the CLI config.)

After step 2, open your space in the Contentful web app and you'll see the seeded blog.
Step 3 produces `./export/export.json` (+ an asset folder) — that's what you point the
migration skill at.

## What's inside

- `migrations/001-blog-model.js` — the content model as code (`author`, `category`,
  `blogPost`, `landingPage`, plus a `product` collection so the example isn't blog-only).
- `seed.mjs` — creates and publishes the entries and assets via the
  `contentful-management` SDK. Self-contained: it generates its own placeholder images,
  so there are no binary fixtures to manage. Re-running updates existing records
  (deterministic ids) instead of duplicating them.

## Re-running

`npm run seed` is safe to run again. It reuses the same ids each time, so it updates
the existing entries and assets instead of creating duplicate ones.

`npm run model` is meant to run once per space. It creates the content types, and
Contentful refuses to create a type that already exists. Contentful also doesn't track
which migrations you've already run. So running `npm run model` a second time against
the same space fails with "Content type ... already exists." That's expected.

To add to the model on a space that already has it, write a small migration that creates
only the new pieces, and run that once. For example, `002-add-product.js` adds just the
`product` type:

```bash
contentful space migration --yes migrations/002-add-product.js
```

If you'd rather start clean, point the CLI at a brand-new space and run `npm run model`
there.
