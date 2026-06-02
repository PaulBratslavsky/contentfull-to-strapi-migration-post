# Examples (reference only — not copied into a project)

- `blog.migration.config.json` — what `analyze.js` produces for the sample blog
  export: a `migration.config.json` mapping each Contentful content type to a
  Strapi type (single vs collection, api ids) and listing any tag-like fields to
  promote. Use it to see the config shape; your own config comes from running
  `analyze.js` against your export.
