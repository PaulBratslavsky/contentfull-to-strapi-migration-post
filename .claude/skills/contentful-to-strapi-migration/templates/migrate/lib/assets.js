import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { field } from './contentful.js';

/**
 * Migrate Contentful assets into Strapi's media library.
 *
 * Contentful assets live on its CDN (images.ctfassets.net). Strapi needs its own
 * copy, so for each asset we:
 *   1. get the bytes — preferring a locally downloaded file (from
 *      `contentful export --download-assets`), falling back to the CDN URL;
 *   2. upload them to Strapi (POST /api/upload);
 *   3. remember Contentful asset id -> { strapi file id, url } so entries can
 *      link the image and rich text can rewrite ![](...) to the new URL.
 *
 * Idempotent: an asset already uploaded (matched by file name) is reused.
 */

/**
 * Where `contentful export --download-assets` writes a file. The export keeps
 * the CDN path, e.g. url "//images.ctfassets.net/abc/123/hash/photo.jpg"
 * becomes "<assetsDir>/images.ctfassets.net/abc/123/hash/photo.jpg".
 */
function localPathForUrl(assetsDir, url) {
  const withoutProtocol = url.replace(/^https?:/, '').replace(/^\/\//, '');
  return path.join(assetsDir, withoutProtocol);
}

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function loadBytes({ url, assetsDir }) {
  if (assetsDir) {
    const local = localPathForUrl(assetsDir, url);
    if (await exists(local)) {
      return readFile(local);
    }
  }
  const absoluteUrl = url.startsWith('http') ? url : `https:${url}`;
  const res = await fetch(absoluteUrl);
  if (!res.ok) throw new Error(`Failed to download asset ${absoluteUrl}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * @returns {Promise<Map<string, { id: number, url: string, alt: string }>>}
 *   keyed by Contentful asset sys.id
 */
export async function migrateAssets(assets, { strapi, assetsDir, locale, log = () => {} }) {
  const map = new Map();

  for (const asset of assets) {
    const cfId = asset.sys.id;
    const file = field(asset, 'file', locale);
    if (!file?.url) {
      log(`  ! asset ${cfId} has no file, skipping`);
      continue;
    }

    const fileName = file.fileName || path.basename(file.url);
    const title = field(asset, 'title', locale) || fileName;
    const description = field(asset, 'description', locale) || '';

    // Idempotency: reuse a previously uploaded file with the same name.
    const existing = await strapi.findUploadByName(fileName);
    if (existing) {
      // Store the full media object: entries link it by id, and the Blocks
      // rich-text converter embeds the whole object in image blocks.
      if (!existing.alternativeText) existing.alternativeText = title;
      map.set(cfId, existing);
      log(`  = asset ${fileName} already uploaded (id ${existing.id})`);
      continue;
    }

    const bytes = await loadBytes({ url: file.url, assetsDir });
    const blob = new Blob([bytes], { type: file.contentType || 'application/octet-stream' });
    const uploaded = await strapi.upload(blob, fileName, {
      name: fileName,
      alternativeText: description || title,
      caption: title,
    });

    map.set(cfId, uploaded);
    log(`  + uploaded ${fileName} -> id ${uploaded.id}`);
  }

  return map;
}
