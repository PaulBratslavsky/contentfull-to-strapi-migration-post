/**
 * Generates placeholder PNG images for the demo export, laid out exactly like
 * `contentful export --download-assets` would write them:
 *   sample-data/images.ctfassets.net/<space>/<assetId>/<token>/<file>
 *
 * Run once: `node sample-data/generate-sample-assets.mjs`
 * (the committed sample-data already includes these; this just lets you
 * regenerate them).
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// CRC32 table for PNG chunks.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

/** Build a solid-colour RGB PNG. */
function solidPng(width, height, [r, g, b]) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour (RGB)

  const rowLen = width * 3 + 1;
  const raw = Buffer.alloc(rowLen * height);
  for (let y = 0; y < height; y++) {
    raw[y * rowLen] = 0; // filter type 0
    for (let x = 0; x < width; x++) {
      const o = y * rowLen + 1 + x * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// asset id -> { file, colour, size }. Paths mirror the export's CDN urls.
const ASSETS = [
  { id: 'asset-hero', file: 'hero.png', color: [37, 99, 235], size: [1200, 600] },
  { id: 'asset-cover-astro', file: 'astro-cover.png', color: [124, 58, 237], size: [800, 450] },
  { id: 'asset-cover-strapi', file: 'strapi-cover.png', color: [16, 185, 129], size: [800, 450] },
  { id: 'asset-cover-contentful', file: 'contentful-cover.png', color: [234, 88, 12], size: [800, 450] },
  { id: 'asset-diagram', file: 'architecture-diagram.png', color: [100, 116, 139], size: [900, 500] },
  { id: 'asset-avatar-jane', file: 'jane.png', color: [219, 39, 119], size: [256, 256] },
  { id: 'asset-avatar-sam', file: 'sam.png', color: [13, 148, 136], size: [256, 256] },
];

const SPACE = 'demospace';

for (const a of ASSETS) {
  const dir = path.join(HERE, 'images.ctfassets.net', SPACE, a.id, 'v1');
  mkdirSync(dir, { recursive: true });
  const png = solidPng(a.size[0], a.size[1], a.color);
  writeFileSync(path.join(dir, a.file), png);
  console.log(`wrote ${path.relative(HERE, path.join(dir, a.file))} (${png.length} bytes)`);
}
