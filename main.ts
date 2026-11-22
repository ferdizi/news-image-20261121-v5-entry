// news-image-20261121 v5 — "Saturday 21 November 2026"
// Draws a 1024x1024 broadsheet front page in code. Node stdlib only.
// No network, no Date, no random, no binary assets: every glyph and every
// picture is drawn from vectors below. Deterministic by construction.
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

// ---------------------------------------------------------------- canvas
const W = 1024, H = 1024, SS = 2; // supersample 2x, downsampled for AA
const CW = W * SS, CH = H * SS;
const buf = new Uint8Array(CW * CH * 3);
function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const CREAM = rgb("#F7F3E8"), INK = rgb("#161513"), RED = rgb("#B91C1C");
const PAPER = rgb("#FCFAF3"), GREY = rgb("#E9E4D6"), DARK = rgb("#20242B");
function fill(c) {
  for (let i = 0; i < CW * CH; i++) { buf[i * 3] = c[0]; buf[i * 3 + 1] = c[1]; buf[i * 3 + 2] = c[2]; }
}
function px(x, y, c, a) { // x,y in 2x coords, a 0..1 coverage
  const xi = x | 0, yi = y | 0;
  if (xi < 0 || yi < 0 || xi >= CW || yi >= CH) return;
  const i = (yi * CW + xi) * 3, ia = 1 - a;
  buf[i] = buf[i] * ia + c[0] * a; buf[i + 1] = buf[i + 1] * ia + c[1] * a; buf[i + 2] = buf[i + 2] * ia + c[2] * a;
}
function fillRect(x0, y0, x1, y1, c) { // 1x coords
  const X0 = Math.max(0, Math.round(x0 * SS)), X1 = Math.min(CW, Math.round(x1 * SS));
  const Y0 = Math.max(0, Math.round(y0 * SS)), Y1 = Math.min(CH, Math.round(y1 * SS));
  for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) {
    const i = (y * CW + x) * 3; buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2];
  }
}
function fillCircle(cx, cy, r, c) { // 1x coords
  const X0 = Math.max(0, Math.floor((cx - r) * SS)), X1 = Math.min(CW - 1, Math.ceil((cx + r) * SS));
  const Y0 = Math.max(0, Math.floor((cy - r) * SS)), Y1 = Math.min(CH - 1, Math.ceil((cy + r) * SS));
  const R = r * SS, CX = cx * SS, CY = cy * SS;
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
    const dx = x + 0.5 - CX, dy = y + 0.5 - CY;
    if (dx * dx + dy * dy <= R * R) { const i = (y * CW + x) * 3; buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; }
  }
}
function ring(cx, cy, r, w, c) {
  const X0 = Math.max(0, Math.floor((cx - r - w) * SS)), X1 = Math.min(CW - 1, Math.ceil((cx + r + w) * SS));
  const Y0 = Math.max(0, Math.floor((cy - r - w) * SS)), Y1 = Math.min(CH - 1, Math.ceil((cy + r + w) * SS));
  const R0 = (r - w / 2) * SS, R1 = (r + w / 2) * SS, CX = cx * SS, CY = cy * SS;
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
    const dx = x + 0.5 - CX, dy = y + 0.5 - CY, d = Math.sqrt(dx * dx + dy * dy);
    if (d >= R0 && d <= R1) { const i = (y * CW + x) * 3; buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; }
  }
}
// scanline polygon fill, 1x coords
function fillPoly(pts, c) {
  const P = pts.map(p => [p[0] * SS, p[1] * SS]);
  let ymin = Infinity, ymax = -Infinity;
  for (const p of P) { ymin = Math.min(ymin, p[1]); ymax = Math.max(ymax, p[1]); }
  ymin = Math.max(0, Math.floor(ymin)); ymax = Math.min(CH - 1, Math.ceil(ymax));
  for (let y = ymin; y <= ymax; y++) {
    const yc = y + 0.5, xs = [];
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) {
        xs.push(a[0] + (yc - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
    }
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.ceil(xs[k])), x1 = Math.min(CW - 1, Math.floor(xs[k + 1]));
      for (let x = x0; x <= x1; x++) { const i = (y * CW + x) * 3; buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; }
    }
  }
}
// thick line with round caps, 1x coords, width in 1x px
function strokeLine(x1, y1, x2, y2, w, c) {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
  if (len < 0.01) { fillCircle(x1, y1, w * 0.75, c); return; }
  const nx = -dy / len * w / 2, ny = dx / len * w / 2;
  fillPoly([[x1 + nx, y1 + ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny], [x1 - nx, y1 - ny]], c);
  fillCircle(x1, y1, w / 2, c); fillCircle(x2, y2, w / 2, c);
}
function strokePoly(pts, w, c) {
  for (let i = 0; i + 1 < pts.length; i++) strokeLine(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w, c);
  if (pts.length === 1) fillCircle(pts[0][0], pts[0][1], w * 0.75, c);
}

// ---------------------------------------------------------------- PNG out
const CRC_T = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let v = n; for (let k = 0; k < 8; k++) v = (v & 1) ? (0xEDB88320 ^ (v >>> 1)) : (v >>> 1); t[n] = v; } return t; })();
function crc32(b) { let v = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) v = CRC_T[(v ^ b[i]) & 255] ^ (v >>> 8); return (v ^ 0xFFFFFFFF) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function writePNG() {
  // downsample 2x2 box average
  const small = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let r = 0, g = 0, b = 0;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const i = ((y * 2 + dy) * CW + (x * 2 + dx)) * 3; r += buf[i]; g += buf[i + 1]; b += buf[i + 2];
    }
    const o = (y * W + x) * 3; small[o] = Math.round(r / 4); small[o + 1] = Math.round(g / 4); small[o + 2] = Math.round(b / 4);
  }
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) { raw[y * (1 + W * 3)] = 0; small.copy(raw, y * (1 + W * 3) + 1, y * W * 3, (y + 1) * W * 3); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, "entry.png");
  fs.writeFileSync(out, png, { mode: 0o644 });
  return out;
}

// ---------------------------------------------------------------- stroke font
// Glyph space: cap top y=0, baseline y=7, descender y=9.5. Each glyph:
// { a: advance width, s: [polyline, ...] } — polylines are flat [x,y,...].
// A zero-length segment draws a dot. Light, classical single-stroke forms;
// serif mode adds small ticks at the ends of long vertical stems.
const F = {};
function g(ch, adv, strokes) { F[ch] = { a: adv, s: strokes }; }
g("A", 6, [[0.6, 7, 3, 0, 5.4, 7], [1.7, 4.6, 4.3, 4.6]]);
g("B", 5.8, [[0.8, 0, 0.8, 7], [0.8, 0, 4, 0, 5.2, 1.2, 5.2, 2.8, 4, 3.5, 0.8, 3.5], [4, 3.5, 5.2, 3.5, 5.4, 4.8, 4.6, 7, 0.8, 7]]);
g("C", 5.6, [[5.2, 1.2, 4, 0, 1.8, 0, 0.6, 1.4, 0.6, 5.6, 1.8, 7, 4, 7, 5.2, 5.8]]);
g("D", 6, [[0.8, 0, 0.8, 7], [0.8, 0, 3.8, 0, 5.4, 1.6, 5.4, 5.4, 3.8, 7, 0.8, 7]]);
g("E", 5.4, [[0.8, 0, 0.8, 7], [0.8, 0, 5, 0], [0.8, 3.5, 4.2, 3.5], [0.8, 7, 5, 7]]);
g("F", 5.2, [[0.8, 0, 0.8, 7], [0.8, 0, 5, 0], [0.8, 3.5, 4.2, 3.5]]);
g("G", 5.8, [[5.2, 1.2, 4, 0, 1.8, 0, 0.6, 1.4, 0.6, 5.6, 1.8, 7, 4, 7, 5.4, 5.6, 5.4, 4, 3.4, 4]]);
g("H", 6, [[0.8, 0, 0.8, 7], [5.2, 0, 5.2, 7], [0.8, 3.5, 5.2, 3.5]]);
g("I", 4.6, [[3, 0, 3, 7], [1.8, 0, 4.2, 0], [1.8, 7, 4.2, 7]]);
g("J", 5.4, [[2.8, 0, 5, 0], [4.6, 0, 4.6, 5.6, 3.6, 7, 1.8, 7, 0.8, 5.8]]);
g("K", 5.8, [[0.8, 0, 0.8, 7], [5.2, 0, 1.6, 3.4], [2.6, 3.4, 5.2, 7]]);
g("L", 5.4, [[0.8, 0, 0.8, 7], [0.8, 7, 5.2, 7]]);
g("M", 6.4, [[0.8, 7, 0.8, 0, 3, 3.4, 5.2, 0, 5.2, 7]]);
g("N", 6, [[0.8, 7, 0.8, 0, 5.2, 7, 5.2, 0]]);
g("O", 6, [[3, 0, 4.8, 0.6, 5.4, 2, 5.4, 5, 4.8, 6.4, 3, 7, 1.2, 6.4, 0.6, 5, 0.6, 2, 1.2, 0.6, 3, 0]]);
g("P", 5.6, [[0.8, 0, 0.8, 7], [0.8, 0, 4, 0, 5.2, 1.2, 5.2, 2.6, 4, 3.5, 0.8, 3.5]]);
g("Q", 6.2, [[3, 0, 4.8, 0.6, 5.4, 2, 5.4, 5, 4.8, 6.4, 3, 7, 1.2, 6.4, 0.6, 5, 0.6, 2, 1.2, 0.6, 3, 0], [4.2, 5, 5.6, 7]]);
g("R", 5.8, [[0.8, 0, 0.8, 7], [0.8, 0, 4, 0, 5.2, 1.2, 5.2, 2.6, 4, 3.5, 0.8, 3.5], [3.4, 3.5, 5.4, 7]]);
g("S", 5.6, [[5, 1, 4, 0, 2, 0, 0.8, 1.2, 0.8, 2.6, 2, 3.5, 4, 3.5, 5.2, 4.4, 5.2, 5.8, 4, 7, 2, 7, 0.8, 5.8]]);
g("T", 6, [[3, 0, 3, 7], [0.6, 0, 5.4, 0]]);
g("U", 6, [[0.8, 0, 0.8, 5.4, 1.8, 7, 4.2, 7, 5.2, 5.4, 5.2, 0]]);
g("V", 6, [[0.6, 0, 3, 7, 5.4, 0]]);
g("W", 6.6, [[0.6, 0, 1.6, 7, 3, 4.4, 4.4, 7, 5.4, 0]]);
g("X", 5.8, [[0.8, 0, 5.2, 7], [5.2, 0, 0.8, 7]]);
g("Y", 5.8, [[0.8, 0, 3, 3.6, 5.2, 0], [3, 3.6, 3, 7]]);
g("Z", 5.8, [[0.8, 0, 5.2, 0, 0.8, 7, 5.2, 7]]);
g("a", 5.6, [[3, 2, 4.4, 2.4, 5, 3.6, 5, 5.6, 4.4, 6.8, 3, 7, 1.6, 6.8, 1, 5.6, 1, 3.6, 1.6, 2.4, 3, 2], [5, 2, 5, 7]]);
g("b", 5.6, [[1, 0, 1, 7], [1, 4.6, 2, 2, 4.6, 2, 5.2, 3.4, 5.2, 5.6, 4.2, 7, 1, 7]]);
g("c", 5, [[5, 3, 4, 2, 2, 2, 1, 3.2, 1, 5.8, 2, 7, 4, 7, 5, 6]]);
g("d", 5.6, [[5, 0, 5, 7], [5, 4.6, 4, 2, 1.6, 2, 1, 3.4, 1, 5.6, 2, 7, 4, 7, 5, 5.6]]);
g("e", 5.2, [[4.8, 3, 4, 2, 2, 2, 1, 3.4, 1, 5.6, 2, 7, 4, 7, 5, 6, 5, 4.4, 1, 4.4]]);
g("f", 4, [[4.4, 1, 3.4, 0, 2.2, 0.8, 2.2, 7], [1.4, 2.6, 3.8, 2.6]]);
g("g", 5.6, [[3, 2, 4.4, 2.4, 5, 3.6, 5, 5.6, 4.4, 6.8, 3, 7, 1.6, 6.8, 1, 5.6, 1, 3.6, 1.6, 2.4, 3, 2], [5, 6.4, 5, 8.6, 4, 9.4, 2.4, 9.4, 1.4, 8.6]]);
g("h", 5.4, [[1, 0, 1, 7], [1, 4.6, 2, 2, 4, 2, 5, 3.2, 5, 7]]);
g("i", 3, [[2.6, 2.6, 2.6, 7], [2.6, 0.6, 2.6, 0.6]]);
g("j", 3.4, [[3, 2.6, 3, 8.4, 2, 9.4, 1, 9.2], [3, 0.6, 3, 0.6]]);
g("k", 5.2, [[1, 0, 1, 7], [4.8, 2, 1.4, 4.6], [2.6, 4.6, 5, 7]]);
g("l", 3, [[2.6, 0, 2.6, 7]]);
g("m", 6.4, [[1, 2.2, 1, 7], [1, 4.6, 1.8, 2, 3, 2, 3.6, 3, 3.6, 7], [3.6, 4.6, 4.2, 2, 5.2, 2, 5.8, 3, 5.8, 7]]);
g("n", 5.4, [[1, 2, 1, 7], [1, 4.6, 2, 2, 4, 2, 5, 3.2, 5, 7]]);
g("o", 5.4, [[3, 2, 4.4, 2.4, 5, 3.6, 5, 5.6, 4.4, 6.8, 3, 7, 1.6, 6.8, 1, 5.6, 1, 3.6, 1.6, 2.4, 3, 2]]);
g("p", 5.6, [[1, 2, 1, 9.4], [1, 4.6, 2, 2, 4.4, 2, 5.2, 3.4, 5.2, 5.4, 4.2, 7, 1, 7]]);
g("q", 5.6, [[5, 2, 5, 9.4], [5, 4.6, 4, 2, 1.6, 2, 0.8, 3.4, 0.8, 5.4, 1.8, 7, 5, 7]]);
g("r", 4.6, [[1, 2, 1, 7], [1, 4.6, 2, 2, 3.6, 2, 4.6, 2.8]]);
g("s", 5, [[4.8, 3, 4, 2, 2, 2, 1.2, 3, 1.2, 4.2, 2.2, 5, 3.8, 5, 4.8, 5.8, 4.8, 6.4, 4, 7, 2, 7, 1.2, 6]]);
g("t", 4.2, [[3.2, 0.8, 2.2, 1.6, 2.2, 6, 3, 7, 4.6, 7], [1.6, 2.4, 4.4, 2.4]]);
g("u", 5.4, [[1, 2, 1, 5.4, 2, 7, 4, 7, 5, 5.4, 5, 2]]);
g("v", 5.2, [[0.8, 2, 2.8, 7, 4.8, 2]]);
g("w", 6, [[0.8, 2, 1.8, 7, 3, 4.6, 4.2, 7, 5.2, 2]]);
g("x", 5.2, [[0.8, 2, 5, 7], [5, 2, 0.8, 7]]);
g("y", 5.4, [[0.8, 2, 3, 7, 5.2, 2], [3, 7, 3, 9.4, 2, 9.4, 1.2, 8.6]]);
g("z", 5, [[0.8, 2, 5, 2, 0.8, 7, 5, 7]]);

g("0", 6, [[3, 0, 4.8, 0.6, 5.4, 2, 5.4, 5, 4.8, 6.4, 3, 7, 1.2, 6.4, 0.6, 5, 0.6, 2, 1.2, 0.6, 3, 0]]);
g("1", 5, [[2, 1.4, 3.2, 0, 3.2, 7], [1.8, 7, 4.6, 7]]);
g("2", 5.6, [[0.8, 1.6, 1.6, 0, 4, 0, 5.2, 1.2, 5.2, 2.6, 4, 3.6, 1, 7, 5.2, 7]]);
g("3", 5.6, [[1.2, 1, 2.2, 0, 4, 0, 5.2, 1.2, 5.2, 2.6, 4, 3.5, 2.6, 3.5], [4, 3.5, 5.2, 3.5, 5.2, 5.8, 4, 7, 2.2, 7, 1.2, 6]]);
g("4", 5.6, [[3.8, 0, 1, 5, 5.2, 5], [3.8, 0, 3.8, 7]]);
g("5", 5.6, [[5, 0, 1, 0, 1, 3.2, 3.6, 3.2, 5, 3.8, 5, 5.8, 4, 7, 1.6, 7, 0.8, 6]]);
g("6", 5.6, [[5.2, 1, 4.2, 0, 2, 0, 0.8, 1.4, 0.8, 5.6, 1.8, 7, 4, 7, 5.2, 5.8, 5.2, 4.4, 4, 3.4, 2.4, 3.4, 1.2, 4.6]]);
g("7", 5.6, [[0.8, 0, 5.2, 0, 2.6, 7]]);
g("8", 5.6, [[3, 0, 4.4, 0.4, 5, 1.6, 5, 2.6, 4, 3.5, 2, 3.5, 1, 2.6, 1, 1.6, 1.6, 0.4, 3, 0], [4, 3.5, 5.2, 4.2, 5.2, 5.8, 4, 7, 2, 7, 0.8, 5.8, 0.8, 4.2, 2, 3.5]]);
g("9", 5.6, [[0.8, 6, 1.8, 7, 4, 7, 5.2, 5.6, 5.2, 1.4, 4, 0, 2, 0, 0.8, 1.4, 0.8, 3, 2, 3.6, 4.4, 3.6, 5.2, 2.4]]);
g(" ", 3, []);
g(".", 2.8, [[3, 6.6, 3, 6.6]]);
g(",", 2.8, [[3, 6.6, 3, 6.6], [3, 6.6, 2.4, 8.2]]);
g(":", 2.8, [[3, 2.6, 3, 2.6], [3, 5.8, 3, 5.8]]);
g(";", 2.8, [[3, 2.6, 3, 2.6], [3, 5.8, 3, 5.8], [3, 5.8, 2.4, 7.4]]);
g("'", 2.6, [[3.2, 0, 2.6, 1.8]]);
g("\u2019", 2.6, [[3.2, 0, 2.6, 1.8]]);
g('"', 4, [[1.8, 0, 1.4, 1.6], [3.4, 0, 3, 1.6]]);
g("\u201C", 4, [[1.8, 0, 1.4, 1.6], [3.4, 0, 3, 1.6]]);
g("\u201D", 4, [[1.8, 0, 1.4, 1.6], [3.4, 0, 3, 1.6]]);
g("!", 3, [[3, 0, 3, 4.6], [3, 6.4, 3, 6.4]]);
g("?", 5.4, [[1.6, 1.4, 2.4, 0, 4, 0, 5, 1, 5, 2.2, 4, 3.2, 3, 3.8, 3, 4.8], [3, 6.4, 3, 6.4]]);
g("-", 5.4, [[0.8, 3.6, 5, 3.6]]);
g("\u2013", 6, [[0.6, 3.6, 5.4, 3.6]]);
g("\u2014", 6.4, [[0.4, 3.6, 5.8, 3.6]]);
g("(", 3.4, [[4, 0.4, 2.6, 1.6, 2, 3.5, 2.6, 5.4, 4, 6.6]]);
g(")", 3.4, [[1.4, 0.4, 2.8, 1.6, 3.4, 3.5, 2.8, 5.4, 1.4, 6.6]]);
g("/", 4.6, [[4.6, 0, 1.4, 7]]);
g("%", 6.4, [[4.8, 0, 1.2, 7], [1.8, 0.6, 2.9, 0.6, 3.2, 1.6, 2.9, 2.6, 1.8, 2.6, 1.4, 1.6, 1.8, 0.6], [4.6, 4.4, 5.6, 4.4, 6, 5.4, 5.6, 6.4, 4.6, 6.4, 4.2, 5.4, 4.6, 4.4]]);
g("$", 5.6, [[5, 1, 4, 0, 2, 0, 0.8, 1.2, 0.8, 2.6, 2, 3.5, 4, 3.5, 5.2, 4.4, 5.2, 5.8, 4, 7, 2, 7, 0.8, 5.8], [3, -0.6, 3, 7.6]]);
g("&", 6, [[4.8, 1, 3.6, 0, 1.8, 0.4, 1, 1.8, 1.4, 3.2, 3, 4.2, 5.4, 7], [1.2, 5.6, 2.4, 4.6, 4.6, 4.8, 5, 5.8, 4, 7, 2.2, 7, 1.2, 6]]);
g("+", 5.6, [[3, 1.6, 3, 5.6], [1, 3.6, 5, 3.6]]);
g("=", 5.6, [[0.8, 2.6, 5, 2.6], [0.8, 4.8, 5, 4.8]]);
g("*", 5.6, [[3, 0.8, 3, 6.2], [0.8, 2.2, 5.2, 4.8], [5.2, 2.2, 0.8, 4.8]]);
g("#", 6, [[2.2, 0, 1.8, 7], [4, 0, 3.6, 7], [0.6, 2.6, 5.4, 2.6], [0.6, 4.8, 5.4, 4.8]]);
g("@", 6.4, [[5, 2, 4, 0.8, 2, 0.8, 0.8, 2.4, 0.8, 5, 2, 6.6, 4, 6.6, 5.2, 5.4, 5.2, 3.4, 4, 2.6, 2.8, 2.6, 2, 3.6, 2, 4.8, 3, 5.4, 4.2, 5, 4.6, 4]]);
g("_", 6, [[0.6, 7.6, 5.4, 7.6]]);
g("\u2022", 3, [[3, 3.4, 3, 3.4]]);
g("\u00B7", 2.6, [[3, 2.8, 3, 2.8]]);
g("\u2713", 5.6, [[0.8, 3.8, 2.4, 5.4, 5.2, 1.4]]);
g("\u00B0", 3.4, [[3, -0.2, 3.9, 0.2, 4.2, 1.1, 3.9, 1.9, 3, 2.3, 2.1, 1.9, 1.8, 1.1, 2.1, 0.2, 3, -0.2]]);
g("\u00D7", 5.6, [[1, 1, 5, 6], [5, 1, 1, 6]]);
g("\u00DC", 6, [[0.8, 0, 0.8, 5.4, 1.8, 7, 4.2, 7, 5.2, 5.4, 5.2, 0], [2.2, -1.2, 2.2, -1.2], [3.8, -1.2, 3.8, -1.2]]);
g("\u00FC", 5.4, [[1, 2, 1, 5.4, 2, 7, 4, 7, 5, 5.4, 5, 2], [2, 0.6, 2, 0.6], [4, 0.6, 4, 0.6]]);
g("\u00E9", 5.2, [[4.8, 3, 4, 2, 2, 2, 1, 3.4, 1, 5.6, 2, 7, 4, 7, 5, 6, 5, 4.4, 1, 4.4], [3.4, -0.8, 4.6, -0.8]]);
g("\u00ED", 3, [[2.6, 2.6, 2.6, 7], [2.6, 0.6, 2.6, 0.6], [3, -0.8, 4, -0.8]]);
g("\u00CD", 4.6, [[3, 0, 3, 7], [1.8, 0, 4.2, 0], [1.8, 7, 4.2, 7], [3.4, -1.6, 4.4, -1.6]]);

// ---------------------------------------------------------------- text engine
const WARN = [];
function glyphOf(ch) {
  const gl = F[ch];
  if (!gl) { WARN.push("missing glyph: " + JSON.stringify(ch)); return F["?"]; }
  return gl;
}
// width of str at cap height capPx, tracking px per char
function textW(str, cap, tracking) {
  const s = cap / 7; let w = 0;
  for (const ch of str) w += glyphOf(ch).a * s + (tracking || 0);
  return w - (tracking || 0);
}
// greedy wrap into lines of at most maxW; returns lines (never splits words)
function wrap(str, cap, maxW, tracking) {
  const words = str.split(" ");
  const lines = []; let cur = "";
  for (const wd of words) {
    const t = cur ? cur + " " + wd : wd;
    if (textW(t, cap, tracking) <= maxW || !cur) cur = t;
    else { lines.push(cur); cur = wd; }
  }
  if (cur) lines.push(cur);
  return lines;
}
// draw one glyph at (x, baselineY), cap height cap, stroke width w, serif?
function drawGlyph(ch, x, baseY, cap, w, c, serif) {
  const gl = glyphOf(ch), s = cap / 7;
  for (const poly of gl.s) {
    const pts = [];
    for (let i = 0; i + 1 < poly.length; i += 2) pts.push([x + poly[i] * s, baseY + (poly[i + 1] - 7) * s]);
    if (pts.length === 1) { fillCircle(pts[0][0], pts[0][1], w * 0.75, c); continue; }
    strokePoly(pts, w, c);
    if (serif) { // small ticks at ends of long vertical stems — Times-like feet
      for (let i = 0; i + 3 < poly.length; i += 2) {
        const x1 = poly[i], y1 = poly[i + 1], x2 = poly[i + 2], y2 = poly[i + 3];
        if (x1 === x2 && Math.abs(y2 - y1) >= 4.2) {
          for (const yy of [y1, y2]) {
            strokeLine(x + (x1 - 0.85) * s, baseY + (yy - 7) * s, x + (x1 + 0.85) * s, baseY + (yy - 7) * s, w, c);
          }
        }
      }
    }
  }
  return gl.a * s;
}
// opts: {cap, w, color, serif, tracking, align:'l'|'c'|'r', maxW (warn if exceeded)}
function drawText(str, x, baseY, o) {
  const cap = o.cap, w = o.w, c = o.color, tr = o.tracking || 0;
  let sx = x;
  const tw = textW(str, cap, tr);
  if (o.align === "c") sx = x - tw / 2;
  else if (o.align === "r") sx = x - tw;
  if (o.maxW && tw > o.maxW + 0.5) WARN.push("OVERFLOW '" + str.slice(0, 40) + "' w=" + tw.toFixed(0) + " max=" + o.maxW);
  let cx = sx;
  for (const ch of str) cx += drawGlyph(ch, cx, baseY, cap, w, c, !!o.serif) + tr;
  return tw;
}
// draw wrapped lines; returns bottom y. opts add leading.
function drawLines(lines, x, topY, o) {
  let y = topY + o.cap; // topY is the top of the cap-height box
  for (const ln of lines) { drawText(ln, x, y, o); y += o.leading; }
  return y - o.leading + o.cap; // bottom of last line's caps (approx, descenders excluded)
}
function hline(x0, x1, y, w, c) { fillRect(x0, y - w / 2, x1, y + w / 2, c); }
function vline(x, y0, y1, w, c) { fillRect(x - w / 2, y0, x + w / 2, y1, c); }
function box(x0, y0, x1, y1, w, c) {
  hline(x0, x1, y0, w, c); hline(x0, x1, y1, w, c); vline(x0, y0, y1, w, c); vline(x1, y0, y1, w, c);
}

// ---------------------------------------------------------------- palette
const WHITE = rgb("#FFFFFF"), NAVY = rgb("#1F2A44"), SKY = rgb("#7FB3D5");
const TEAL = rgb("#2A7F7F"), GREEN = rgb("#4C7A45"), AMBER = rgb("#B7791F");
const BLUE = rgb("#2F5D8A"), PURPLE = rgb("#6B5B95"), GREYBLU = rgb("#5B6B7A");
const ORANGE = rgb("#C25E2E"), LIGHTBLU = rgb("#DCE8F0"), SAND = rgb("#EFE6CF");
const MAPLAND = rgb("#E3D9BE"), MAPSEA = rgb("#DDE9EE");
const REG = [
  { name: "Europe", n: 10, col: rgb("#2F5D8A") },
  { name: "Middle East", n: 6, col: rgb("#B3402A") },
  { name: "Asia", n: 5, col: rgb("#4C7A45") },
  { name: "Africa", n: 1, col: rgb("#B7791F") },
  { name: "Americas", n: 7, col: rgb("#2A7F7F") },
  { name: "Oceania", n: 3, col: rgb("#6B5B95") },
  { name: "Global", n: 4, col: rgb("#5B6B7A") },
];
const TAGC = { C: rgb("#1E6B34"), O: rgb("#2F5D8A"), R: rgb("#8A6D1B") };
const TAGN = { C: "CONFIRMED", O: "OFFICIAL", R: "REPORTED" };

// ---------------------------------------------------------------- map
// Coarse continent polygons in [lon, lat]; equirectangular projection.
const LAND = [
  [[-168, 66], [-140, 70], [-120, 72], [-95, 80], [-75, 73], [-60, 62], [-55, 47], [-70, 42], [-80, 32], [-97, 26], [-105, 20], [-92, 15], [-83, 9], [-79, 9], [-95, 16], [-105, 20], [-117, 33], [-125, 40], [-125, 49], [-140, 60], [-165, 60]],
  [[-58, 64], [-45, 60], [-30, 68], [-22, 70], [-40, 76], [-58, 76]],
  [[-79, 9], [-72, 12], [-60, 9], [-52, 5], [-50, 0], [-40, -5], [-35, -9], [-40, -20], [-48, -28], [-58, -35], [-65, -41], [-70, -50], [-73, -54], [-70, -40], [-72, -20], [-77, -12], [-81, -5]],
  [[-17, 15], [-10, 31], [-5, 35], [10, 37], [20, 32], [30, 31], [35, 28], [43, 12], [51, 11], [48, 2], [40, -10], [35, -20], [32, -29], [26, -34], [19, -35], [15, -27], [12, -18], [9, 4], [-8, 5], [-13, 8]],
  [[-10, 36], [-9, 43], [-2, 48], [0, 51], [5, 53], [8, 57], [10, 59], [18, 56], [21, 55], [24, 59], [30, 60], [30, 70], [25, 71], [18, 69], [12, 65], [5, 60], [-2, 57], [-5, 50], [-9, 43]],
  [[30, 70], [40, 68], [50, 69], [60, 70], [70, 73], [80, 73], [90, 75], [100, 77], [110, 74], [120, 73], [130, 72], [140, 72], [150, 70], [158, 66], [162, 60], [158, 52], [142, 50], [140, 40], [135, 34], [130, 31], [127, 35], [122, 38], [120, 32], [122, 28], [115, 23], [108, 18], [105, 10], [100, 8], [98, 12], [92, 16], [89, 22], [86, 20], [80, 15], [77, 8], [75, 12], [72, 20], [66, 25], [60, 25], [57, 26], [52, 28], [50, 30], [48, 30], [44, 29], [42, 27], [40, 31], [36, 36], [33, 36], [30, 36], [28, 41], [30, 46]],
  [[113, -22], [114, -30], [115, -35], [120, -34], [124, -33], [129, -32], [132, -32], [135, -35], [138, -35], [140, -38], [145, -38], [150, -37], [153, -32], [153, -27], [150, -23], [146, -19], [142, -15], [142, -11], [137, -12], [135, -15], [132, -12], [130, -13], [126, -14], [122, -17], [118, -20]],
  [[167, -45], [174, -41], [178, -38], [173, -35], [167, -45]],
  [[95, 5], [98, 3], [100, 0], [104, -3], [106, -6], [110, -7], [114, -8], [119, -9], [120, -10], [115, -8], [110, -6], [105, -5], [100, -2], [96, 3]],
  [[-5, 50], [-3, 53], [-5, 56], [-2, 58], [0, 53], [-1, 51], [-5, 50]],
];
// pin: [storyNo, lon, lat, regionIndex]  region: 0 EU 1 ME 2 Asia 3 Africa 4 Americas 5 Oceania 6 Global
const PINS = [
  [1, 30.7, 36.9, 6], [2, 46.7, 24.6, 1], [3, -75.9, -11.2, 4], [4, 50.6, 26.2, 1],
  [5, 56.2, 26.2, 1], [6, 24, 59.8, 0], [7, 30.5, 50.4, 0], [8, -108.5, 25.6, 4],
  [9, 4.35, 50.85, 0], [10, 34.45, 31.5, 1], [11, 10, -30, 6], [12, 2.35, 48.85, 0],
  [13, 174.8, -41.3, 5], [14, 33.4, 47.9, 0], [15, 24, 49.8, 0], [16, 125.6, 7.1, 2],
  [17, 127, -8.5, 2], [18, 6.14, 46.2, 0], [19, 121.6, 25, 2], [20, 28.8, 59.7, 0],
  [21, -47.9, -15.8, 4], [22, 47.8, 30.5, 1], [23, 28.2, -25.7, 3], [24, -115.1, 36.2, 4],
  [25, -0.33, 51.45, 0], [26, -160, -21.2, 5], [27, 33, 49.2, 0], [28, 33.5, 37.6, 6],
  [29, 28, 38.6, 6], [30, 39.2, 21.5, 1], [31, -77, 38.9, 4], [32, -99, 31, 4],
  [33, -123.1, 49.3, 4], [34, 125.8, 39, 2], [35, 100.5, 13.75, 2], [36, 145, -37.8, 5],
];
function drawMap(x0, y0, x1, y1) {
  fillRect(x0, y0, x1, y1, MAPSEA);
  const mw = x1 - x0, mh = y1 - y0;
  const proj = (lon, lat) => [x0 + (lon + 180) / 360 * mw, y0 + (78 - lat) / 140 * mh];
  for (const poly of LAND) fillPoly(poly.map(p => proj(p[0], p[1])), MAPLAND);
  // graticule
  for (let lon = -120; lon <= 120; lon += 60) { const a = proj(lon, 78), b = proj(lon, -62); vline(a[0], y0, y1, 0.6, rgb("#C4D3DA")); }
  for (let lat = -40; lat <= 60; lat += 20) { const a = proj(-180, lat); hline(x0, x1, a[1], 0.6, rgb("#C4D3DA")); }
  for (const [n, lon, lat, ri] of PINS) {
    const [pxx, pyy] = proj(lon, lat);
    fillCircle(pxx, pyy, 7.5, REG[ri].col);
    ring(pxx, pyy, 7.5, 1, WHITE);
    drawText(String(n), pxx, pyy + 2.6, { cap: 7.5, w: 1.1, color: WHITE, align: "c" });
  }
}

// ---------------------------------------------------------------- illustrations
// Hero 1: globe + November calendar. Box x0..x1, y0..y1.
function illuCOP31(x0, y0, x1, y1) {
  fillRect(x0, y0, x1, y1, LIGHTBLU);
  const cx = x0 + 52, cy = y0 + 32, r = 26;
  fillCircle(cx, cy, r, SKY);
  fillPoly([[cx - 22, cy - 8], [cx - 6, cy - 18], [cx + 4, cy - 6], [cx - 2, cy + 6], [cx - 18, cy + 12], [cx - 26, cy + 2]], GREEN);
  fillPoly([[cx + 8, cy + 10], [cx + 20, cy + 2], [cx + 24, cy + 14], [cx + 12, cy + 22], [cx + 4, cy + 18]], GREEN);
  ring(cx, cy, r, 1.6, NAVY);
  strokeLine(cx - r, cy, cx + r, cy, 1.2, NAVY);
  strokeLine(cx, cy - r, cx, cy + r, 1.2, NAVY);
  // calendar, right side
  const kx = x0 + 108, ky = y0 + 8, cw = x1 - x0 - 118, chh = y1 - y0 - 16;
  fillRect(kx, ky, kx + cw, ky + chh, WHITE);
  box(kx, ky, kx + cw, ky + chh, 1, INK);
  drawText("NOV 2026", kx + cw / 2, ky + 11, { cap: 8, w: 1, color: INK, align: "c" });
  hline(kx, kx + cw, ky + 15, 1, INK);
  const cell = cw / 7, top = ky + 19;
  for (let d = 16; d <= 22; d++) {
    const i = d - 16, gx = kx + i * cell + cell / 2;
    if (d === 21) { fillCircle(gx, top + 7, 8, RED); drawText("21", gx, top + 9.5, { cap: 8, w: 1.1, color: WHITE, align: "c" }); }
    else drawText(String(d), gx, top + 9.5, { cap: 8, w: 1, color: INK, align: "c" });
  }
  drawText("DAY 13 · NO DEAL", kx + cw / 2, ky + chh - 4, { cap: 8, w: 1, color: RED, align: "c" });
}
// Hero 2: night skyline, missile trails.
function illuRiyadh(x0, y0, x1, y1) {
  fillRect(x0, y0, x1, y1, NAVY);
  fillCircle(x0 + 250, y0 + 16, 9, rgb("#F5E9C8"));
  const base = y1;
  const blds = [[0, 52, 26], [28, 38, 20], [50, 60, 30], [82, 34, 18], [102, 48, 26], [130, 30, 16], [148, 55, 24], [174, 40, 20], [196, 62, 28], [226, 36, 18], [246, 50, 24], [272, 42, 22]];
  for (const [bx, bh, bw] of blds) fillRect(x0 + bx, base - bh, x0 + bx + bw, base, rgb("#12161F"));
  // lit windows
  for (let i = 0; i < 40; i++) {
    const wx = x0 + 6 + ((i * 67) % 290), wy = base - 8 - ((i * 37) % 46);
    fillRect(wx, wy, wx + 2.5, wy + 3, rgb("#F5D97A"));
  }
  // three missile trails with red intercept dots
  const trails = [[x0 + 40, y0 + 58, x0 + 95, y0 + 14], [x0 + 130, y0 + 62, x0 + 185, y0 + 20], [x0 + 215, y0 + 56, x0 + 262, y0 + 12]];
  for (const [ax, ay, bx, by] of trails) {
    for (let t = 0; t <= 1.001; t += 0.14) {
      const mx = ax + (bx - ax) * t, my = ay + (by - ay) * t;
      fillCircle(mx, my, 1.6, rgb("#E8B4B4"));
    }
    fillCircle(bx, by, 4.5, rgb("#E33F2F")); ring(bx, by, 7, 1.2, WHITE);
  }
  fillRect(x1 - 78, y0 + 6, x1 - 8, y0 + 20, RED);
  drawText("3 DOWNED", x1 - 43, y0 + 16.5, { cap: 8, w: 1, color: WHITE, align: "c" });
}
// Hero 3: mountains + seismograph + big 6.7.
function illuPeru(x0, y0, x1, y1) {
  fillRect(x0, y0, x1, y1, rgb("#EFE3C8"));
  fillPoly([[x0, y1], [x0 + 55, y0 + 26], [x0 + 110, y1]], rgb("#8A7B5C"));
  fillPoly([[x0 + 80, y1], [x0 + 150, y0 + 34], [x0 + 220, y1]], rgb("#6E6A52"));
  fillPoly([[x0 + 190, y1], [x0 + 250, y0 + 22], [x0 + 304, y1]], rgb("#8A7B5C"));
  fillPoly([[x0 + 48, y0 + 32], [x0 + 55, y0 + 26], [x0 + 62, y0 + 32]], WHITE);
  fillPoly([[x0 + 143, y0 + 40], [x0 + 150, y0 + 34], [x0 + 157, y0 + 40]], WHITE);
  // seismograph strip
  fillRect(x0 + 10, y0 + 52, x1 - 10, y1 - 8, WHITE);
  box(x0 + 10, y0 + 52, x1 - 10, y1 - 8, 1, INK);
  const sy = y0 + 62, pts = [];
  for (let i = 0; i <= 24; i++) {
    const px2 = x0 + 16 + i * ((x1 - x0 - 32) / 24);
    const amp = [0, 2, -3, 6, -9, 4, -2, 3, -14, 10, -6, 3, -2, 2, -3, 2, 0, 1, -1, 1, 0, 0, 0, 0, 0][i];
    pts.push([px2, sy + amp]);
  }
  strokePoly(pts, 1.6, RED);
  drawText("6.7", x1 - 62, y0 + 34, { cap: 30, w: 2.2, color: RED });
  drawText("108 KM DEEP · 00:09 UTC", x0 + 14, y0 + 16, { cap: 8.5, w: 1, color: INK });
}
// Small mid-panel icon strips (26px tall zone, full inner width).
function illuMid(n, x0, y0, x1, y1) {
  const midY = y0 + (y1 - y0) / 2;
  if (n === 4) { // base + flame
    fillRect(x0, midY + 2, x0 + 34, y1, rgb("#8A7B5C")); fillRect(x0 + 44, midY + 6, x0 + 74, y1, rgb("#8A7B5C"));
    fillPoly([[x0 + 96, y1], [x0 + 104, midY - 4], [x0 + 110, midY + 4], [x0 + 116, midY - 8], [x0 + 124, y1]], rgb("#E07B2A"));
    fillPoly([[x0 + 104, y1], [x0 + 110, midY + 4], [x0 + 116, y1]], rgb("#F5D97A"));
  } else if (n === 5) { // tanker
    fillRect(x0, midY + 2, x0 + 120, midY + 12, rgb("#3A3F4A"));
    fillRect(x0 + 84, midY - 8, x0 + 104, midY + 2, rgb("#3A3F4A"));
    strokeLine(x0 + 92, midY - 14, x0 + 92, midY - 8, 2, rgb("#3A3F4A"));
    strokeLine(x0, y1 - 2, x1, y1 - 2, 2, SKY); strokeLine(x0 + 10, y1 - 6, x0 + 60, y1 - 6, 1.4, SKY);
  } else if (n === 6) { // ship + smoke
    fillRect(x0, midY + 4, x0 + 110, midY + 12, INK);
    fillPoly([[x0 + 20, midY + 4], [x0 + 30, midY - 10], [x0 + 40, midY + 4]], rgb("#B3402A"));
    fillCircle(x0 + 62, midY - 10, 5, rgb("#9AA4AC")); fillCircle(x0 + 72, midY - 13, 6, rgb("#9AA4AC")); fillCircle(x0 + 84, midY - 10, 5, rgb("#9AA4AC"));
    strokeLine(x0, y1 - 2, x1, y1 - 2, 2, SKY);
  } else if (n === 7) { // missile trail
    strokeLine(x0 + 8, y1 - 4, x0 + 120, midY - 6, 2, rgb("#9AA4AC"));
    fillPoly([[x0 + 120, midY - 10], [x0 + 138, midY - 4], [x0 + 120, midY + 2]], rgb("#B3402A"));
    fillCircle(x0 + 130, midY - 4, 3, rgb("#E33F2F"));
    fillRect(x0 + 20, midY + 4, x0 + 44, y1, rgb("#3A3F4A")); fillRect(x0 + 52, midY + 8, x0 + 70, y1, rgb("#3A3F4A"));
  } else if (n === 8) { // star badge
    const cx = x0 + 22, cy = midY;
    fillPoly([[cx, cy - 11], [cx + 3.4, cy - 3.6], [cx + 11, cy - 3.4], [cx + 5.4, cy + 1.8], [cx + 7.6, cy + 9], [cx, cy + 4.6], [cx - 7.6, cy + 9], [cx - 5.4, cy + 1.8], [cx - 11, cy - 3.4], [cx - 3.4, cy - 3.6]], rgb("#C9A227"));
    drawText("11 DEAD", x0 + 44, midY + 4, { cap: 11, w: 1.2, color: RED });
    drawText("IN CLASHES", x0 + 44, midY + 15, { cap: 8, w: 1, color: INK });
  } else if (n === 9) { // two flags
    strokeLine(x0 + 16, midY - 10, x0 + 16, y1, 2, INK);
    fillPoly([[x0 + 16, midY - 10], [x0 + 52, midY - 6], [x0 + 16, midY - 2]], rgb("#2F5D8A"));
    strokeLine(x0 + 62, midY - 10, x0 + 62, y1, 2, INK);
    fillPoly([[x0 + 62, midY - 10], [x0 + 98, midY - 6], [x0 + 62, midY - 2]], rgb("#B3402A"));
    drawText("98.5%", x0 + 108, midY + 5, { cap: 12, w: 1.3, color: INK });
  } else if (n === 10) { // drone
    fillCircle(x0 + 30, midY - 4, 4, rgb("#3A3F4A")); fillCircle(x0 + 58, midY - 4, 4, rgb("#3A3F4A"));
    fillRect(x0 + 34, midY - 6, x0 + 54, midY + 2, rgb("#3A3F4A"));
    strokeLine(x0 + 18, midY - 10, x0 + 42, midY - 10, 1.6, INK); strokeLine(x0 + 46, midY - 10, x0 + 70, midY - 10, 1.6, INK);
    fillCircle(x0 + 44, midY + 6, 2.5, RED);
    drawText("3 KILLED", x0 + 84, midY + 5, { cap: 11, w: 1.2, color: RED });
  } else if (n === 11) { // price line
    const pts = [[x0 + 6, midY - 8], [x0 + 26, midY - 2], [x0 + 46, midY + 2], [x0 + 66, midY + 10], [x0 + 86, midY + 4], [x0 + 104, midY - 6]];
    strokePoly(pts, 2, RED);
    drawText("$58,983", x0 + 110, midY + 4, { cap: 10, w: 1.2, color: INK });
  } else if (n === 12) { // crowd
    for (let i = 0; i < 9; i++) {
      const cx = x0 + 10 + i * 12, cy = midY + 2 + (i % 3) * 3;
      fillCircle(cx, cy - 6, 3, rgb("#3A3F4A")); fillRect(cx - 3.5, cy - 2, cx + 3.5, cy + 8, rgb("#3A3F4A"));
    }
    drawText("82,500", x0 + 122, midY + 5, { cap: 12, w: 1.3, color: INK });
    drawText("MARCHED", x0 + 122, midY + 16, { cap: 8, w: 1, color: INK });
  } else if (n === 13) { // cricket bat + ball
    strokeLine(x0 + 18, midY + 10, x0 + 44, midY - 10, 5, rgb("#C9A227"));
    fillCircle(x0 + 58, midY - 6, 5, RED);
    drawText("136", x0 + 74, midY + 5, { cap: 13, w: 1.3, color: INK });
    drawText("RAHUL", x0 + 74, midY + 16, { cap: 8, w: 1, color: INK });
  }
}

// ---------------------------------------------------------------- layout
const MX = 14, RX = W - MX; // side margins
fill(CREAM);

// --- top kicker + masthead ---
drawText("THE WORLD IN ONE DAY", MX, 17, { cap: 10, w: 1.1, color: RED, tracking: 0.6 });
drawText("36 STORIES · 7 REGIONS · EVERY ONE DATED", RX, 17, { cap: 10, w: 1.1, color: INK, align: "r", tracking: 0.6 });
hline(MX, RX, 24, 1.2, INK);
// masthead: light classical serif, wide tracking, thin strokes
drawText("Saturday 21 November 2026", W / 2, 88, { cap: 52, w: 3.0, color: INK, serif: true, tracking: 1, align: "c" });
hline(MX, RX, 96, 1.2, INK);
drawText("Climate talks run into day 13  ·  Three missiles downed over Riyadh  ·  M6.7 quake shakes central Peru", W / 2, 110, { cap: 12, w: 1.1, color: INK, align: "c" });
hline(MX, RX, 116, 1, RED);

// --- timeline "THE DAY IN UTC" ---
const TL = [
  ["00:09", "Peru M6.7 quake"], ["02:00", "Sinaloa raid"], ["03:45", "Robot talks end"],
  ["05:47", "Kyiv missiles"], ["09:42", "Banda Sea M6.8"], ["13:30", "Bitcoin rebounds"], ["22:10", "COP31 pauses"],
];
fillRect(MX, 122, MX + 108, 148, INK);
drawText("THE DAY", MX + 54, 133, { cap: 9, w: 1, color: WHITE, align: "c" });
drawText("IN UTC", MX + 54, 143, { cap: 9, w: 1, color: WHITE, align: "c" });
{
  const x0 = MX + 116, cw = (RX - x0) / 7;
  for (let i = 0; i < 7; i++) {
    const cx = x0 + i * cw;
    if (i > 0) vline(cx, 124, 146, 0.8, rgb("#B9AE94"));
    drawText(TL[i][0], cx + 8, 133, { cap: 10, w: 1.2, color: RED });
    drawText(TL[i][1], cx + 8, 145, { cap: 9.5, w: 1, color: INK, maxW: cw - 12 });
  }
}
hline(MX, RX, 152, 1, INK);

// --- stat strip: 6 numbers, generous gaps ---
const STATS = [
  ["13", "Day of COP31, planned to close day 12"],
  ["3", "missiles shot down over Riyadh"],
  ["6.7", "magnitude of Peru quake, 108 km deep"],
  ["146", "people safe after Davao jet emergency"],
  ["$58,983", "Bitcoin early Saturday, down 3.9% in a day"],
  ["136", "Rahul's score as India lead NZ by 118"],
];
{
  const cw = (RX - MX) / 6;
  for (let i = 0; i < 6; i++) {
    const cx = MX + i * cw;
    if (i > 0) vline(cx, 162, 192, 0.8, rgb("#B9AE94"));
    drawText(STATS[i][0], cx + 10, 176, { cap: 22, w: 2.0, color: INK, maxW: cw - 16 });
    const ll = wrap(STATS[i][1], 8.5, cw - 20, 0);
    if (ll.length > 2) WARN.push("stat label too long: " + STATS[i][1]);
    drawLines(ll.slice(0, 2), cx + 10, 180, { cap: 8.5, w: 1.1, color: INK, leading: 11 });
  }
}
hline(MX, RX, 204, 1, INK);

// --- region bar: 7 equal segments, name + honest count (sum 36) ---
{
  const cw = (RX - MX) / 7, y0 = 208, y1 = 224;
  for (let i = 0; i < 7; i++) {
    fillRect(MX + i * cw + (i ? 1.5 : 0), y0, MX + (i + 1) * cw - (i < 6 ? 1.5 : 0), y1, REG[i].col);
    drawText(REG[i].name + " " + REG[i].n, MX + (i + 0.5) * cw, y1 - 5, { cap: 10, w: 1.1, color: WHITE, align: "c" });
  }
}

// --- hero row: 3 large panels ---
const HERO = [
  { n: 1, tag: "C", bar: rgb("#2F5D8A"), label: "COP31: OVERTIME", loc: "ANTALYA, TÜRKIYE · CLIMATE",
    head: ["Climate summit runs on", "into Saturday, no deal"],
    body: "Missed its Friday close. A draft with no fossil fuels split nearly 200 nations. Vote moves to Sunday 09:00.",
    src: "AFP, Reuters", illu: illuCOP31 },
  { n: 2, tag: "O", bar: rgb("#B3402A"), label: "SAUDI: MISSILES", loc: "RIYADH · WAR",
    head: ["Houthi missiles aimed", "at Riyadh shot down"],
    body: "Coalition says it downed 3 ballistic missiles just after 2 a.m.; two blasts heard. Two more downed over Jizan.",
    src: "Arab News, Al Jazeera", illu: illuRiyadh },
  { n: 3, tag: "O", bar: rgb("#B3402A"), label: "PERU: QUAKE 6.7", loc: "JUNÍN, PERU · EARTHQUAKE",
    head: ["Magnitude 6.7 quake", "shakes central Peru"],
    body: "00:09 UTC, 108 km deep near Carhuamayo. Felt in Lima; no deaths, no tsunami risk. 152 homes uninhabitable.",
    src: "USGS, IGP", illu: illuPeru },
];
{
  const y0 = 230, y1 = 426, pw = (RX - MX - 24) / 3;
  for (let i = 0; i < 3; i++) {
    const h = HERO[i], x0 = MX + i * (pw + 12), x1 = x0 + pw;
    fillRect(x0, y0, x1, y1, PAPER);
    box(x0, y0, x1, y1, 1.2, INK);
    // label bar
    fillRect(x0, y0, x1, y0 + 20, h.bar);
    drawText(h.n + " · " + h.label, x0 + 8, y0 + 14.5, { cap: 10, w: 1.1, color: WHITE, maxW: pw - 40 });
    fillCircle(x1 - 16, y0 + 10, 7.5, WHITE);
    drawText(h.tag, x1 - 16, y0 + 12.8, { cap: 8, w: 1.2, color: h.bar, align: "c" });
    // illustration
    h.illu(x0 + 8, y0 + 26, x1 - 8, y0 + 88);
    // location + source share one band; headline and body each get their own
    drawText(h.loc, x0 + 8, y0 + 103, { cap: 9.5, w: 1.1, color: RED, tracking: 0.3, maxW: pw - 16 });
    drawText(h.src, x1 - 8, y0 + 103, { cap: 9.5, w: 1.1, color: rgb("#555045"), align: "r" });
    drawLines(h.head, x0 + 8, y0 + 108, { cap: 17, w: 1.6, color: INK, leading: 20.5 });
    const bl = wrap(h.body, 9.5, pw - 16, 0);
    if (bl.length > 3) WARN.push("hero body too long: " + h.body);
    drawLines(bl.slice(0, 3), x0 + 8, y0 + 152.5, { cap: 9.5, w: 1.15, color: INK, leading: 13.5 });
  }
}

// --- mid grid: 2 rows x 5 panels ---
const MID = [
  { n: 4, tag: "O", bar: rgb("#B3402A"), label: "BAHRAIN: US BASES HIT", head: ["Iran hits two US", "bases in Bahrain"], body: "IRGC hit al-Riffa and Awali; no injuries.", src: "Bahrain, UKMTO" },
  { n: 5, tag: "O", bar: rgb("#B3402A"), label: "HORMUZ: TANKERS HIT", head: ["Two tankers hit", "off Oman; third hit"], body: "Two hit off Khasab; one crew missing.", src: "UKMTO" },
  { n: 6, tag: "O", bar: rgb("#2F5D8A"), label: "BALTIC: SHIP ABLAZE", head: ["Drones set Sparta II", "ablaze off Finland"], body: "Crew evacuated; Finland suspects Ukraine.", src: "France 24, Al Jazeera" },
  { n: 7, tag: "O", bar: rgb("#2F5D8A"), label: "KYIV: MISSILES", head: ["Missiles hit Kyiv", "at 5:47"], body: "Two homes ablaze in Podil, city says.", src: "Kyiv Post" },
  { n: 8, tag: "C", bar: rgb("#2A7F7F"), label: "SINALOA: CAPTURED", head: ["Troops capture cartel", "boss 'Chapo Isidro'"], body: "FBI most-wanted held in Guasave; 11 killed.", src: "FBI, Euronews, AP" },
  { n: 9, tag: "O", bar: rgb("#2F5D8A"), label: "EU–INDONESIA: DEAL", head: ["EU and Indonesia sign", "free-trade deal"], body: "After 10 years of talks; tariffs cut 98.5%.", src: "European Commission" },
  { n: 10, tag: "R", bar: rgb("#B3402A"), label: "GAZA: STRIKE", head: ["Israeli drone strike", "kills 3 in Gaza City"], body: "Car hit in Tel al-Hawa; three giving out food.", src: "Al Jazeera, ToI" },
  { n: 11, tag: "R", bar: rgb("#5B6B7A"), label: "BITCOIN: TWO-YEAR LOW", head: ["Bitcoin falls to its", "lowest since 2024"], body: "Two-year low at 04:13 UTC; back over $60,000.", src: "CoinGecko" },
  { n: 12, tag: "O", bar: rgb("#2F5D8A"), label: "FRANCE: PROTESTS", head: ["Sixth Saturday of", "protests in France"], body: "82,500 marched; 70,000 police on duty.", src: "France 24" },
  { n: 13, tag: "C", bar: rgb("#6B5B95"), label: "CRICKET: RAHUL 136", head: ["Rahul hits 136 as", "India lead NZ by 118"], body: "India 486-4 on day 3 in Wellington; Gill 98.", src: "Reuters" },
];
{
  const y0 = 430, rowH = 124, gap = 6, pw = (RX - MX - 4 * 10) / 5;
  for (let i = 0; i < 10; i++) {
    const m = MID[i], row = (i / 5) | 0, col = i % 5;
    const x0 = MX + col * (pw + 10), x1 = x0 + pw, py0 = y0 + row * (rowH + gap), py1 = py0 + rowH;
    fillRect(x0, py0, x1, py1, PAPER);
    box(x0, py0, x1, py1, 1, INK);
    fillRect(x0, py0, x1, py0 + 16, m.bar);
    drawText(m.n + " · " + m.label, x0 + 6, py0 + 11.5, { cap: 8.5, w: 1, color: WHITE, maxW: pw - 28 });
    fillCircle(x1 - 11, py0 + 8, 6.5, WHITE);
    drawText(m.tag, x1 - 11, py0 + 10.6, { cap: 7, w: 1.1, color: m.bar, align: "c" });
    illuMid(m.n, x0 + 6, py0 + 20, x1 - 6, py0 + 44);
    hline(x0 + 6, x1 - 6, py0 + 48, 0.8, GREY);
    drawLines(m.head, x0 + 6, py0 + 50, { cap: 11.5, w: 1.25, color: INK, leading: 15 });
    const bl = wrap(m.body, 9.5, pw - 12, 0);
    if (bl.length > 2) WARN.push("mid body too long #" + m.n + ": " + m.body);
    drawLines(bl.slice(0, 2), x0 + 6, py0 + 84, { cap: 9.5, w: 1.15, color: INK, leading: 11.5 });
    drawText(m.src, x0 + 6, py1 - 6, { cap: 8.5, w: 1.1, color: rgb("#555045"), maxW: pw - 12 });
  }
}

// --- map + list ---
const LIST = [
  [14, "Kryvyi Rih: missile kills 2 (Kyiv Ind.)"],
  [15, "Lviv: Russian strike kills 2, 10 injured"],
  [16, "Davao: jet lands safe, 146 safe (AP)"],
  [17, "Timor-Leste: M6.8 quake, felt Darwin (USGS)"],
  [18, "Geneva: 128 nations agree AI-weapon draft (AJ)"],
  [19, "Taiwan: 21 jets patrol, 15 cross line (Taipei)"],
  [20, "Ust-Luga: drones hit port; NATO jets up (KP)"],
  [21, "Brazil: Bolsonaro moved to ICU (Reuters)"],
  [22, "Basra: power station fire kills 4, 30 hurt (INA)"],
  [23, "Pretoria: UN, AU honour Mlambo-Ngcuka (UN)"],
  [24, "Las Vegas: Russell fastest, 1:34.041 (F1)"],
  [25, "Twickenham: England rout NZ 37-12 (Reuters)"],
  [26, "Cook Islands: relief ship ready (RNZ)"],
  [27, "Zelensky: Crimea bridge 'will not stay' (NBC)"],
  [28, "Antalya: EU warns of 'fossil summit' (AFP)"],
  [29, "Antalya: Panama may block climate deal (Al Jaz.)"],
  [30, "Yemen: Houthis threaten Jeddah ports (Al Jaz.)"],
  [31, "Washington: Vance on Iran strikes (Reuters)"],
  [32, "Texas: execution of man, 70, takes 63 min (ABC)"],
  [33, "Vancouver: Canada rests in climate trial (AFP)"],
  [34, "Pyongyang: Kim tours factories (KCNA)"],
  [35, "Bangkok: arsenic plan for two rivers (Nation)"],
  [36, "Melbourne: Cummins keeps captaincy (ABC)"],
];
{
  const y0 = 690, y1 = 926, mapX1 = 344;
  drawText("WHERE IT HAPPENED", MX, y0 + 11, { cap: 10, w: 1.1, color: INK, tracking: 0.4 });
  drawText("pins match the story numbers · pin colour is the region", MX, y0 + 22, { cap: 8, w: 1, color: rgb("#555045") });
  drawText("ALSO ON SATURDAY 21 NOVEMBER — 23 MORE STORIES", 352, y0 + 11, { cap: 10, w: 1.1, color: INK, tracking: 0.4 });
  drawText("one line each · source in brackets", 352, y0 + 22, { cap: 8, w: 1, color: rgb("#555045") });
  hline(MX, RX, y0 + 27, 1, INK);
  box(MX, y0 + 32, mapX1, y1, 1.2, INK);
  drawMap(MX + 1, y0 + 33, mapX1 - 1, y1 - 1);
  // list in 2 columns: 14–25 left, 26–36 right
  const colW = 323, rowH = (y1 - (y0 + 32)) / 12;
  for (let i = 0; i < 23; i++) {
    const [n, txt] = LIST[i];
    const col = i < 12 ? 0 : 1, row = i < 12 ? i : i - 12;
    const lx = 352 + col * (colW + 12), ly = y0 + 32 + row * rowH + rowH / 2;
    // region colour per story number
    const regionOf = { 14: 0, 15: 0, 16: 2, 17: 2, 18: 0, 19: 2, 20: 0, 21: 4, 22: 1, 23: 3, 24: 4, 25: 0, 26: 5, 27: 0, 28: 6, 29: 6, 30: 1, 31: 4, 32: 4, 33: 4, 34: 2, 35: 2, 36: 5 };
    fillCircle(lx + 7, ly, 7, REG[regionOf[n]].col);
    drawText(String(n), lx + 7, ly + 2.6, { cap: 7.5, w: 1.1, color: WHITE, align: "c" });
    drawText(txt, lx + 18, ly + 3, { cap: 8.5, w: 1, color: INK, maxW: colW - 18 });
  }
}

// --- date check ---
{
  const y0 = 932, y1 = 978;
  box(MX, y0, RX, y1, 1.5, RED);
  fillRect(MX + 8, y0 - 8, MX + 108, y0 + 8, RED);
  drawText("DATE CHECK", MX + 58, y0 + 3.5, { cap: 9.5, w: 1.1, color: WHITE, align: "c" });
  const dc = "Left out as earlier news: Wall Street correction (Fri 20 Nov) · Kyiv bridges barrage (Fri) · missile in Poland (Fri 20 Nov) · UK–EU deal (Fri) · Cyclone Akvan landfall (Fri) · Denmark expels Russian attaché (20 Nov) · ICJ Myanmar ruling (19 Nov) · Trump–Xi–Putin summit (19–20 Nov). Not yet known: COP31 final vote (Sun 09:00) · BepiColombo Mercury insertion.";
  const dl = wrap(dc, 9, RX - MX - 24, 0);
  if (dl.length > 3) WARN.push("date check wraps to " + dl.length + " lines");
  drawLines(dl.slice(0, 3), MX + 12, y0 + 12, { cap: 9, w: 1, color: INK, leading: 12 });
}

// --- footer ---
drawText("Every story here happened, or was first reported, on Saturday 21 November 2026. Officials' counts and claims are attributed.", W / 2, 994, { cap: 9.5, w: 1, color: INK, align: "c", maxW: RX - MX });
drawText("C CONFIRMED = 2+ outlets  ·  O OFFICIAL = as stated by authorities  ·  R REPORTED = one outlet  ·  Sources named beside each story  ·  Original drawings", W / 2, 1010, { cap: 8.5, w: 1, color: rgb("#555045"), align: "c", maxW: RX - MX });

// ---------------------------------------------------------------- run
const out = writePNG();
if (WARN.length) { for (const w of WARN) console.error("WARN: " + w); process.exitCode = 1; }
else console.log("OK " + out);
