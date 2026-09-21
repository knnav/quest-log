// Generates the app icon — the thing Windows shows in the taskbar and on the
// .exe, macOS in the dock, Linux in the window switcher — in every format
// they want, from one pixel-art drawing:
//
//   node scripts/app-icon.js
//
// Writes assets/icon.ico (Windows, 16–256: the window icon from source and
// the .exe icon when packaged), assets/icon.icns (macOS, 16–1024) and
// assets/icon.png (256, the window icon on Linux). All under assets/ so the
// .ico ships inside the app — Windows wants the window icon as an .ico, a
// PNG there is ignored by the taskbar.
//
// The flame is the tray glyph (assets/tray.png) on a 16-cell grid, with a
// log under it and a dark rounded square behind, so the two read as one
// family. Nothing is resampled — pixel art scaled with a filter goes soft,
// and a soft flame at 16px is a smudge — each cell is a block of whole
// pixels. The small sizes (up to 64) use the glyph edge to edge, because a
// taskbar flame needs every pixel; the large ones get a two-cell margin, the
// way a dock icon sits inside its square. The square's corners and the
// glow are the only smooth shapes, drawn per pixel.
//
// No dependencies on purpose: PNG is zlib plus a checksum, and ICO and ICNS
// are containers around PNGs (ICO also takes raw bitmaps, which Windows
// prefers for the small sizes).

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.join(__dirname, "..");

// Legend: . empty  m mid (orange)  c core (yellow)  l log (brown)
// Rows 1–13 are the tray flame; the log under it is the one thing the tray
// glyph has no room for, and the thing that makes it a campfire.
const GLYPH = [
  "................",
  "........mm......",
  "........mm......",
  ".......mmm......",
  ".......mmmm.....",
  "......mmmmm.....",
  "......mcccmm....",
  ".....mmcccmm....",
  "....mmcccccmm...",
  "....mccccccmm...",
  "...mmccccccmmm..",
  "..mmmmcccccmmm..",
  "...mmmmmmmmmm...",
  "....mmmmmmmm....",
  "...llllllllll...",
  "................",
];

const GLYPH_CELLS = 16;

// Margin in cells around the glyph: none up to 64px (the cell then divides
// the size exactly), two above that (cells are then 6.4px at 128 and up,
// which rounds to a 1px wobble no one can see at that size).
function marginFor(size) { return size <= 64 ? 0 : 2; }

const COLORS = {
  m: [255, 138, 42, 255],
  c: [255, 213, 74, 255],
  l: [107, 63, 42, 255],
};

// The default theme's floor, a shade lighter so the square still has an edge
// on a black taskbar. The glow is the flame's own orange, thinned.
const BG = [21, 12, 38];
const GLOW = [255, 138, 42];
const CORNER = 0.22;  // of the size
const GLOW_CENTER = [8, 8.5]; // glyph cells
const GLOW_SIGMA = 5;         // glyph cells
const GLOW_PEAK = 0.28;

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

// Signed distance to the rounded square's edge, in pixels: negative inside.
function roundedSquareDistance(px, py, size, radius) {
  const half = size / 2;
  const inner = half - radius;
  const dx = Math.abs(px - half) - inner;
  const dy = Math.abs(py - half) - inner;
  const ax = Math.max(dx, 0);
  const ay = Math.max(dy, 0);
  return Math.sqrt(ax * ax + ay * ay) + Math.min(Math.max(dx, dy), 0) - radius;
}

// Renders one size to a flat RGBA buffer (row-major, top-down).
function render(size) {
  const margin = marginFor(size);
  const grid = GLYPH_CELLS + 2 * margin;
  const k = size / grid;
  if (margin === 0 && k !== Math.floor(k)) throw new Error(`size ${size} is not a multiple of ${grid}`);
  const buf = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = roundedSquareDistance(x + 0.5, y + 0.5, size, CORNER * size);
      const cover = clamp01(0.5 - d);
      if (cover === 0) continue;

      // Background, then the glow over it, in cell units so it is the same
      // shape at every size.
      const cx = (x + 0.5) / k - margin - GLOW_CENTER[0];
      const cy = (y + 0.5) / k - margin - GLOW_CENTER[1];
      const g = GLOW_PEAK * Math.exp(-(cx * cx + cy * cy) / (GLOW_SIGMA * GLOW_SIGMA));
      let r = BG[0] + (GLOW[0] - BG[0]) * g;
      let gg = BG[1] + (GLOW[1] - BG[1]) * g;
      let b = BG[2] + (GLOW[2] - BG[2]) * g;

      const row = GLYPH[Math.floor(y / k) - margin];
      const cell = row ? row[Math.floor(x / k) - margin] : undefined;
      const c = COLORS[cell];
      if (c) { r = c[0]; gg = c[1]; b = c[2]; }

      const i = (y * size + x) * 4;
      buf[i] = Math.round(r);
      buf[i + 1] = Math.round(gg);
      buf[i + 2] = Math.round(b);
      buf[i + 3] = Math.round(255 * cover);
    }
  }
  return buf;
}

// ---- PNG ----

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
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(rgba, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  // compression, filter, interlace: all 0

  // Filter byte 0 (none) in front of every row.
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- ICO ----

// A 32-bit BGRA bottom-up DIB with an all-clear AND mask: what Windows
// expects for the small sizes. The header's height is doubled to count the
// mask rows.
function dib(rgba, size) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8);
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(0, 16);
  header.writeUInt32LE(size * size * 4, 20);

  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    const src = (size - 1 - y) * size * 4;
    for (let x = 0; x < size; x++) {
      const s = src + x * 4;
      const d = (y * size + x) * 4;
      pixels[d] = rgba[s + 2];
      pixels[d + 1] = rgba[s + 1];
      pixels[d + 2] = rgba[s];
      pixels[d + 3] = rgba[s + 3];
    }
  }
  const maskRow = Math.ceil(size / 32) * 4;
  const mask = Buffer.alloc(maskRow * size);
  return Buffer.concat([header, pixels, mask]);
}

function ico(entries) {
  // entries: [{ size, data, png }]
  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(0, 0);
  dir.writeUInt16LE(1, 2);
  dir.writeUInt16LE(entries.length, 4);

  let offset = 6 + entries.length * 16;
  const heads = [];
  const bodies = [];
  for (const e of entries) {
    const h = Buffer.alloc(16);
    h[0] = e.size >= 256 ? 0 : e.size;
    h[1] = e.size >= 256 ? 0 : e.size;
    h[2] = 0;
    h[3] = 0;
    h.writeUInt16LE(1, 4);
    h.writeUInt16LE(32, 6);
    h.writeUInt32LE(e.data.length, 8);
    h.writeUInt32LE(offset, 12);
    heads.push(h);
    bodies.push(e.data);
    offset += e.data.length;
  }
  return Buffer.concat([dir, ...heads, ...bodies]);
}

// ---- ICNS ----

// Every modern type takes a PNG payload. The @2x types are the same pixels
// at the next size up; macOS picks by what the display wants.
const ICNS_TYPES = [
  ["icp4", 16], ["icp5", 32], ["icp6", 64],
  ["ic07", 128], ["ic08", 256], ["ic09", 512], ["ic10", 1024],
  ["ic11", 32], ["ic12", 64], ["ic13", 256], ["ic14", 512],
];

function icns(pngBySize) {
  const parts = [];
  for (const [type, size] of ICNS_TYPES) {
    const data = pngBySize[size];
    const head = Buffer.alloc(8);
    head.write(type, 0, "ascii");
    head.writeUInt32BE(8 + data.length, 4);
    parts.push(head, data);
  }
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(8);
  head.write("icns", 0, "ascii");
  head.writeUInt32BE(8 + body.length, 4);
  return Buffer.concat([head, body]);
}

// ---- write everything ----

function main() {
  const sizes = [16, 32, 48, 64, 128, 256, 512, 1024];
  const rgba = {};
  const pngs = {};
  for (const s of sizes) {
    rgba[s] = render(s);
    pngs[s] = png(rgba[s], s);
  }

  const assets = path.join(ROOT, "assets");
  fs.writeFileSync(path.join(assets, "icon.png"), pngs[256]);
  fs.writeFileSync(path.join(assets, "icon.ico"), ico([
    { size: 16, data: dib(rgba[16], 16) },
    { size: 32, data: dib(rgba[32], 32) },
    { size: 48, data: dib(rgba[48], 48) },
    { size: 64, data: dib(rgba[64], 64) },
    { size: 128, data: dib(rgba[128], 128) },
    { size: 256, data: pngs[256] },
  ]));
  fs.writeFileSync(path.join(assets, "icon.icns"), icns(pngs));

  console.log("wrote assets/icon.ico, assets/icon.icns, assets/icon.png");
}

main();
