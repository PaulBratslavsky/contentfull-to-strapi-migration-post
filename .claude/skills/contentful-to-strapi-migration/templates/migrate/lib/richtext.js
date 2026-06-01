/**
 * Convert a Contentful Rich Text document (a JSON AST) into Strapi's
 * **Rich text (Blocks)** format — the native block editor structure.
 *
 * Contentful stores rich text as a tree:
 *   { nodeType: "document", content: [ { nodeType: "paragraph", content: [...] }, ... ] }
 * Text nodes carry formatting in a `marks` array ([{ type: "bold" }, ...]).
 *
 * Strapi's Blocks field stores an ARRAY of block nodes, each with a `type` and
 * `children`. Block types: paragraph, heading (+level), list (+format) of
 * list-item, quote, code, image (+image media object); inline: text (with
 * bold/italic/underline/strikethrough/code flags) and link (+url). This walks
 * the Contentful tree and emits that shape.
 *
 * Embedded assets are the interesting case: the AST references the asset by id,
 * so we resolve it through `resolveAsset(id)` to the Strapi **media object** it
 * was re-uploaded to, and embed that in an `image` block.
 *
 * This is a compact, readable converter covering the nodes a typical blog body
 * uses. Migrating richer content (tables, embedded entries) is exactly the kind
 * of reshaping worth handing to Claude — extend the maps below for your model.
 */

// Contentful mark type -> Strapi text node flag.
const MARKS = { bold: 'bold', italic: 'italic', underline: 'underline', code: 'code' };

function textNode(node) {
  const t = { type: 'text', text: node.value ?? '' };
  for (const m of node.marks ?? []) {
    const flag = MARKS[m.type];
    if (flag) t[flag] = true;
  }
  return t;
}

/** Convert inline content (text + links) to Strapi inline children. */
function inlineChildren(nodes, ctx) {
  const out = [];
  for (const n of nodes ?? []) {
    if (n.nodeType === 'text') {
      out.push(textNode(n));
    } else if (n.nodeType === 'hyperlink') {
      out.push({ type: 'link', url: n.data?.uri ?? '', children: inlineChildren(n.content, ctx) });
    } else if (n.content) {
      out.push(...inlineChildren(n.content, ctx)); // flatten unknown inline wrappers
    }
  }
  // Strapi requires a non-empty children array with at least a text node.
  return out.length ? out : [{ type: 'text', text: '' }];
}

/** Gather inline content from a block that wraps paragraphs (list-item, quote). */
function flattenInline(node) {
  const inline = [];
  for (const c of node.content ?? []) {
    if (c.nodeType === 'text' || c.nodeType === 'hyperlink') inline.push(c);
    else if (c.content) inline.push(...c.content);
  }
  return inline;
}

const HEADING_LEVEL = {
  'heading-1': 1,
  'heading-2': 2,
  'heading-3': 3,
  'heading-4': 4,
  'heading-5': 5,
  'heading-6': 6,
};

function blockNode(node, ctx) {
  if (HEADING_LEVEL[node.nodeType]) {
    return { type: 'heading', level: HEADING_LEVEL[node.nodeType], children: inlineChildren(node.content, ctx) };
  }
  switch (node.nodeType) {
    case 'paragraph':
      return { type: 'paragraph', children: inlineChildren(node.content, ctx) };

    case 'unordered-list':
    case 'ordered-list':
      return {
        type: 'list',
        format: node.nodeType === 'ordered-list' ? 'ordered' : 'unordered',
        children: (node.content ?? []).map((li) => ({
          type: 'list-item',
          children: inlineChildren(flattenInline(li), ctx),
        })),
      };

    case 'blockquote':
      return { type: 'quote', children: inlineChildren(flattenInline(node), ctx) };

    case 'embedded-asset-block': {
      const media = ctx.resolveAsset(node.data?.target?.sys?.id);
      if (!media) return null;
      return { type: 'image', image: media, children: [{ type: 'text', text: '' }] };
    }

    case 'hr': // no Strapi block equivalent
    case 'embedded-entry-block':
    case 'embedded-entry-inline':
      return null;

    default:
      // Unknown block: recurse so we don't lose nested content.
      return node.content ? node.content.map((c) => blockNode(c, ctx)).filter(Boolean) : null;
  }
}

/**
 * Convert a Contentful rich text document to a Strapi Blocks array.
 *
 * @param {object} document  Contentful rich text document node.
 * @param {object} options
 * @param {(assetId: string) => (object | null)} options.resolveAsset
 *   Resolves a Contentful asset id to the Strapi media object to embed.
 * @returns {Array} Strapi Blocks value.
 */
export function richTextToBlocks(document, { resolveAsset } = {}) {
  const ctx = { resolveAsset: resolveAsset ?? (() => null) };
  const blocks = [];
  for (const node of document?.content ?? []) {
    const b = blockNode(node, ctx);
    if (Array.isArray(b)) blocks.push(...b.filter(Boolean));
    else if (b) blocks.push(b);
  }
  // A Blocks field must not be an empty array.
  return blocks.length ? blocks : [{ type: 'paragraph', children: [{ type: 'text', text: '' }] }];
}

// --- Markdown variant -------------------------------------------------------
// Kept as an alternative target. Point migrate.js at this (and set the `body`
// field to `richtext`) if you'd rather store Markdown than Blocks.

const MD_WRAPPERS = { bold: '**', italic: '_', code: '`' };

function applyMarks(text, marks = []) {
  const ordered = [...marks].sort((a, b) => (a.type === 'code' ? 1 : 0) - (b.type === 'code' ? 1 : 0));
  return ordered.reduce((acc, mark) => {
    const wrap = MD_WRAPPERS[mark.type];
    return wrap ? `${wrap}${acc}${wrap}` : acc;
  }, text);
}

function mdChildren(nodes, ctx) {
  return (nodes ?? []).map((n) => mdNode(n, ctx)).join('');
}

function mdNode(node, ctx) {
  const lvl = HEADING_LEVEL[node.nodeType];
  if (lvl) return `${'#'.repeat(lvl)} ${mdChildren(node.content, ctx)}\n\n`;
  switch (node.nodeType) {
    case 'document':
      return mdChildren(node.content, ctx).replace(/\n{3,}/g, '\n\n').trim();
    case 'paragraph':
      return `${mdChildren(node.content, ctx)}\n\n`;
    case 'unordered-list':
    case 'ordered-list':
      return (
        (node.content ?? [])
          .map((item, i) => `${node.nodeType === 'ordered-list' ? `${i + 1}.` : '-'} ${mdChildren(item.content, ctx).trim()}`)
          .join('\n') + '\n\n'
      );
    case 'list-item':
      return mdChildren(node.content, ctx);
    case 'blockquote':
      return `> ${mdChildren(node.content, ctx).trim().replace(/\n/g, '\n> ')}\n\n`;
    case 'hr':
      return `---\n\n`;
    case 'hyperlink':
      return `[${mdChildren(node.content, ctx)}](${node.data?.uri ?? ''})`;
    case 'text':
      return applyMarks(node.value ?? '', node.marks);
    case 'embedded-asset-block': {
      const media = ctx.resolveAsset(node.data?.target?.sys?.id);
      return media?.url ? `![${media.alternativeText ?? ''}](${media.url})\n\n` : '';
    }
    default:
      return node.content ? mdChildren(node.content, ctx) : '';
  }
}

export function richTextToMarkdown(document, { resolveAsset } = {}) {
  if (!document || document.nodeType !== 'document') return '';
  return mdNode(document, { resolveAsset: resolveAsset ?? (() => null) });
}
