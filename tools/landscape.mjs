// Generates the low-poly scenery SVGs in img/. Run from the repo root:
//   node tools/landscape.mjs
// Output is deterministic (seeded), so re-running only changes files when this script changes.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "img");
mkdirSync(OUT, { recursive: true });

// ---------- helpers ----------
function rng(seed) {
  return function () {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (c) => "#" + c.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("");
const mix = (a, b, t) => {
  const A = hex(a), B = hex(b);
  return toHex(A.map((v, i) => v + (B[i] - v) * clamp(t, 0, 1)));
};
const tone = (c, k) => (k >= 0 ? mix(c, "#ffffff", k) : mix(c, "#000000", -k));
const n1 = (v) => Math.round(v * 10) / 10;
const pts = (list) => list.map((p) => n1(p[0]) + "," + n1(p[1])).join(" ");
const poly = (list, fill, extra = "") => `<polygon points="${pts(list)}" fill="${fill}"${extra}/>`;
const centroid = (a, b, c) => [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3];
const svg = (w, h, par, body, style = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="${par}">` +
  (style ? `<style>${style}</style>` : "") + body + `</svg>\n`;
const write = (name, text) => {
  writeFileSync(join(OUT, name), text);
  console.log(name, (text.length / 1024).toFixed(1) + " KB");
};

// Catmull-Rom sampling for smooth center lines.
function spline(points, samples) {
  const out = [];
  const segs = points.length - 1;
  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * segs;
    const k = Math.min(Math.floor(t), segs - 1);
    const u = t - k;
    const p0 = points[Math.max(k - 1, 0)], p1 = points[k], p2 = points[k + 1], p3 = points[Math.min(k + 2, segs)];
    out.push([0, 1].map((d) =>
      0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * u + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * u * u +
        (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * u * u * u)));
  }
  return out;
}

// ---------- side-view pieces ----------

// A mountain range: the ridge is subdivided, then each column is dropped to the base in jittered rows.
// Faces that slope up toward the sun (left) are lit, faces sloping away are shaded.
function ridgeLayer({ seed, ridge, base = 760, rows = 5, step = 44, rough = 10, colors, snowline, haze = 0.35, fade }) {
  const r = rng(seed);
  const top = [];
  for (let i = 0; i < ridge.length - 1; i++) {
    const [x0, y0] = ridge[i], [x1, y1] = ridge[i + 1];
    const n = Math.max(1, Math.round((x1 - x0) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      top.push([x0 + (x1 - x0) * t + (k ? (r() - 0.5) * step * 0.3 : 0), y0 + (y1 - y0) * t + (k ? (r() - 0.5) * rough : 0)]);
    }
  }
  top.push(ridge[ridge.length - 1]);

  const cols = top.map(([x, y], i) => {
    const col = [[x, y]];
    for (let k = 1; k <= rows; k++) {
      const t = Math.pow(k / rows, 1.35);
      const edge = i === 0 || i === top.length - 1 || k === rows;
      col.push([x + (edge ? 0 : (r() - 0.5) * step * 0.55), y + (base - y) * t + (k < rows ? (r() - 0.5) * 14 : 0)]);
    }
    return col;
  });

  let out = poly([...top, [top[top.length - 1][0], base], [top[0][0], base]], colors.mid);
  for (let i = 0; i < cols.length - 1; i++) {
    const a = cols[i], b = cols[i + 1];
    const slope = (a[0][1] - b[0][1]) / Math.max(1, b[0][0] - a[0][0]);
    for (let k = 0; k < rows; k++) {
      const quads = (i + k) % 2
        ? [[a[k], b[k], b[k + 1]], [a[k], b[k + 1], a[k + 1]]]
        : [[a[k], b[k], a[k + 1]], [b[k], b[k + 1], a[k + 1]]];
      quads.forEach((tri, q) => {
        const c = centroid(...tri);
        const depth = k / rows;
        let light = clamp(slope * 1.6, -1, 1) * (1 - 0.5 * depth) + (r() - 0.5) * 0.45 + (q ? -0.06 : 0.06);
        light = clamp(light, -1, 1);
        const snowy = snowline && c[1] < snowline + (r() - 0.5) * 36;
        const pal = snowy ? colors.snow : colors;
        let fill = light > 0 ? mix(pal.mid, pal.lit, light) : mix(pal.mid, pal.dark, -light);
        if (!snowy) fill = mix(fill, colors.haze, depth * haze);
        if (fade && c[1] > fade.from) fill = mix(fill, fade.color, Math.pow((c[1] - fade.from) / (fade.to - fade.from), 1.2));
        out += poly(tri, fill);
      });
    }
  }
  return { svg: out, top };
}

function ridgeY(top, x) {
  for (let i = 0; i < top.length - 1; i++) {
    if (x >= top[i][0] && x <= top[i + 1][0]) {
      const t = (x - top[i][0]) / (top[i + 1][0] - top[i][0]);
      return top[i][1] + (top[i + 1][1] - top[i][1]) * t;
    }
  }
  return top[top.length - 1][1];
}

// A pine in three tiers; left halves catch the light.
function pine(x, y, h, lit, dark, trunk = "#4a3527") {
  const tw = h * 0.07;
  let s = poly([[x - tw, y], [x + tw, y], [x + tw, y - h * 0.16], [x - tw, y - h * 0.16]], trunk);
  for (let k = 0; k < 3; k++) {
    const w = h * 0.46 * (1 - k * 0.24);
    const yb = y - h * 0.12 - k * h * 0.25;
    const yt = k === 2 ? y - h : yb - h * 0.45;
    const notch = yb + h * 0.04;
    s += poly([[x - w / 2, yb], [x, notch], [x, yt]], lit);
    s += poly([[x, yt], [x, notch], [x + w / 2, yb]], dark);
  }
  return s;
}

function forest(r, { count, xMin, xMax, yAt, band, size, lit, dark, avoid = () => false }) {
  const trees = [];
  let tries = 0;
  while (trees.length < count && tries++ < count * 20) {
    const x = xMin + r() * (xMax - xMin);
    const y = yAt(x) + 6 + r() * band;
    if (avoid(x, y)) continue;
    trees.push([x, y]);
  }
  trees.sort((a, b) => a[1] - b[1]);
  return trees.map(([x, y]) => {
    const h = size(y) * (0.75 + r() * 0.5);
    const j = (r() - 0.5) * 0.12;
    return pine(x, y, h, tone(lit, j), tone(dark, j));
  }).join("");
}

// Faceted blob: fan of triangles from a center through an inner ring to a jittered rim.
function facetedOval(r, cx, cy, rx, ry, n, colorAt) {
  const rim = [], inner = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 0.85 + r() * 0.3;
    rim.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
    inner.push([cx + Math.cos(a + 0.3) * rx * 0.5 * k, cy + Math.sin(a + 0.3) * ry * 0.5 * k]);
  }
  let s = "";
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    s += poly([[cx, cy], inner[i], inner[j]], colorAt(0.2, i));
    s += poly([inner[i], rim[i], rim[j]], colorAt(0.8, i));
    s += poly([inner[i], rim[j], inner[j]], colorAt(0.6, i));
  }
  return s;
}

// A faceted ribbon along a center line: three points across at each sample, four triangles per step.
function ribbon(center, widthAt, colorAt, finish = (c) => c) {
  const side = center.map((p, i) => {
    const a = center[Math.max(i - 1, 0)], b = center[Math.min(i + 1, center.length - 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len, w = widthAt(i) / 2;
    return [[p[0] + nx * w, p[1] + ny * w], [p[0] - nx * w, p[1] - ny * w]];
  });
  let s = "";
  for (let i = 0; i < center.length - 1; i++) {
    const [l0, r0] = side[i], [l1, r1] = side[i + 1], c0 = center[i], c1 = center[i + 1];
    [[l0, c0, l1], [c0, c1, l1], [c0, r0, c1], [r0, r1, c1]].forEach((tri, q) => {
      s += poly(tri, finish(colorAt(q, i), centroid(...tri)[1]));
    });
  }
  return s;
}

// ---------- hero scenery (1440 x 720, anchored bottom-center) ----------
const W = 1440, H = 720;
const MIST = "#e7eee6"; // must match --mist in css/styles.css
const SLICE = "xMidYMax slice";

// Sky: faint facets over a dawn gradient. Stretched to the hero, so no circles live here.
{
  const r = rng(7);
  const sw = 1440, sh = 900, cx = 12, cy = 8;
  const grid = [];
  for (let j = 0; j <= cy; j++) {
    grid.push([]);
    for (let i = 0; i <= cx; i++) {
      const edgeX = i === 0 || i === cx, edgeY = j === 0 || j === cy;
      grid[j].push([(i / cx) * sw + (edgeX ? 0 : (r() - 0.5) * 70), (j / cy) * sh + (edgeY ? 0 : (r() - 0.5) * 60)]);
    }
  }
  const skyAt = (y) => {
    const t = y / sh;
    return t < 0.55 ? mix("#a9cbe0", "#d6e5e6", t / 0.55) : mix("#d6e5e6", "#f6dfb4", (t - 0.55) / 0.45);
  };
  let body = `<rect width="${sw}" height="${sh}" fill="#d6e5e6"/>`;
  for (let j = 0; j < cy; j++) {
    for (let i = 0; i < cx; i++) {
      const a = grid[j][i], b = grid[j][i + 1], c = grid[j + 1][i + 1], d = grid[j + 1][i];
      for (const tri of [[a, b, c], [a, c, d]]) {
        body += poly(tri, tone(skyAt(centroid(...tri)[1]), (r() - 0.5) * 0.07));
      }
    }
  }
  write("sky.svg", svg(sw, sh, "none", body));
}

// Far range: snowy peaks right of center, low on the left where the headline sits. Sun and clouds live here.
{
  const r = rng(11);
  let body = "";
  body += facetedOval(r, 1010, 250, 58, 58, 10, (d, i) => (i % 2 ? mix("#ffd57a", "#f7b955", d * 0.6) : mix("#ffe39c", "#f9c464", d * 0.6)));
  // clouds
  const cloud = (x, y, s) => {
    const outline = [[-1, 0], [-0.82, -0.36], [-0.5, -0.5], [-0.3, -0.86], [0.08, -1], [0.38, -0.7], [0.62, -0.78], [0.9, -0.4], [1, 0]]
      .map(([u, v]) => [x + u * s * 1.6, y + v * s * 0.62]);
    let c = "";
    const center = [x, y - s * 0.1];
    for (let i = 0; i < outline.length - 1; i++) {
      c += poly([center, outline[i], outline[i + 1]], i < 4 ? tone("#ffffff", -0.02 - i * 0.008) : mix("#ffffff", "#c9d6e6", 0.25 + i * 0.06));
    }
    c += poly([outline[0], center, outline[outline.length - 1]], mix("#ffffff", "#c9d6e6", 0.55));
    return c;
  };
  body += `<g class="drift">${cloud(1250, 196, 46)}</g><g class="drift slow">${cloud(1050, 158, 30)}</g>`;
  const far = ridgeLayer({
    seed: 12,
    ridge: [[-20, 410], [120, 380], [260, 405], [420, 350], [560, 300], [690, 330], [820, 210], [905, 270], [980, 180], [1080, 300], [1180, 240], [1300, 330], [1460, 300]],
    rows: 5, step: 40, rough: 12, snowline: 285, haze: 0.5,
    colors: { lit: "#cfd9e8", mid: "#98abc6", dark: "#6f82a6", haze: "#c9d4e2", snow: { lit: "#fdfdfe", mid: "#e6edf5", dark: "#b9c6da" } },
  });
  body += far.svg;
  const style = ".drift{animation:drift 60s ease-in-out infinite alternate}.slow{animation-duration:90s;animation-direction:alternate-reverse}" +
    "@keyframes drift{to{transform:translateX(80px)}}@media (prefers-reduced-motion:reduce){.drift{animation:none}}";
  write("ridge-far.svg", svg(W, H, SLICE, body, style));
}

// Mid range: blue-green, a few dark firs on its shoulders.
{
  const r = rng(21);
  const mid = ridgeLayer({
    seed: 22,
    ridge: [[-20, 440], [140, 400], [300, 445], [470, 390], [600, 430], [700, 455], [820, 380], [960, 420], [1090, 360], [1230, 430], [1460, 400]],
    rows: 5, step: 48, rough: 10, haze: 0.45,
    colors: { lit: "#9dbfae", mid: "#6e9887", dark: "#4b7367", haze: "#b7cdcb" },
  });
  const trees = forest(r, { count: 40, xMin: 0, xMax: 1440, yAt: (x) => ridgeY(mid.top, x), band: 40, size: () => 22, lit: "#557f6c", dark: "#3c6355" });
  write("ridge-mid.svg", svg(W, H, SLICE, mid.svg + trees));
}

// Near hills: deep pine green with a dense tree line along the top.
{
  const r = rng(31);
  const near = ridgeLayer({
    seed: 32,
    ridge: [[-20, 500], [180, 470], [360, 515], [520, 490], [640, 530], [700, 545], [780, 525], [940, 475], [1120, 505], [1300, 465], [1460, 495]],
    rows: 4, step: 52, rough: 8, haze: 0.2,
    colors: { lit: "#7fae6e", mid: "#4f8a58", dark: "#2f6449", haze: "#7da48a" },
  });
  const trees = forest(r, { count: 110, xMin: -10, xMax: 1450, yAt: (x) => ridgeY(near.top, x) - 4, band: 26, size: () => 34, lit: "#3f7a50", dark: "#245039",
    avoid: (x) => x > 660 && x < 760 });
  write("ridge-near.svg", svg(W, H, SLICE, near.svg + trees));
}

// Valley floor: meadow, the river coming out of the gap, a pond, foreground pines. The bottom dissolves into the page.
{
  const r = rng(41);
  const fade = { from: 620, to: 712, color: MIST };
  const valley = ridgeLayer({
    seed: 42,
    ridge: [[-20, 560], [200, 548], [420, 566], [600, 556], [700, 570], [860, 552], [1080, 562], [1260, 546], [1460, 558]],
    base: 730, rows: 6, step: 56, rough: 6, haze: 0.1, fade,
    colors: { lit: "#bcd690", mid: "#93bf73", dark: "#6f9f5c", haze: "#a9c98e" },
  });
  let body = valley.svg;

  // River: drawn last, over the mist, so it stays visible down to the edge where js/land.js picks it up.
  const center = spline([[712, 566], [700, 584], [640, 604], [676, 630], [610, 662], [520, 700], [470, 740]], 26);
  const widthAt = (i) => 5 + Math.pow(i / (center.length - 1), 1.7) * 66;
  const fadeTo = (c, y) => (y > fade.from ? mix(c, MIST, 0.5 * Math.pow((y - fade.from) / (fade.to - fade.from), 1.2)) : c);
  let river = ribbon(center, (i) => widthAt(i) * 1.32, (q) => tone(q < 2 ? "#cdbf8f" : "#b4a675", (r() - 0.5) * 0.12), fadeTo);
  river += ribbon(center, widthAt, (q, i) => {
    const base = q < 2 ? "#7fbfd8" : "#4f97bb";
    return tone(base, (r() - 0.5) * 0.18 + (i % 3 === 0 && q === 1 ? 0.25 : 0));
  }, fadeTo);
  for (let i = 4; i < center.length - 3; i += 3) {
    const [x, y] = center[i], w = widthAt(i) * 0.3;
    river += poly([[x - w, y], [x + w * 0.2, y - 1.5], [x + w, y + 1]], "#ffffff", ` class="glint" style="animation-delay:${(i * 0.37).toFixed(2)}s"`);
  }
  // Where the river leaves the bottom edge; js/land.js starts the page's river from here (HERO_RIVER).
  const k = center.findIndex(([, y]) => y >= H);
  const t = (H - center[k - 1][1]) / (center[k][1] - center[k - 1][1]);
  console.log("valley river exits at x =", n1(center[k - 1][0] + (center[k][0] - center[k - 1][0]) * t), "width =", n1(widthAt(k - 1 + t)));

  // Pond
  const pondX = 1140, pondY = 600;
  body += facetedOval(r, pondX, pondY + 2, 150, 30, 14, (d) => tone(mix("#c8b98a", "#a99a6b", d), (r() - 0.5) * 0.1));
  body += facetedOval(r, pondX, pondY, 128, 22, 14, (d, i) => tone(mix("#a6d3e3", "#4b93b7", d * 0.9), (r() - 0.5) * 0.12 + (i % 4 === 0 ? 0.12 : 0)));
  body += poly([[pondX - 60, pondY - 2], [pondX + 10, pondY - 4], [pondX + 40, pondY - 1]], "#ffffff", ` class="glint"`);
  body += poly([[pondX + 30, pondY + 6], [pondX + 80, pondY + 4], [pondX + 95, pondY + 7]], "#ffffff", ` class="glint" style="animation-delay:1.8s"`);

  // Pines on the meadow; keep clear of water.
  const nearWater = (x, y) =>
    center.some(([cx, cy], i) => Math.hypot(x - cx, (y - cy) * 1.4) < widthAt(i) * 0.8 + 26) ||
    ((x - pondX) / 175) ** 2 + ((y - pondY) / 44) ** 2 < 1;
  const size = (y) => 30 + (y - 560) * 0.55;
  body += forest(r, { count: 18, xMin: -10, xMax: 470, yAt: (x) => ridgeY(valley.top, x), band: 60, size, lit: "#3f7a50", dark: "#245039", avoid: nearWater });
  body += forest(r, { count: 16, xMin: 820, xMax: 1450, yAt: (x) => ridgeY(valley.top, x), band: 58, size, lit: "#3f7a50", dark: "#245039", avoid: nearWater });
  body += `<defs><linearGradient id="m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${MIST}" stop-opacity="0"/><stop offset="1" stop-color="${MIST}"/></linearGradient></defs>`;
  body += `<rect x="0" y="664" width="${W}" height="${H - 664}" fill="url(#m)"/>`;
  body += river;
  const style = ".glint{opacity:.15;animation:glint 5s ease-in-out infinite}@keyframes glint{50%{opacity:.85}}" +
    "@media (prefers-reduced-motion:reduce){.glint{animation:none;opacity:.5}}";
  write("valley.svg", svg(W, H, SLICE, body, style));
}

// ---------- trip picker terrain (600 x 400, cropped to cover its box) ----------
{
  const r = rng(51);
  const MW = 600, MH = 400, CX = 30, CY = 20;
  const waves = Array.from({ length: 6 }, (_, k) => ({ f: 4 + k * 3.3, a: 0.5 / (k + 1), th: r() * Math.PI, ph: r() * 6.28 }));
  const noise = (u, v) => waves.reduce((s, w) => s + w.a * Math.sin((u * Math.cos(w.th) + v * Math.sin(w.th)) * w.f + w.ph), 0);
  const river = spline([[0.66, -0.02], [0.63, 0.14], [0.55, 0.27], [0.5, 0.4], [0.53, 0.5], [0.62, 0.58], [0.68, 0.66]], 60);
  const riverDist = (u, v) => Math.min(...river.map(([x, y]) => Math.hypot(u - x, (v - y) * 0.66)));
    const height = (u, v) => {
    let h = 0.18 + 0.1 * noise(u, v);
    h += 0.8 * Math.pow(clamp(1 - v / 0.55, 0, 1), 1.2) * (0.55 + 0.45 * Math.exp(-((u - 0.62) ** 2) / 0.06));
    h += 0.42 * Math.exp(-(((u - 0.2) ** 2) / 0.012 + ((v - 0.44) ** 2) / 0.04));
    h -= 0.22 * Math.exp(-(riverDist(u, v) ** 2) / 0.003);
    return clamp(h, 0, 1.1);
  };
  const ramp = [[0, "#c3dca0"], [0.25, "#a9cd86"], [0.42, "#86b770"], [0.58, "#679d62"], [0.72, "#55865a"], [0.86, "#9aa49a"], [1.05, "#e4e7e1"]];
  const rampAt = (h) => {
    for (let i = 0; i < ramp.length - 1; i++) {
      if (h <= ramp[i + 1][0]) return mix(ramp[i][1], ramp[i + 1][1], (h - ramp[i][0]) / (ramp[i + 1][0] - ramp[i][0]));
    }
    return ramp[ramp.length - 1][1];
  };
  const grid = [];
  for (let j = 0; j <= CY; j++) {
    grid.push([]);
    for (let i = 0; i <= CX; i++) {
      const eu = i === 0 || i === CX, ev = j === 0 || j === CY;
      const u = (i + (eu ? 0 : (r() - 0.5) * 0.7)) / CX, v = (j + (ev ? 0 : (r() - 0.5) * 0.7)) / CY;
      grid[j].push([u, v, height(u, v)]);
    }
  }
  const L = [-0.55, -0.62, 0.56];
  let body = "";
  for (let j = 0; j < CY; j++) {
    for (let i = 0; i < CX; i++) {
      const a = grid[j][i], b = grid[j][i + 1], c = grid[j + 1][i + 1], d = grid[j + 1][i];
      const tris = (i + j) % 2 ? [[a, b, c], [a, c, d]] : [[a, b, d], [b, c, d]];
      for (const tri of tris) {
        const P = tri.map(([u, v, h]) => [u * MW, v * MH, h * 70]);
        const e1 = [0, 1, 2].map((k) => P[1][k] - P[0][k]), e2 = [0, 1, 2].map((k) => P[2][k] - P[0][k]);
        let nrm = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        if (nrm[2] < 0) nrm = nrm.map((x) => -x);
        const len = Math.hypot(...nrm);
        const lit = (nrm[0] * L[0] + nrm[1] * L[1] + nrm[2] * L[2]) / len;
        const [u, v] = centroid(...tri);
        const h = (tri[0][2] + tri[1][2] + tri[2][2]) / 3;
        let fill = rampAt(h);
        fill = mix(fill, "#b08f63", 0.7 * Math.exp(-(((u - 0.21) ** 2) / 0.008 + ((v - 0.46) ** 2) / 0.02)));
        fill = mix(fill, "#e0dabd", 0.55 * Math.exp(-(((u - 0.36) ** 2) / 0.01 + ((v - 0.78) ** 2) / 0.006)));
        fill = tone(fill, clamp((lit - 0.6) * 1.1, -0.28, 0.22) + (r() - 0.5) * 0.05);
        body += poly(P, fill, ` stroke="${fill}" stroke-width=".6" stroke-linejoin="round"`);
      }
    }
  }
  // Water on top of the terrain: river into the lake.
  const riverPx = river.map(([u, v]) => [u * MW, v * MH]);
  body += ribbon(riverPx, (i) => 5 + (i / riverPx.length) * 9, (q) => tone(q < 2 ? "#7cc0da" : "#529fc4", (r() - 0.5) * 0.14));
  body += facetedOval(r, 0.7 * MW, 0.71 * MH, 0.15 * MW, 0.11 * MH, 14, (d) => tone(mix("#9ad0e3", "#4a95bb", d), (r() - 0.5) * 0.1));
  write("trip-map.svg", svg(MW, MH, "xMidYMid slice", body));
}
