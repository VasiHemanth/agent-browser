#!/usr/bin/env node
// Procedurally generates the AgentChat extension icon set (16/32/48/128 px PNGs).
//
// Identity: vivid green chat bubble + white lightning bolt glyph on a
// near-black rounded-square background (matches the AgentBrowser look).
//
// Pipeline: draw a single 4x-supersampled master raster (512x512, i.e. the
// 128px canvas at 4x) using binary containment tests (rounded-rect distance
// test, ray-casting point-in-polygon), then area-weighted box-downsample
// that master to each target size for antialiasing. PNG encoding (IHDR/IDAT/
// IEND, scanline filter byte 0, zlib-compressed pixel data, CRC32) is done
// by hand with no external dependencies.
//
// Usage: node icons/make-icons.mjs
// Regenerates icon-16.png, icon-32.png, icon-48.png, icon-128.png in this dir.

import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Geometry helpers (all operate in the logical 128x128 icon coordinate space)
// ---------------------------------------------------------------------------

// Rounded-rect containment via the "clamp to nearest allowed center" test:
// a point is inside an (x0,y0,x1,y1) rect with corner radius r iff its
// distance to the position it would be clamped to (once inset by r at the
// corners) is <= r. This is a plain inside/outside test, not a distance
// field, so AA comes entirely from supersample + downsample.
function inRoundedRect(px, py, x0, y0, x1, y1, r) {
  if (px < x0 || px >= x1 || py < y0 || py >= y1) return false;
  const cx = px < x0 + r ? x0 + r : px > x1 - r ? x1 - r : px;
  const cy = py < y0 + r ? y0 + r : py > y1 - r ? y1 - r : py;
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

// Standard ray-casting point-in-polygon test.
function inPolygon(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const intersect =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// ---------------------------------------------------------------------------
// Icon geometry (logical 128x128 units)
// ---------------------------------------------------------------------------

const CANVAS = { x0: 0, y0: 0, x1: 128, y1: 128, r: 28 };

// Chat bubble body (rounded rect) + tail (triangle), unioned. Edges are
// snapped to multiples of 8 (24/16/104/88) so at 16px — where 1 output px =
// 8 logical units — the body outline lands on exact pixel boundaries instead
// of straddling them; a straddling edge box-downsamples into soft half-tone
// mush instead of a crisp line.
const BUBBLE_BODY = { x0: 24, y0: 16, x1: 104, y1: 88, r: 16 };
// Tail base sits strictly inside the body (past x0+r, above y1) so the union
// has no seam/notch where the two shapes meet, then extends down-left below
// the body into a clean wedge.
const BUBBLE_TAIL = [
  [48, 80],
  [64, 80],
  [36, 112],
];

// Lightning bolt: a hand-tuned "flash" hexagon (same topology as the classic
// Feather/Material bolt glyphs — a long outer edge down one side, a notch
// ledge, a long outer edge back up the other side, mirrored notch) but drawn
// with much wider limbs and notch than those thin, tap-target-oriented
// glyphs use. A thin bolt's arms and pointed tips antialias away under an
// 8x box-downsample to 16px, leaving only the wide middle notch behind —
// reading as a blob, not a bolt. Chamfering the two tips (indices 0 and 3)
// into short flat edges removes the last zero-width feature.
// Squarer proportions than a typical elongated bolt glyph on purpose: at
// 16px a tall/narrow bolt (~18x32 logical units) downsamples to roughly a
// 4px-wide sliver, which reads as a thin vertical line rather than a
// zigzag — there just aren't enough output columns to show the kink. A
// near-square bbox (28x28) trades a little of the elongated "flash" look at
// 128px for real pixel width at 16px, where it matters.
const BOLT_HEX = [
  [19, 0], // top tip
  [0, 14], // left point
  [12, 14], // inner notch point
  [9, 28], // bottom tip
  [28, 13], // right point
  [16, 13], // inner notch point
];

function chamferVertices(points, indices, f) {
  const n = points.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    if (indices.includes(i)) {
      const prev = points[(i - 1 + n) % n];
      const cur = points[i];
      const next = points[(i + 1) % n];
      out.push([cur[0] + f * (prev[0] - cur[0]), cur[1] + f * (prev[1] - cur[1])]);
      out.push([cur[0] + f * (next[0] - cur[0]), cur[1] + f * (next[1] - cur[1])]);
    } else {
      out.push(points[i]);
    }
  }
  return out;
}

const BOLT_RAW = chamferVertices(BOLT_HEX, [0, 3], 0.35);

function polygonBounds(poly) {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  return {
    cx: (Math.min(...xs) + Math.max(...xs)) / 2,
    cy: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
}

const BOLT_SCALE = 2.05;
const BUBBLE_CX = (BUBBLE_BODY.x0 + BUBBLE_BODY.x1) / 2;
const BUBBLE_CY = (BUBBLE_BODY.y0 + BUBBLE_BODY.y1) / 2;
const boltBounds = polygonBounds(BOLT_RAW);
const BOLT_TX = BUBBLE_CX - boltBounds.cx * BOLT_SCALE;
const BOLT_TY = BUBBLE_CY - boltBounds.cy * BOLT_SCALE;
const BOLT = BOLT_RAW.map(([x, y]) => [x * BOLT_SCALE + BOLT_TX, y * BOLT_SCALE + BOLT_TY]);

const COLOR_BG = [11, 18, 14]; // near-black, slight green cast
const COLOR_GREEN = [34, 197, 94]; // #22c55e
const COLOR_GLYPH = [245, 250, 247]; // near-white

function bubbleContains(lx, ly) {
  return inRoundedRect(lx, ly, BUBBLE_BODY.x0, BUBBLE_BODY.y0, BUBBLE_BODY.x1, BUBBLE_BODY.y1, BUBBLE_BODY.r) ||
    inPolygon(lx, ly, BUBBLE_TAIL);
}

// ---------------------------------------------------------------------------
// Rasterize the supersampled master
// ---------------------------------------------------------------------------

const MASTER_LOGICAL = 128;
const SUPERSAMPLE = 4;
const MASTER_SIZE = MASTER_LOGICAL * SUPERSAMPLE; // 512

function renderMaster() {
  const buf = new Uint8Array(MASTER_SIZE * MASTER_SIZE * 4);
  const k = MASTER_SIZE / MASTER_LOGICAL; // 4

  for (let Y = 0; Y < MASTER_SIZE; Y++) {
    const ly = (Y + 0.5) / k;
    for (let X = 0; X < MASTER_SIZE; X++) {
      const lx = (X + 0.5) / k;
      const idx = (Y * MASTER_SIZE + X) * 4;

      if (!inRoundedRect(lx, ly, CANVAS.x0, CANVAS.y0, CANVAS.x1, CANVAS.y1, CANVAS.r)) {
        // Outside the rounded-square background: fully transparent.
        buf[idx] = 0;
        buf[idx + 1] = 0;
        buf[idx + 2] = 0;
        buf[idx + 3] = 0;
        continue;
      }

      let color = COLOR_BG;
      if (bubbleContains(lx, ly)) {
        color = COLOR_GREEN;
        if (inPolygon(lx, ly, BOLT)) {
          color = COLOR_GLYPH;
        }
      }

      buf[idx] = color[0];
      buf[idx + 1] = color[1];
      buf[idx + 2] = color[2];
      buf[idx + 3] = 255;
    }
  }
  return buf;
}

// ---------------------------------------------------------------------------
// Area-weighted box downsample (premultiplied-alpha averaging, handles
// non-integer scale ratios like 512 -> 48 cleanly).
// ---------------------------------------------------------------------------

function boxDownsample(src, srcW, srcH, dstW, dstH) {
  const scaleX = srcW / dstW;
  const scaleY = srcH / dstH;
  const dst = new Uint8Array(dstW * dstH * 4);

  for (let dy = 0; dy < dstH; dy++) {
    const sy0 = dy * scaleY;
    const sy1 = (dy + 1) * scaleY;
    const iy0 = Math.max(0, Math.floor(sy0));
    const iy1 = Math.min(srcH, Math.ceil(sy1));

    for (let dx = 0; dx < dstW; dx++) {
      const sx0 = dx * scaleX;
      const sx1 = (dx + 1) * scaleX;
      const ix0 = Math.max(0, Math.floor(sx0));
      const ix1 = Math.min(srcW, Math.ceil(sx1));

      let rSum = 0, gSum = 0, bSum = 0, aSum = 0, wSum = 0;
      for (let sy = iy0; sy < iy1; sy++) {
        const wy = Math.min(sy + 1, sy1) - Math.max(sy, sy0);
        if (wy <= 0) continue;
        for (let sx = ix0; sx < ix1; sx++) {
          const wx = Math.min(sx + 1, sx1) - Math.max(sx, sx0);
          if (wx <= 0) continue;
          const w = wx * wy;
          const si = (sy * srcW + sx) * 4;
          const a = src[si + 3] / 255;
          rSum += src[si] * a * w;
          gSum += src[si + 1] * a * w;
          bSum += src[si + 2] * a * w;
          aSum += a * w;
          wSum += w;
        }
      }

      const di = (dy * dstW + dx) * 4;
      if (aSum > 1e-6) {
        dst[di] = Math.round(rSum / aSum);
        dst[di + 1] = Math.round(gSum / aSum);
        dst[di + 2] = Math.round(bSum / aSum);
      } else {
        dst[di] = 0;
        dst[di + 1] = 0;
        dst[di + 2] = 0;
      }
      dst[di + 3] = Math.round(255 * (aSum / wSum));
    }
  }
  return dst;
}

// ---------------------------------------------------------------------------
// Minimal hand-rolled PNG encoder (RGBA, 8-bit, filter type 0 per scanline)
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePNG(rgba, width, height) {
  // Raw scanlines: 1 filter byte (0 = None) + width*4 pixel bytes, per row.
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter type None
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, rowStart + 1);
  }

  const idatData = deflateSync(raw, { level: 9 });

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", idatData),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const master = renderMaster();
const sizes = [16, 32, 48, 128];

for (const size of sizes) {
  const pixels = boxDownsample(master, MASTER_SIZE, MASTER_SIZE, size, size);
  const png = encodePNG(pixels, size, size);
  const outPath = join(__dirname, `icon-${size}.png`);
  writeFileSync(outPath, png);
  console.log(`wrote ${outPath} (${png.length} bytes)`);
}
