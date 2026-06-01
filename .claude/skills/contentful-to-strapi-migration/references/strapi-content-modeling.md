# Strapi content modeling — best practices (for migration decisions)

Use this when deriving Strapi content types from a Contentful export. Contentful models
composition mostly with **references** (and rich-text embedded entries); Strapi has richer
modeling primitives, so part of a good migration is choosing the *right* primitive rather
than porting one-to-one.

## The building blocks

- **Collection type** — many entries of the same shape (blog posts, authors, products).
  Addressable via `/api/<plural>`, can be related to.
- **Single type** — exactly one entry, site-wide (homepage, global settings, footer).
  Addressable via `/api/<singular>`.
- **Component** — a reusable *group of fields* that lives **inside** a type (or another
  component). Not addressable on its own; its data is stored inline with the parent. Can be
  **repeatable** (a list) or non-repeatable (a single group).
- **Dynamic zone** — an ordered, **mixed** list of components: each item can be a different
  component type. For flexible, page-builder-style layouts where authors compose a page from
  varied sections.
- **Relation** — a link between content types: `oneToOne`, `oneToMany`, `manyToOne`,
  `manyToMany`, plus one-way variants. Two-way (`inversedBy`/`mappedBy`) when you query from
  both sides; one-way when only one direction is needed.
- **Field types** — `string`, `text`, `richtext` (Markdown), **`blocks`** (native rich-text
  editor), `uid` (slugs), `integer`/`decimal`, `boolean`, `date`/`datetime`, `enumeration`,
  `json`, `email`, `media` (single or multiple).

## Decision guide: which primitive?

- **A standalone thing that's reused and queried on its own** (author, category, tag,
  product) → **collection type** + a **relation** to it. Not a component.
- **A group of fields that repeats or is reused but isn't its own entity** (SEO metadata, an
  address, a call-to-action button, a hero) → **component** (repeatable if it's a list).
- **A page built from varied, reorderable sections** (hero, then text, then gallery, then
  FAQ, in any order) → **dynamic zone** of components.
- **Exactly one instance site-wide** (homepage, global config) → **single type**.
- **Formatted long-form text** → **`blocks`** (native editor; what this skill migrates rich
  text into) or `richtext` (Markdown) if you prefer a portable string.
- **One or more files** → **`media`** (set `multiple` accordingly).
- **A slug** → **`uid`** with `targetField` pointing at the title/name.

## Mapping Contentful constructs → Strapi

| In Contentful | Usually becomes in Strapi |
|---|---|
| Reference to a reusable, standalone entry (author, category) | **relation** to a collection type |
| Reference to a "block"/"section" entry used only to compose one parent, not reused | **component** (or a **dynamic-zone** item if the parent mixes section types) |
| A field group repeated on a type | **repeatable component** |
| Rich text with embedded entries/assets | **`blocks`** (assets become image blocks; structured "sections" embedded in body may be better as a **dynamic zone**) |
| Modular/flexible page composed of mixed reference types | **dynamic zone** of components |
| `Object` / JSON field | **`json`** |
| A single special entry (homepage, settings) | **single type** |

Always: add a **`contentfulId`** string field to every migrated type so the import is
idempotent (re-runs update instead of duplicating).

## Gotchas

- **Components are inline copies, not shared records.** If two entries need to point at the
  *same* shared data, use a **relation** to a collection type — not a component (a component's
  data is duplicated per parent).
- **Dynamic zones add query + migration complexity.** You must populate each component type
  explicitly, and your migration has to build the right component shapes. If every section is
  the same shape, a **repeatable component** is simpler than a dynamic zone.
- **Don't over-model.** If a Contentful reference is just "this post has one author," that's a
  plain relation — reach for components/dynamic zones only when content is genuinely
  composed of reusable or mixed blocks.
- **Keep it queryable.** Anything you'll filter, sort, or link by should be its own
  collection type (so it has a `documentId` and an API), not a component buried in another
  entry.
