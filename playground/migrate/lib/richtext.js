/**
 * Convert a Contentful Rich Text document (a JSON AST) into Markdown.
 *
 * Contentful stores rich text as a tree of nodes:
 *   { nodeType: "document", content: [ { nodeType: "paragraph", content: [...] }, ... ] }
 * Text nodes carry formatting in a `marks` array ([{ type: "bold" }, ...]).
 *
 * Strapi's "Rich text (Markdown)" field just wants a Markdown string, so we walk
 * the tree and emit Markdown. Embedded assets are the interesting case: the AST
 * only references the asset by id, so we resolve it through `resolveAsset(id)`
 * to the URL the asset now lives at *in Strapi* (it was re-uploaded first).
 *
 * This is intentionally a compact, readable converter rather than an exhaustive
 * one — it covers the nodes a typical blog body uses. For exotic content
 * (tables, deeply nested entries) extend the switch below or reach for
 * @contentful/rich-text-html-renderer and store HTML instead.
 */

const MARK_WRAPPERS = {
  bold: '**',
  italic: '_',
  code: '`',
};

function applyMarks(text, marks = []) {
  // Apply code last (innermost) so **`x`** renders correctly.
  const ordered = [...marks].sort((a, b) => (a.type === 'code' ? 1 : 0) - (b.type === 'code' ? 1 : 0));
  return ordered.reduce((acc, mark) => {
    const wrap = MARK_WRAPPERS[mark.type];
    return wrap ? `${wrap}${acc}${wrap}` : acc;
  }, text);
}

function renderChildren(nodes, ctx) {
  return (nodes ?? []).map((n) => renderNode(n, ctx)).join('');
}

function renderListItems(node, ctx, ordered) {
  return (node.content ?? [])
    .map((item, i) => {
      const marker = ordered ? `${i + 1}.` : '-';
      // A list-item wraps block nodes (usually a single paragraph).
      const inner = renderChildren(item.content, ctx).trim();
      return `${marker} ${inner}`;
    })
    .join('\n');
}

function renderNode(node, ctx) {
  switch (node.nodeType) {
    case 'document':
      return renderChildren(node.content, ctx)
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    case 'paragraph':
      return `${renderChildren(node.content, ctx)}\n\n`;

    case 'heading-1':
      return `# ${renderChildren(node.content, ctx)}\n\n`;
    case 'heading-2':
      return `## ${renderChildren(node.content, ctx)}\n\n`;
    case 'heading-3':
      return `### ${renderChildren(node.content, ctx)}\n\n`;
    case 'heading-4':
      return `#### ${renderChildren(node.content, ctx)}\n\n`;
    case 'heading-5':
      return `##### ${renderChildren(node.content, ctx)}\n\n`;
    case 'heading-6':
      return `###### ${renderChildren(node.content, ctx)}\n\n`;

    case 'unordered-list':
      return `${renderListItems(node, ctx, false)}\n\n`;
    case 'ordered-list':
      return `${renderListItems(node, ctx, true)}\n\n`;
    case 'list-item':
      return renderChildren(node.content, ctx);

    case 'blockquote':
      return `> ${renderChildren(node.content, ctx).trim().replace(/\n/g, '\n> ')}\n\n`;

    case 'hr':
      return `---\n\n`;

    case 'hyperlink': {
      const label = renderChildren(node.content, ctx);
      const url = node.data?.uri ?? '';
      return `[${label}](${url})`;
    }

    case 'text':
      return applyMarks(node.value ?? '', node.marks);

    case 'embedded-asset-block': {
      const assetId = node.data?.target?.sys?.id;
      const asset = assetId ? ctx.resolveAsset(assetId) : null;
      if (!asset?.url) return '';
      return `![${asset.alt ?? ''}](${asset.url})\n\n`;
    }

    case 'embedded-entry-block':
    case 'embedded-entry-inline':
      // Linked entries can't be inlined as Markdown text. Leave a breadcrumb so
      // nothing is silently dropped; a real migration might render a shortcode.
      return ctx.onEmbeddedEntry ? ctx.onEmbeddedEntry(node) : '';

    default:
      // Unknown block: recurse into children so we don't lose text.
      return renderChildren(node.content, ctx);
  }
}

/**
 * @param {object} document  Contentful rich text document node.
 * @param {object} options
 * @param {(assetId: string) => ({ url: string, alt?: string } | null)} options.resolveAsset
 * @param {(node: object) => string} [options.onEmbeddedEntry]
 * @returns {string} Markdown
 */
export function richTextToMarkdown(document, { resolveAsset, onEmbeddedEntry } = {}) {
  if (!document || document.nodeType !== 'document') return '';
  return renderNode(document, {
    resolveAsset: resolveAsset ?? (() => null),
    onEmbeddedEntry,
  });
}
