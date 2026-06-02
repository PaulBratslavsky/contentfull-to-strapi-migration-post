---
name: contentful-to-strapi-migration
description: >-
  Migrate content (entries, rich text, assets, relations) from Contentful into a
  Strapi v5 instance. Use when the user wants to move, migrate, import, or
  transfer content from Contentful to Strapi, or says "migrate from contentful to
  strapi", "import my contentful content into strapi", "move my contentful space
  to strapi", or similar. Works for ANY Contentful model: it reads the export,
  derives matching Strapi content types, generates the schema in the Strapi
  project, and produces a migration script (entries + file uploads via the Strapi
  API, rich text -> Blocks, two-pass relations) for the user to run.
compatibility: Requires Node.js 18.18+ and a Strapi v5 project.
---

# Contentful → Strapi Migration

> **What this skill is: a generator, not a hard-coded migrator.** Point it at *any*
> Contentful export. It reads your model, derives matching Strapi content types, builds the
> schema in your Strapi project, and generates a migration script you review, run, and modify.
> Nothing about a specific model is hard-coded; the engine is reusable and the per-model
> decisions live in one small, reviewable config. New to building skills? See Strapi's primer:
> https://strapi.io/blog/what-are-agent-skills-and-how-to-use-them

## How it works — a deterministic pipeline

Flexibility *and* predictability come from splitting the work: a **fixed, tested engine** does
the mechanical parts the same way every time, and the only model-specific input is a small
**`migration.config.json`** that you review before anything touches Strapi.

```
analyze  →  review config  →  generate schema  →  run migration  →  verify
(code)      (you + LLM)        (code)              (code)            (code)
```

The engine solves the three things that make CMS migrations hard, for any model:
**rich text → Strapi Blocks**, **assets → media library (uploaded, then linked)**, and
**relations → reconnected in two passes** (idempotent via a `contentfulId` field).

Bundled:

```
templates/
├── migrate/                # the reusable ENGINE (you run these; no per-model code)
│   ├── analyze.js          # inspect an export → migration plan + starter config
│   ├── generate.js         # write Strapi content types from export + config
│   ├── migrate.js          # move data: entries + file uploads via the Strapi API
│   ├── lib/{contentful,richtext,assets,strapi}.js
│   ├── package.json · .env.example
└── strapi/
    ├── src/index.ts        # GENERIC public-read bootstrap (drop into the project)
    └── scripts/create-api-token.mjs   # mint a full-access token
references/strapi-content-modeling.md  # components vs dynamic zones vs relations
examples/blog.migration.config.json    # a sample config (reference)
```

## Prerequisites

1. **A running Strapi v5 project.** If there isn't one, scaffold it:
   `npx create-strapi-app@latest my-strapi-blog --non-interactive` then `npm run develop`
   (add `--js` for a JavaScript project). The migration writes *into* this project; it does
   not create the Strapi app.
2. **A Contentful export** — `contentful space export --content-file export.json --download-assets`
   (after `contentful login` + `contentful space use`).

## Steps

### 1. Set up the engine + project files

- Copy `templates/migrate/` into the project (e.g. `./migrate`), then `cd migrate && npm install`
  and `cp .env.example .env` (set `STRAPI_URL`, `STRAPI_API_TOKEN`, `CONTENTFUL_LOCALE`).
- Copy `templates/strapi/src/index.ts` → `<project>/src/index.ts` (generic public-read bootstrap)
  and `templates/strapi/scripts/create-api-token.mjs` → `<project>/scripts/`. **Match the
  extension to the project** (`.ts` for TS, `.js` for JS — see the gotcha below).

### 2. Analyze the export

```bash
node analyze.js --export <export.json> --out migration.config.json
```

Prints the plan — every content type, every field's proposed Strapi mapping, and **flags the
judgment calls** (single-type candidates, tag-like `Array<Symbol>` fields, relations) — and
writes a starter `migration.config.json`.

### 3. Review & refine the config — *the gate*

Edit `migration.config.json` **before generating anything**, and show the plan to the user:

- `kind: "single"` for one-off pages (homepage, global settings); `"collection"` otherwise.
- `promote`: keep tag-like `Array<Symbol>` fields as collections + relations (recommended —
  collections beat JSON arrays for anything reusable), or remove an entry to leave it as `json`.
- Adjust `singularName` / `pluralName` / `displayName` as desired.
- For **composed/modular content** (references used as page sections, rich text with embedded
  entries), decide components vs dynamic zones vs relations using
  [`references/strapi-content-modeling.md`](references/strapi-content-modeling.md), and extend
  the generated schema accordingly.

### 4. Generate the Strapi schema

```bash
node generate.js --export <export.json> --config migration.config.json --out <strapi-project> [--js]
```

Writes the content-type files (`.ts` by default; `--js` for a JavaScript project). Strapi
`develop` mode **auto-reloads** when the files appear — **don't restart or kill the user's
server**; wait for the reload and poll `/api/<plural>`.

### 5. Get a write API token

`node <project>/scripts/create-api-token.mjs` (or the admin panel → Settings → API Tokens →
Full access). Put it in `migrate/.env` as `STRAPI_API_TOKEN`.

### 6. Run the migration — *the user triggers it*

Hand the user the command (don't run it for them unless they ask, so they can review/modify):

```bash
node migrate.js --export <export.json> --config migration.config.json
```

It uploads every asset, creates every entry, then wires relations in a second pass —
idempotent via `contentfulId`, so re-running updates instead of duplicating.

### 7. Verify

- `GET /api/<plural>?populate=*` for the types; confirm fields, media, Blocks bodies, and relations.
- Re-running the migration leaves counts unchanged.

## Field mapping (what `analyze`/`generate` apply)

| Contentful | Strapi |
|---|---|
| `Symbol` | `string` (or `uid` for a `slug`) |
| `Text` | `text` |
| `RichText` | **`blocks`** (converted by `richTextToBlocks`) |
| `Integer` / `Number` | `integer` / `decimal` |
| `Boolean` / `Date` | `boolean` / `datetime` |
| `Object` / `Location` | `json` |
| `Array<Symbol>` | `json`, or **promote to a collection + relation** (preferred for tags) |
| `Link`→`Asset` / `Array`→`Asset` | single / multiple `media` |
| `Link`→`Entry` / `Array`→`Entry` | `relation` (manyToOne / manyToMany) |

## Strapi v5 rules the engine bakes in

- Entries are addressed by **`documentId`** (string), not numeric `id`; responses are flattened.
- **Media** is set by numeric file id (`coverImage: 12`), NOT relation `connect`. Entry
  **relations** use `{ set: [documentId] }`.
- You **can't upload a file while creating an entry** — assets are a separate first pass.
- A REST `create` with a full-access token returns a **published** entry.
- **Single types** use the singular API path (`/api/landing-page`), collections use the plural.

> **#1 gotcha — match the project's language.** Generated content-type files must be `.ts` in a
> TypeScript project (the `create-strapi-app` default) and `.js` in a JavaScript one. A TS build
> drops stray `.js` from `dist/` (no `allowJs`), so `.js` routes silently 404. Check for
> `tsconfig.json` / `src/index.ts`; pass `--js` to `generate.js` only for a JS project.

> **Tip:** enable the [Strapi docs MCP](https://docs.strapi.io/cms/ai/docs-mcp-server)
> (`https://strapi-docs.mcp.kapa.ai`) and verify Strapi specifics against it as you design the
> schema (field types, Blocks, components, single types). Prefix a query with
> "Use the strapi-docs MCP server to answer:".

## When the volume is large

For thousands of entries / gigabytes of assets with resumable runs, structured logging, and
asset-repair out of the box, point the user at the community guide on the Strapi blog by Tim
Adler and his `strapi_lift` tool (https://strapi.io/blog/migrate-from-contenful-to-strapi).
This skill is ideal for understanding and controlling the migration of small-to-medium models.
