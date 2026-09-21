// Zips each packaged macOS .app in dist/ into dist/<name>-<version>-mac-<arch>.zip,
// keeping symlinks as symlinks.
//
//   node scripts/zip-app.js
//
// electron-builder's own mac zip is only right when built on a Mac (it uses
// ditto there). Anywhere else it falls back to 7za, which turns the Electron
// framework's symlinks into copies: three times the size, and a bundle no
// longer shaped like a framework. So `package:mac` builds the bare .app
// (target `dir`) and this does the zip. Plain zip format, written by hand
// (no dependencies, like the icon script): local headers, deflate, and a
// central directory whose Unix mode bits carry the symlinks and the
// executable flags. Nothing here needs zip64 — the app is well under 4 GB
// and has a few thousand entries.

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const pkg = require(path.join(ROOT, "package.json"));

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

// DOS date/time pair, as the zip headers want it.
function dosTime(date) {
  const d = date.getFullYear() < 1980 ? new Date(1980, 0, 1) : date;
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const day = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, day };
}

// Walks the tree in a stable order, never following links.
function walk(dir, rel, out) {
  for (const name of fs.readdirSync(dir).sort()) {
    const abs = path.join(dir, name);
    const st = fs.lstatSync(abs);
    const r = rel ? rel + "/" + name : name;
    if (st.isSymbolicLink()) {
      out.push({ rel: r, kind: "link", target: fs.readlinkSync(abs), mode: 0o120755, mtime: st.mtime });
    } else if (st.isDirectory()) {
      out.push({ rel: r + "/", kind: "dir", mode: 0o040755, mtime: st.mtime });
      walk(abs, r, out);
    } else {
      out.push({ rel: r, kind: "file", abs, mode: st.mode & 0o777 | 0o100000, mtime: st.mtime });
    }
  }
}

function zipApp(appDir, zipPath) {
  const entries = [];
  const base = path.basename(appDir);
  entries.push({ rel: base + "/", kind: "dir", mode: 0o040755, mtime: fs.lstatSync(appDir).mtime });
  walk(appDir, base, entries);

  const fd = fs.openSync(zipPath, "w");
  let offset = 0;
  const central = [];
  const write = (buf) => { fs.writeSync(fd, buf); offset += buf.length; };

  for (const e of entries) {
    const name = Buffer.from(e.rel, "utf8");
    let data, method, crc, size;
    if (e.kind === "file") {
      const raw = fs.readFileSync(e.abs);
      crc = crc32(raw);
      size = raw.length;
      const packed = zlib.deflateRawSync(raw, { level: 6 });
      // Store what deflate cannot shrink (the framework binary mostly).
      if (packed.length < raw.length) { data = packed; method = 8; } else { data = raw; method = 0; }
    } else if (e.kind === "link") {
      data = Buffer.from(e.target, "utf8");
      crc = crc32(data);
      size = data.length;
      method = 0;
    } else {
      data = Buffer.alloc(0);
      crc = 0;
      size = 0;
      method = 0;
    }

    const { time, day } = dosTime(e.mtime);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);           // version needed
    local.writeUInt16LE(0x0800, 6);       // flags: utf-8 names
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    const headerOffset = offset;
    write(local);
    write(name);
    write(data);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE((3 << 8) | 20, 4);   // made by: Unix, so the mode bits count
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(method, 10);
    cd.writeUInt16LE(time, 12);
    cd.writeUInt16LE(day, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(size, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt16LE(0, 30);              // extra
    cd.writeUInt16LE(0, 32);              // comment
    cd.writeUInt16LE(0, 34);              // disk
    cd.writeUInt16LE(0, 36);              // internal attrs
    cd.writeUInt32LE((e.mode << 16) >>> 0, 38);
    cd.writeUInt32LE(headerOffset, 42);
    central.push(cd, name);
  }

  const cdStart = offset;
  for (const b of central) write(b);
  const cdSize = offset - cdStart;

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cdSize, 12);
  end.writeUInt32LE(cdStart, 16);
  end.writeUInt16LE(0, 20);
  write(end);
  fs.closeSync(fd);

  return { entries: entries.length, links: entries.filter((e) => e.kind === "link").length, bytes: offset };
}

function main() {
  // electron-builder's dir target lands in dist/mac (x64) and dist/mac-arm64.
  const outputs = fs.existsSync(DIST)
    ? fs.readdirSync(DIST).filter((d) => /^mac(-[a-z0-9]+)?$/.test(d))
    : [];
  if (!outputs.length) {
    console.error("no dist/mac* directory — run `electron-builder --mac` first");
    process.exit(1);
  }

  for (const dir of outputs) {
    const arch = dir === "mac" ? "x64" : dir.slice(4);
    const app = fs.readdirSync(path.join(DIST, dir)).find((n) => n.endsWith(".app"));
    if (!app) continue;
    const zipPath = path.join(DIST, `${pkg.build.productName}-${pkg.version}-mac-${arch}.zip`);
    const r = zipApp(path.join(DIST, dir, app), zipPath);
    console.log(`${path.relative(ROOT, zipPath)}: ${r.entries} entries, ${r.links} symlinks, ${(r.bytes / 2 ** 20).toFixed(0)} MB`);
  }
}

main();
