// The land below the hero, drawn as one long valley that the page travels down. The river leaves the
// hero's mountains, passes the Wilderness Outpost in a meadow, runs through a forest with a campsite,
// past rolling hills with singletrack, narrows into a gorge with rapids and climbing walls, and finally
// pours into a sinkhole cave. Each [data-station] row on the page marks where one of those places is,
// so the terrain changes around it rather than an icon being dropped beside it. Dense forest lines the
// sides of the page and closes in above the footer. A kayak rides the river as the page scrolls.
// The land is drawn here instead of shipped as an image because the page is several times taller on a
// phone than on a desktop, and the stops move with the layout. Every random choice is seeded, so a
// rebuild at the same size draws the same land.
(function () {
  const host = document.querySelector("[data-land]");
  if (!host) return;

  const MIST = "#e7eee6"; // must match --mist in css/styles.css, so the land rises out of the hero's haze
  const NIGHT = "#10281e"; // must match --forest-night in css/styles.css, so the forest runs into the footer
  // Where the river leaves the bottom of img/valley.svg (1440 x 720 viewBox); printed by tools/landscape.mjs.
  const HERO_RIVER = { x: 492.3, w: 61 };
  const FADE = 170; // px at the top where the land dissolves into mist
  const STEP = 36; // px between samples along the river
  const ROW = 16; // px depth of each row of scenery the kayak can slot between
  const SVGNS = "http://www.w3.org/2000/svg";

  function rng(seed) {
    return function () {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function rgb(h) { return [1, 3, 5].map(function (i) { return parseInt(h.slice(i, i + 2), 16); }); }
  function mix(a, b, t) {
    const A = rgb(a), B = rgb(b), k = clamp(t, 0, 1);
    return "#" + A.map(function (v, i) {
      return Math.round(v + (B[i] - v) * k).toString(16).padStart(2, "0");
    }).join("");
  }
  function tone(c, k) { return k >= 0 ? mix(c, "#ffffff", k) : mix(c, "#000000", -k); }
  function ramp(stops, t) {
    for (let i = 0; i < stops.length - 1; i++) {
      if (t <= stops[i + 1][0]) return mix(stops[i][1], stops[i + 1][1], (t - stops[i][0]) / (stops[i + 1][0] - stops[i][0]));
    }
    return stops[stops.length - 1][1];
  }
  function n1(v) { return Math.round(v * 10) / 10; }
  function pts2(list) { return list.map(function (p) { return n1(p[0]) + "," + n1(p[1]); }).join(" "); }
  function poly(list, fill, extra) { return "<polygon points=\"" + pts2(list) + "\" fill=\"" + fill + "\"" + (extra || "") + "/>"; }
  function line(list, stroke, width, extra) {
    return "<polyline points=\"" + pts2(list) + "\" fill=\"none\" stroke=\"" + stroke + "\" stroke-width=\"" + n1(width) +
      "\" stroke-linecap=\"round\" stroke-linejoin=\"round\"" + (extra || "") + "/>";
  }
  function centroid(t) { return [(t[0][0] + t[1][0] + t[2][0]) / 3, (t[0][1] + t[1][1] + t[2][1]) / 3]; }
  function inPolygon(p, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  }
  function misted(fill, y) { return y < FADE ? mix(fill, MIST, 0.55 * Math.pow(1 - y / FADE, 1.3)) : fill; }
  // The river shows through the mist, so it reads as one river with the hero's.
  function mistedSoft(fill, y) { return y < FADE ? mix(fill, MIST, 0.3 * Math.pow(1 - y / FADE, 1.3)) : fill; }
  // Wraps scenery so it grows in when the kayak comes near (see .sprout in css/styles.css).
  function sprout(y, body) { return "<g class=\"sprout\" data-y=\"" + Math.round(y) + "\">" + body + "</g>"; }
  function hull(points) {
    const p = points.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    if (p.length < 3) return p;
    function turn(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
    const lower = [], upper = [];
    p.forEach(function (q) {
      while (lower.length > 1 && turn(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
      lower.push(q);
    });
    p.slice().reverse().forEach(function (q) {
      while (upper.length > 1 && turn(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
      upper.push(q);
    });
    return lower.slice(0, -1).concat(upper.slice(0, -1));
  }

  // Smooth sum of sines; returns roughly -1..1.
  function waves(r, count, base) {
    const list = [];
    for (let k = 0; k < count; k++) {
      list.push({ f: base * (1 + k * 0.85), a: 1 / (k + 1), th: r() * Math.PI, ph: r() * 6.28 });
    }
    return function (x, y) {
      let s = 0;
      list.forEach(function (w) { s += w.a * Math.sin((x * Math.cos(w.th) + y * Math.sin(w.th)) * w.f + w.ph); });
      return s / 1.6;
    };
  }

  // Unit tangent and normal at each point of a line.
  function frames(pts) {
    return pts.map(function (p, i) {
      const a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, pts.length - 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
      return { t: [dx / len, dy / len], n: [-dy / len, dx / len] };
    });
  }

  // Even spacing along a line, so bent stretches don't end up with long, thin facets.
  function resample(pts, step) {
    const out = [pts[0]];
    let carry = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      let d = step - carry;
      while (d <= len) {
        out.push([a[0] + (b[0] - a[0]) * d / len, a[1] + (b[1] - a[1]) * d / len]);
        d += step;
      }
      carry = len - (d - step);
    }
    return out;
  }

  // ---------- a small 3D kit ----------
  // Buildings, rocks, cliffs and hills are modeled as low-poly solids and drawn in one oblique view that keeps
  // the map's ground plan exact: x and z are the page's x and y, and height lifts a point up the page and a
  // little right, so south and west faces show. One sun in the upper left lights every face and casts every
  // shadow, the same light the terrain and trees use.
  const LEAN = [0.12, -0.8];
  function unit(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  const EYE = unit([-LEAN[0], 1, -LEAN[1]]);
  const SUN = unit([-0.62, 0.74, -0.25]);
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function mean(list) {
    const s = [0, 0, 0];
    list.forEach(function (p) { s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; });
    return [s[0] / list.length, s[1] / list.length, s[2] / list.length];
  }
  function screen(p) { return [p[0] + LEAN[0] * p[1], p[2] + LEAN[1] * p[1]]; }
  // Lit faces warm toward cream, shaded faces cool toward slate, as a painter would.
  function shade(base, n, jit) {
    const t = 0.42 + 0.5 * Math.max(dot(n, SUN), 0) + 0.12 * Math.max(dot(n, EYE), 0) + (jit || 0);
    return t > 0.8 ? mix(base, "#fff4d6", (t - 0.8) * 1.2) : mix(base, "#1d3346", (0.8 - t) * 0.8);
  }
  function model() { return { parts: [] }; }
  // A convex piece: each face's normal is turned to point away from the piece's center.
  function solid(m, faces, color, cls) {
    const c = mean([].concat.apply([], faces));
    m.parts.push({ c: c, cls: cls, faces: faces.map(function (f) {
      let n = unit(cross(sub(f[1], f[0]), sub(f[2], f[0])));
      if (dot(n, sub(mean(f), c)) < 0) n = n.map(function (v) { return -v; });
      return { pts: f, n: n, color: typeof color === "function" ? color(n, f) : color };
    }) });
  }
  // Paint on a surface (doors, windows, trails): always drawn, just after what it sits on.
  function decal(m, pts, color, opts) {
    opts = opts || {};
    m.parts.push({ c: mean(pts), bias: opts.bias || 1.5, cls: opts.cls, faces: [{ pts: pts, flat: true, color: color, alpha: opts.alpha }] });
  }
  // An open surface such as a hillside: every triangle is its own piece, sorted back to front.
  function surface(m, tris, colorAt) {
    tris.forEach(function (t) {
      let n = unit(cross(sub(t[1], t[0]), sub(t[2], t[0])));
      if (n[1] < 0) n = n.map(function (v) { return -v; });
      m.parts.push({ c: mean(t), faces: [{ pts: t, n: n, color: colorAt(n, mean(t)) }] });
    });
  }
  function ring(n, r, y, rnd, jit, rot, sx) {
    const out = [];
    for (let k = 0; k < n; k++) {
      const a = (rot || 0) + (k / n) * 6.2832, q = r * (1 + (rnd ? (rnd() - 0.5) * (jit || 0) : 0));
      out.push([Math.cos(a) * q * (sx || 1), y, Math.sin(a) * q]);
    }
    return out;
  }
  function loft(m, rings, color, opts) {
    opts = opts || {};
    const faces = [];
    for (let k = 0; k < rings.length - 1; k++) {
      const A = rings[k], B = rings[k + 1];
      for (let i = 0; i < A.length; i++) {
        const j = (i + 1) % A.length;
        faces.push([A[i], A[j], B[j]], [A[i], B[j], B[i]]);
      }
    }
    const top = rings[rings.length - 1];
    if (opts.apex) top.forEach(function (p, i) { faces.push([p, top[(i + 1) % top.length], opts.apex]); });
    else if (opts.cap !== false) {
      const c = mean(top);
      top.forEach(function (p, i) { faces.push([p, top[(i + 1) % top.length], c]); });
    }
    solid(m, faces, color, opts.cls);
  }
  function box(m, x0, x1, y0, y1, z0, z1, color, cls) {
    solid(m, [
      [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]],
      [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
      [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]],
      [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]],
      [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]],
    ], color, cls);
  }
  // An upright block over a ground plan given in page coordinates.
  function prism(m, foot, y0, y1, color) {
    const faces = [foot.map(function (p) { return [p[0], y1, p[1]]; })];
    foot.forEach(function (p, i) {
      const q = foot[(i + 1) % foot.length];
      faces.push([[p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]]]);
    });
    solid(m, faces, color);
  }
  // Draws a model at a page position and scale: a soft cast shadow first, then its faces back to front.
  function draw3d(m, x, z, s, opts) {
    opts = opts || {};
    const y0 = opts.y || 0;
    function at(p) { return [x + p[0] * s, y0 + p[1] * s, z + p[2] * s]; }
    let out = "";
    if (opts.shadow !== false) {
      const ground = [];
      m.parts.forEach(function (part) {
        if (part.bias) return;
        part.faces.forEach(function (f) {
          f.pts.forEach(function (p) {
            const q = at(p), h = q[1] - y0;
            ground.push(screen([q[0] - SUN[0] / SUN[1] * h, y0, q[2] - SUN[2] / SUN[1] * h]));
          });
        });
      });
      if (ground.length > 2) out += poly(hull(ground), "#1c3326", " fill-opacity=\"" + (opts.shadow || 0.2) + "\"");
    }
    const parts = m.parts.map(function (part) {
      const c = at(part.c);
      return { part: part, d: c[2] + c[1] * 0.3 + (part.bias || 0) };
    }).sort(function (a, b) { return a.d - b.d; });
    parts.forEach(function (it) {
      let s2 = "";
      it.part.faces.forEach(function (f) {
        if (!f.flat && dot(f.n, EYE) <= 0.01) return;
        const P = f.pts.map(function (p) { return screen(at(p)); });
        const jit = f.flat ? 0 : (Math.sin(P[0][0] * 12.99 + P[0][1] * 78.23) * 43758.5 % 1) * 0.04;
        let fill = f.flat ? f.color : shade(f.color, f.n, jit);
        if (opts.haze !== undefined) fill = misted(fill, opts.haze);
        s2 += f.alpha ? poly(P, fill, " fill-opacity=\"" + f.alpha + "\"") : poly(P, fill, " stroke=\"" + fill + "\" stroke-width=\".5\" stroke-linejoin=\"round\"");
      });
      out += it.part.cls ? "<g class=\"" + it.part.cls + "\">" + s2 + "</g>" : s2;
    });
    return out;
  }

  // ---------- models (units are roughly px at scale 1; y is up) ----------
  function rockModel(rnd, s, grey) {
    const m = model(), rot = rnd() * 6;
    loft(m, [ring(6, s, -s * 0.1, rnd, 0.45, rot, 1.25), ring(6, s * 0.6, s * (0.5 + rnd() * 0.4), rnd, 0.4, rot + 0.4, 1.25)],
      function (n) { return n[1] > 0.85 && rnd() < 0.4 ? "#93a86a" : tone(grey || "#a9ab9f", (rnd() - 0.5) * 0.08); });
    return m;
  }
  function personModel(jacket, helmet, pack) {
    const m = model(), q = Math.PI / 4;
    loft(m, [ring(4, 2.2, 0, null, 0, q), ring(4, 2.2, 6, null, 0, q)], "#2b3a4a");
    loft(m, [ring(4, 3, 6, null, 0, q), ring(4, 2.4, 13, null, 0, q)], jacket);
    loft(m, [ring(5, 2, 13.4), ring(5, 1.8, 16.8)], "#e0b48a");
    loft(m, [ring(5, 2.4, 16.2)], helmet, { apex: [0, 19.6, 0] });
    if (pack) box(m, -2.6, 2.6, 7, 14.5, -5.4, -2.2, pack);
    return m;
  }
  function tentModel(color, w, h, d) {
    const m = model();
    const L0 = [-w, 0, -d], R0 = [w, 0, -d], T0 = [0, h, -d], L1 = [-w, 0, d], R1 = [w, 0, d], T1 = [0, h, d];
    solid(m, [[L0, L1, T1, T0], [R0, T0, T1, R1], [L1, R1, T1], [L0, T0, R0]], color);
    decal(m, [[-w * 0.36, 0, d + 0.4], [w * 0.36, 0, d + 0.4], [0, h * 0.62, d + 0.4]], "#2a2620");
    return m;
  }
  function campfireModel(rnd) {
    const m = model();
    decal(m, ring(10, 22, 0.1), "#f2b44f", { alpha: 0.2, bias: -40 });
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * 6.2832, x = Math.cos(a) * 8, z = Math.sin(a) * 8;
      loft(m, [ring(5, 2.2, 0, rnd, 0.3).map(function (p) { return [p[0] + x, p[1], p[2] + z]; }),
        ring(5, 1.3, 2.4, rnd, 0.3).map(function (p) { return [p[0] + x, p[1], p[2] + z]; })], "#9a9c92");
    }
    loft(m, [ring(3, 5, 0, null, 0, 0.4)], "#6b4a33", { apex: [0, 8, 0] });
    loft(m, [ring(4, 3.6, 2)], "#f28c38", { apex: [0, 14, 0], cls: "flame" });
    loft(m, [ring(4, 2, 2.4)], "#ffd36b", { apex: [0.4, 9.5, 1.4], cls: "flame" });
    return m;
  }
  function boatModel(len, wid, color) {
    const m = model();
    function lens(scale, y) {
      const out = [];
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * 6.2832;
        out.push([Math.cos(a) * len / 2 * scale, y, Math.sin(a) * wid / 2 * scale * Math.pow(Math.abs(Math.sin(a)), 0.25)]);
      }
      return out;
    }
    loft(m, [lens(0.82, 0), lens(1, wid * 0.42)], function (n) { return n[1] > 0.9 ? tone(color, -0.42) : color; });
    return m;
  }
  function cabinModel() {
    const m = model(), wood = "#a8744b", log = "#8a5a38";
    box(m, -46, 46, 0, 3, 24, 40, "#8a5f3d");
    box(m, -40, 40, 0, 42, -28, 26, wood);
    for (let y = 8; y < 42; y += 8) {
      decal(m, [[-40, y, 26.3], [40, y, 26.3], [40, y + 1.6, 26.3], [-40, y + 1.6, 26.3]], log);
      decal(m, [[-40.3, y, -28], [-40.3, y, 26], [-40.3, y + 1.6, 26], [-40.3, y + 1.6, -28]], log);
    }
    solid(m, [
      [[-47, 40, 33], [47, 40, 33], [47, 70, -1], [-47, 70, -1]],
      [[-47, 40, -35], [47, 40, -35], [47, 70, -1], [-47, 70, -1]],
      [[-47, 40, 33], [-47, 40, -35], [-47, 70, -1]],
      [[47, 40, 33], [47, 40, -35], [47, 70, -1]],
    ], function (n) { return Math.abs(n[0]) > 0.9 ? wood : "#b8562f"; });
    box(m, 18, 28, 50, 84, -14, -4, "#8f8a80");
    decal(m, [[-8, 0, 26.5], [8, 0, 26.5], [8, 27, 26.5], [-8, 27, 26.5]], "#4a3527");
    decal(m, [[16, 15, 26.5], [32, 15, 26.5], [32, 29, 26.5], [16, 29, 26.5]], "#f6d36b");
    decal(m, [[-40.5, 15, -16], [-40.5, 15, 0], [-40.5, 29, 0], [-40.5, 29, -16]], "#f6d36b");
    box(m, 46, 60, 0, 6, 2, 18, "#7a5636");
    box(m, 48, 58, 6, 11, 4, 16, "#8a6440");
    return m;
  }
  function rackModel() {
    const m = model();
    box(m, -24, -21, 0, 16, -10, -7, "#7a5636");
    box(m, 21, 24, 0, 16, -10, -7, "#7a5636");
    box(m, -24, -21, 0, 16, 7, 10, "#7a5636");
    box(m, 21, 24, 0, 16, 7, 10, "#7a5636");
    box(m, -26, 26, 16, 18, -10, 10, "#8a6440");
    return m;
  }
  function riderModel() {
    const m = personModel("#d9573b", "#f2b44f");
    [[-7, 0], [7, 0]].forEach(function (w) {
      const rim = [];
      for (let k = 0; k < 6; k++) { const a = (k / 6) * 6.2832; rim.push([w[0] + Math.cos(a) * 5, 5 + Math.sin(a) * 5, 1]); }
      decal(m, rim, "#10281e", { bias: 3 });
    });
    decal(m, [[-7, 5, 1.6], [0, 11, 1.6], [7, 5, 1.6], [6, 6, 1.6], [0, 9.5, 1.6], [-6, 6, 1.6]], "#3f87ad", { bias: 4 });
    return m;
  }

  // ---------- trees (drawn flat: a cone lit on its west half, the same view the 3D kit uses) ----------
  const PINES = [["#3f7a50", "#245039"], ["#4b8a55", "#2c5c3e"], ["#2f6a4a", "#1c4532"], ["#5a8f4f", "#35633a"]];
  function pine(x, y, h, pal, haze, dark) {
    const tw = h * 0.07;
    function fog(c) { c = dark ? mix(c, NIGHT, dark) : c; return haze ? misted(c, y) : c; }
    let s = poly([[x - tw, y], [x + tw, y], [x + tw, y - h * 0.16], [x - tw, y - h * 0.16]], fog("#4a3527"));
    for (let k = 0; k < 3; k++) {
      const w = h * 0.5 * (1 - k * 0.24), yb = y - h * 0.12 - k * h * 0.25;
      const yt = k === 2 ? y - h : yb - h * 0.45, notch = yb + h * 0.04;
      s += poly([[x - w / 2, yb], [x, notch], [x, yt]], fog(pal[0]));
      s += poly([[x, yt], [x, notch], [x + w / 2, yb]], fog(pal[1]));
    }
    return s;
  }
  function broadleaf(r, x, y, h, leaf, haze) {
    const cx = x, cy = y - h * 0.6, rad = h * 0.36;
    function fog(c) { return haze ? misted(c, y) : c; }
    let s = poly([[x - h * 0.05, y], [x + h * 0.05, y], [x + h * 0.04, cy], [x - h * 0.04, cy]], fog("#5a4030"));
    const rim = [];
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * 6.2832 + 0.3;
      rim.push([cx + Math.cos(a) * rad * (0.86 + r() * 0.24), cy + Math.sin(a) * rad * (0.86 + r() * 0.24)]);
    }
    const mid = [cx - rad * 0.15, cy - rad * 0.15];
    for (let k = 0; k < 7; k++) {
      const a = rim[k], b = rim[(k + 1) % 7];
      const light = -((a[0] + b[0]) / 2 - cx) * 0.7 - ((a[1] + b[1]) / 2 - cy);
      s += poly([mid, a, b], fog(tone(light > 0 ? tone(leaf, 0.14) : tone(leaf, -0.16), (r() - 0.5) * 0.08)));
    }
    return s;
  }
  function treeShadow(x, y, h) {
    return poly([[x - h * 0.18, y], [x + h * 0.55, y - h * 0.12], [x + h * 0.7, y + h * 0.04], [x + h * 0.1, y + h * 0.1]], "#1c3326", " fill-opacity=\".16\"");
  }

  // Small riverbank details, drawn flat.
  function reeds(r, x, y, s) {
    let out = "";
    for (let k = 0; k < 5; k++) {
      const bx = x + (k - 2) * s * 0.18, top = [bx + (r() - 0.5) * s * 0.4, y - s * (0.6 + r() * 0.5)];
      out += poly([[bx - 1.4, y], [bx + 1.4, y], top], k % 2 ? "#7f9a46" : "#94ad55");
      if (k % 2 === 0) out += poly([[top[0] - 1.6, top[1] + 2], [top[0] + 1.6, top[1] + 2], [top[0] + 1.4, top[1] + 9], [top[0] - 1.4, top[1] + 9]], "#6b4a2e");
    }
    return out;
  }
  function flowers(r, x, y, s) {
    const colors = ["#f4f1e8", "#f7c6d0", "#f2d35b", "#c9b3e8"];
    let out = "";
    for (let k = 0; k < 7; k++) {
      const fx = x + (r() - 0.5) * s * 2, fy = y + (r() - 0.5) * s * 0.8, c = colors[Math.floor(r() * colors.length)];
      out += poly([[fx - 3, fy], [fx, fy - 4], [fx + 3, fy]], c) + poly([[fx - 3, fy], [fx + 3, fy], [fx, fy + 2.5]], tone(c, -0.15));
    }
    return out;
  }
  function bush(r, x, y, s) {
    const a = [x - s, y], b = [x - s * 0.45, y - s * 0.7], c = [x + s * 0.25, y - s * 0.8], d = [x + s, y], m = [x, y - s * 0.25];
    return poly([a, b, m], tone("#7fb35a", (r() - 0.5) * 0.1)) + poly([b, c, m], "#94c46a") +
      poly([c, d, m], tone("#5a9244", (r() - 0.5) * 0.1)) + poly([a, m, d], "#6aa24f");
  }

  // A worn dirt path along page points: a faceted ribbon that the trees later overlap, so it disappears into the woods.
  function path(r, list, width, color) {
    const fr = frames(list);
    let s = "";
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i], b = list[i + 1], fa = fr[i], fb = fr[i + 1];
      const wa = width * (0.8 + r() * 0.4) / 2, wb = width * (0.8 + r() * 0.4) / 2;
      const q = [[a[0] + fa.n[0] * wa, a[1] + fa.n[1] * wa], [b[0] + fb.n[0] * wb, b[1] + fb.n[1] * wb],
        [b[0] - fb.n[0] * wb, b[1] - fb.n[1] * wb], [a[0] - fa.n[0] * wa, a[1] - fa.n[1] * wa]];
      s += poly([q[0], q[1], q[2]], tone(color, 0.04 + (r() - 0.5) * 0.06)) + poly([q[0], q[2], q[3]], tone(color, -0.04 + (r() - 0.5) * 0.06));
    }
    return s;
  }
  function wander(r, a, b, n, sway) {
    const out = [];
    for (let k = 0; k <= n; k++) {
      const t = k / n, off = k && k < n ? (r() - 0.5) * sway : 0;
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
      out.push([a[0] + dx * t - dy / len * off, a[1] + dy * t + dx / len * off]);
    }
    return resample(out, 18);
  }

  // ---------- the river's course ----------
  // A Kinoshita curve, the sine-generated shape real meanders follow, then bent through anchors: where the
  // hero's river leaves off, and through each stop.
  function course(W, H, anchors) {
    const theta = 1.15, skew = 0.035, flat = 0.02;
    function heading(s) {
      const k = s * 6.2832;
      return theta * Math.sin(k) + Math.pow(theta, 3) * (skew * Math.cos(3 * k) - flat * Math.sin(3 * k));
    }
    // Trace one unit wavelength to learn its sideways reach, then scale so a full swing spans most of the page.
    let ux = 0, lo = 0, hi = 0;
    for (let s = 0; s < 1; s += 0.001) {
      ux += Math.sin(heading(s)) * 0.001;
      lo = Math.min(lo, ux);
      hi = Math.max(hi, ux);
    }
    const scale = (W * 0.5) / (hi - lo);
    const base = [];
    let s = 0, x = W / 2 - ((lo + hi) / 2) * scale, y = -60;
    while (y < H + STEP * 2) {
      base.push([x, y]);
      const h = heading(s);
      x += Math.sin(h) * STEP - ux * STEP; // ux: leftover sideways drift per wavelength, removed so the river stays centered
      y += Math.cos(h) * STEP;
      s += STEP / scale;
    }
    function bend(py, bumps) {
      return bumps.reduce(function (sum, b) { return sum + b.a * Math.exp(-Math.pow((py - b.y) / b.s, 2)); }, 0);
    }
    function xAt(py, bumps) {
      let i = 1;
      while (i < base.length - 1 && base[i][1] < py) i++;
      const a = base[i - 1], b = base[i], t = clamp((py - a[1]) / ((b[1] - a[1]) || 1), 0, 1);
      return a[0] + (b[0] - a[0]) * t + bend(py, bumps);
    }
    const bumps = [];
    anchors.slice().sort(function (a, b) { return a.y - b.y; }).forEach(function (an) {
      bumps.push({ y: an.y, s: an.s, a: an.x - xAt(an.y, bumps) });
    });
    const margin = Math.min(40, W * 0.06);
    return resample(base.map(function (p) { return [clamp(p[0] + bend(p[1], bumps), margin, W - margin), p[1]]; }), STEP);
  }

  function build(W, H, opts) {
    const stations = opts.stations, cards = opts.cards;
    const cell = clamp(W / 13, 66, 112);
    const K = clamp(W / 1100, 0.5, 1);
    const maxTrees = Math.round(700 + W); // keeps phones, whose pages run longest, to a lighter drawing // scale for set pieces, so phones get smaller cliffs and cabins
    const T = clamp(W * 0.06, 46, 96); // typical tree height
    const elev = waves(rng(3), 5, 0.006);
    const woods = waves(rng(5), 3, 0.004);
    const st = {};
    stations.forEach(function (s) { st[s.kind] = s; });

    // Zones: where on the page each kind of country is, with soft edges so one blends into the next.
    function band(y0, y1, soft) { return function (y) { return smooth((y - y0 + soft) / soft) * smooth((y1 + soft - y) / soft); }; }
    function stationBand(s, pad, soft) { return s ? band(s.box.y - pad, s.box.y + s.box.h + pad, soft) : function () { return 0; }; }
    const inForest = stationBand(st.backpacking, 260, 260);
    const inHills = stationBand(st.biking, 200, 240);
    const gorgeTop = st.whitewater || st.climbing, gorgeEnd = st.climbing || st.whitewater;
    const inGorge = gorgeTop ? band(gorgeTop.box.y - 120, gorgeEnd.box.y + gorgeEnd.box.h + 80, 200) : function () { return 0; };
    const inKarst = stationBand(st.caving, 220, 220);
    const pit = st.caving ? { x: st.caving.feature.x, y: st.caving.feature.z, rx: Math.min(st.caving.box.w * 0.3, 190 * K + 40), ry: 0 } : null;
    // The sinkhole's rim: an irregular ring, settled here because the river is cut to end exactly on it.
    let rim = null;
    if (pit) {
      pit.ry = pit.rx * 0.62;
      const rm = rng(37);
      rim = [];
      for (let k = 0; k < 28; k++) {
        const a = (k / 28) * 6.2832, j = 0.9 + 0.12 * Math.sin(a * 3 + 1.3) + rm() * 0.1;
        rim.push([pit.x + Math.cos(a) * pit.rx * j, pit.y + Math.sin(a) * pit.ry * j]);
      }
    }
    const bottom = H - opts.pad * 1.1;
    const inDeepWoods = function (y) { return smooth((y - bottom) / 260); };
    const sideW = Math.max(110, opts.margin + 70);

    // River: its course runs through every stop, and it ends by pouring into the cave.
    const rr = rng(7);
    const anchors = [{ y: 0, x: opts.start ? opts.start.x : W * 0.34, s: 240 }];
    stations.forEach(function (s) {
      if (s.kind === "caving") {
        anchors.push({ y: pit.y - pit.ry * 0.9, x: pit.x, s: Math.max(160, s.box.h * 0.5) });
        return;
      }
      [0.15, 0.5, 0.85].forEach(function (f) { anchors.push({ y: s.box.y + s.box.h * f, x: s.river, s: Math.max(120, s.box.h * 0.36) }); });
    });
    let full = course(W, H, anchors);
    let lip = full.length - 1; // where the river goes over the edge into the cave
    if (pit) {
      const cross = function () { return full.findIndex(function (p) { return p[1] > pit.y - pit.ry * 1.5 && inPolygon(p, rim); }); };
      let i = cross();
      if (i > 6) {
        // Ease the last stretch to run straight down, so the river meets the rim square on and falls straight.
        const x = full[i][0];
        for (let j = i - 6; j <= i + 1 && j < full.length; j++) full[j] = [full[j][0] + (x - full[j][0]) * smooth((j - (i - 6)) / 5), full[j][1]];
        i = cross();
      }
      if (i > 1) {
        // Find the exact crossing of the rim, then run on a little so the water slides under the drop.
        const a = full[i - 1], b = full[i];
        let lo = 0, hi = 1;
        for (let k = 0; k < 18; k++) {
          const mid = (lo + hi) / 2;
          if (inPolygon([a[0] + (b[0] - a[0]) * mid, a[1] + (b[1] - a[1]) * mid], rim)) hi = mid; else lo = mid;
        }
        const edge = [a[0] + (b[0] - a[0]) * hi, a[1] + (b[1] - a[1]) * hi];
        full = full.slice(0, i).concat([edge, [edge[0] + (b[0] - a[0]) * 0.5, edge[1] + (b[1] - a[1]) * 0.5]]);
        lip = full.length - 2;
      }
    }
    const center = full;
    const last = center.length - 1;
    const baseWidth = clamp(W * 0.042, 30, 62);
    const ph = [rr() * 6.28, rr() * 6.28];
    const widths = center.map(function (p, i) {
      let w = baseWidth * (1 + 0.2 * Math.sin(i * STEP / 520 + ph[0]) + 0.1 * Math.sin(i * STEP / 170 + ph[1]));
      w *= 1 - 0.28 * inGorge(p[1]) + 0.15 * inHills(p[1]);
      if (opts.start && p[1] < 320) w = opts.start.w + (w - opts.start.w) * clamp(p[1] / 320, 0, 1);
      return w;
    });
    function riverDist(x, py) {
      let best = Infinity;
      for (let i = 0; i < center.length - 1; i++) {
        const a = center[i], b = center[i + 1], dx = b[0] - a[0], dy = b[1] - a[1];
        const t = clamp(((x - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy || 1), 0, 1);
        best = Math.min(best, Math.hypot(x - a[0] - dx * t, py - a[1] - dy * t));
      }
      return best;
    }
    function riverXAt(py) {
      for (let i = 1; i < center.length; i++) if (center[i][1] >= py) return center[i - 1][0];
      return null;
    }

    // Places that must stay open: around each stop's set piece, and the hills.
    const clearings = [];
    const mounds = [];
    if (st.gear) clearings.push({ x: st.gear.feature.x, y: st.gear.feature.z, rx: 170 * K + 30, ry: 110 * K + 20, soft: true });
    if (st.backpacking) clearings.push({ x: st.backpacking.feature.x, y: st.backpacking.feature.z, rx: 150 * K + 30, ry: 90 * K + 24, soft: true });
    if (st.biking) {
      const b = st.biking;
      mounds.push({ x: b.feature.x, z: b.feature.z, rx: Math.min(b.box.w * 0.34, 240 * K + 30), rz: Math.min(b.box.h * 0.32, 120 * K + 20), main: true });
      mounds.push({ x: -30, z: b.feature.z + 30 * K, rx: 220 * K, rz: 110 * K });
      mounds.push({ x: W + 30, z: b.feature.z - 40 * K, rx: 240 * K, rz: 120 * K });
      mounds.forEach(function (m) { m.h = m.rz * 1.6; });
    }
    if (pit) clearings.push({ x: pit.x, y: pit.y, rx: pit.rx * 1.35, ry: pit.ry * 1.5 });
    function cleared(x, y) {
      let c = 0;
      clearings.concat(mounds.map(function (m) { return { x: m.x, y: m.z, rx: m.rx * 1.05, ry: m.rz * 1.1 }; })).forEach(function (o) {
        const d = Math.hypot((x - o.x) / o.rx, (y - o.y) / o.ry);
        c = Math.max(c, o.soft ? smooth((1.25 - d) / 0.45) : (d < 1 ? 1 : 0));
      });
      return c;
    }
    function moundHeight(m, x, z) {
      const d = Math.pow((x - m.x) / m.rx, 2) + Math.pow((z - m.z) / m.rz, 2);
      return d >= 1 ? 0 : m.h * Math.pow(1 - d, 1.5) * (1 + 0.12 * elev(x * 3, z * 3));
    }
    // How strongly the forest claims a spot: the page edges everywhere, the whole width in the forest and
    // above the footer, thinner in the gorge and around the cave, never on the water or in a clearing.
    function forestAt(x, y) {
      const edge = Math.min(x, W - x);
      let f = smooth((sideW - edge) / (sideW * 0.75));
      f = Math.max(f, inForest(y) * 0.95, inDeepWoods(y));
      f *= 1 - 0.55 * inGorge(y) - 0.35 * inKarst(y) - 0.45 * inHills(y);
      f += woods(x, y) * 0.28;
      f *= 1 - cleared(x, y);
      return f * smooth((y - FADE * 0.8) / (FADE * 0.8)); // the woods begin below the hero's haze

    }

    // ---------- ground ----------
    // Offset rows of jittered points make near-equilateral triangles. Each point gets a height so the facets
    // can be lit from the upper left, like the mountains in the hero; the color follows the zones.
    const r = rng(11);
    const rowH = cell * 0.86, rows = Math.ceil(H / rowH) + 1, cols = Math.ceil(W / cell) + 2;
    const grid = [];
    for (let j = 0; j <= rows; j++) {
      const row = [];
      for (let i = -1; i <= cols; i++) {
        const x = (i + (j % 2 ? 0.5 : 0)) * cell + (r() - 0.5) * cell * 0.45;
        const py = j * rowH + (j ? (r() - 0.5) * rowH * 0.45 : 0);
        row.push([x, py, elev(x, py) * (44 + 40 * inHills(py)) + (r() - 0.5) * cell * 0.28]);
      }
      grid.push(row);
    }
    const meadow = [[0, "#c2dc98"], [0.25, "#a8cd84"], [0.5, "#8cbb70"], [0.75, "#6fa462"], [1, "#5a8f58"]];
    let body = "";
    for (let j = 0; j < rows; j++) {
      const top = grid[j], bot = grid[j + 1];
      for (let k = 0; k < top.length - 1; k++) {
        const tris = j % 2
          ? [[top[k], bot[k + 1], bot[k]], [top[k], top[k + 1], bot[k + 1]]]
          : [[top[k], top[k + 1], bot[k]], [bot[k], top[k + 1], bot[k + 1]]];
        tris.forEach(function (tri) {
          const e1 = [0, 1, 2].map(function (d) { return tri[1][d] - tri[0][d]; });
          const e2 = [0, 1, 2].map(function (d) { return tri[2][d] - tri[0][d]; });
          let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
          if (n[2] < 0) n = n.map(function (v) { return -v; });
          const lit = (n[0] * -0.5 + n[1] * -0.6 + n[2] * 0.62) / Math.hypot(n[0], n[1], n[2]);
          const c = centroid(tri);
          let fill = ramp(meadow, clamp((elev(c[0], c[1]) * 0.6 + woods(c[0], c[1]) * 0.5 + 1) / 2, 0, 1));
          fill = mix(fill, "#4c7a46", clamp(forestAt(c[0], c[1]), 0, 1) * 0.6);
          fill = mix(fill, "#a8a58f", inGorge(c[1]) * 0.55 * smooth((260 * K + 60 - riverDist(c[0], c[1])) / 160));
          fill = mix(fill, "#9ea891", inKarst(c[1]) * 0.45);
          fill = mix(fill, "#b5cf8c", cleared(c[0], c[1]) * 0.35);
          fill = mix(fill, NIGHT, inDeepWoods(c[1]) * 0.55);
          const d = riverDist(c[0], c[1]);
          if (d < baseWidth * 1.3) fill = mix(fill, "#b9c482", 0.4 * (1 - d / (baseWidth * 1.3)));
          fill = misted(tone(fill, clamp((lit - 0.6) * 1.3, -0.24, 0.2) + (r() - 0.5) * 0.05), c[1]);
          body += poly(tri, fill, " stroke=\"" + fill + "\" stroke-width=\".6\" stroke-linejoin=\"round\"");
        });
      }
    }

    // Trails, laid on the ground before anything stands on it.
    const rp = rng(31);
    const DIRT = "#cdb487";
    if (st.gear) {
      const f = st.gear.feature, rx = riverXAt(f.z);
      body += path(rp, wander(rp, [f.x, f.z + 34 * K], [f.x + (f.x < W / 2 ? -1 : 1) * W, f.z + 220 * K], 10, 50), 9 * K + 3, DIRT);
      if (rx !== null) body += path(rp, wander(rp, [f.x, f.z + 34 * K], [rx, f.z + 46 * K], 4, 16), 8 * K + 3, DIRT);
    }
    if (st.backpacking) {
      const f = st.backpacking.feature;
      body += path(rp, wander(rp, [f.x, f.z + 10], [f.x < W / 2 ? -20 : W + 20, f.z - 260 * K], 12, 90), 7 * K + 3, DIRT);
      body += path(rp, wander(rp, [f.x, f.z + 10], [f.x < W / 2 ? W * 0.25 : W * 0.75, f.z + 420 * K], 12, 90), 7 * K + 3, DIRT);
    }
    if (pit) {
      body += path(rp, wander(rp, [pit.x + pit.rx * 0.9, pit.y + pit.ry * 0.6], [pit.x < W / 2 ? W + 20 : -20, pit.y + 300 * K], 10, 70), 7 * K + 3, DIRT);
    }

    // Water: each cross-section is six jittered points (bank, edge, two mid-channel, edge, bank), and the
    // quads between sections split on alternating diagonals. Shallows are pale, the channel deep blue.
    const fr = frames(center);
    const sections = center.map(function (p, i) {
      const f = fr[i], w = widths[i] / 2, bank = baseWidth * 0.22;
      return [
        w + bank * (0.5 + rr() * 0.9), w * (0.92 + rr() * 0.16), w * (0.3 + rr() * 0.12),
        -w * (0.3 + rr() * 0.12), -w * (0.92 + rr() * 0.16), -w - bank * (0.5 + rr() * 0.9),
      ].map(function (off, k) {
        // No sliding on the last cross-section before the cave, so its edge is straight where the falls begin.
        const slide = k === 0 || k === 5 || (pit && i >= lip - 1) ? 0 : (rr() - 0.5) * 10;
        return [p[0] + f.n[0] * off + f.t[0] * slide, p[1] + f.n[1] * off + f.t[1] * slide];
      });
    });
    const lanes = ["#c7b984", "#93cfe2", "#5ea7cb", "#93cfe2", "#c7b984"];
    const lastQuad = pit ? lip - 1 : sections.length - 1; // at the cave, the spill takes over from here
    for (let i = 0; i < lastQuad; i++) {
      const a = sections[i], b = sections[i + 1], white = inGorge(center[i][1]);
      for (let k = 0; k < 5; k++) {
        const quad = (i + k) % 2 ? [[a[k], a[k + 1], b[k + 1]], [a[k], b[k + 1], b[k]]] : [[a[k], a[k + 1], b[k]], [a[k + 1], b[k + 1], b[k]]];
        quad.forEach(function (tri, q) {
          let fill = lanes[k];
          if (k === 0 || k === 4) fill = tone(mix(fill, white > 0.5 ? "#9c9888" : "#a9be7c", rr() * 0.35 + white * 0.3), (rr() - 0.5) * 0.1);
          else if (k === 2) fill = tone(mix(fill, "#3f86b0", rr() * 0.6), (rr() - 0.5) * 0.08 + (rr() < 0.05 + white * 0.25 ? 0.35 : 0));
          else fill = tone(mix(fill, lanes[2], rr() * 0.45), (rr() - 0.5) * 0.08 + (q ? -0.03 : 0.03) + (rr() < white * 0.2 ? 0.3 : 0));
          body += poly(tri, mistedSoft(fill, centroid(tri)[1]));
        });
      }
    }
    for (let i = 5; i < last - 2; i += 6) {
      const p = center[i], f = fr[i], side = (rr() - 0.5) * widths[i] * 0.4, g = widths[i] * 0.4;
      if (p[1] < FADE) continue;
      const x = p[0] + f.n[0] * side, gy = p[1] + f.n[1] * side;
      body += poly([[x - f.t[0] * g, gy - f.t[1] * g], [x - f.t[1] * 1.8, gy + f.t[0] * 1.8], [x + f.t[0] * g, gy + f.t[1] * g]], "#ffffff",
        " class=\"glint\" style=\"animation-delay:" + ((i * 0.37) % 5).toFixed(2) + "s\"");
    }

    // The cave: a sinkhole the river pours into. Seen from above and to the south, its far wall drops away
    // in lit rock to darkness, and its near rim hides the rest. The waterfall runs down the far wall.
    if (pit) {
      const rc = rng(38), N = rim.length;
      const depth = pit.ry * 2.1, LV = 6;
      let inside = poly(rim, "#0b0f0d");
      // The far wall: from each rim point a jittered line of points drops away, shelving inward; neighbouring
      // lines share their points, so the rock facets between them meet without gaps and darken as they go down.
      const drops = rim.map(function (p) {
        const col = [p];
        for (let lv = 1; lv <= LV; lv++) {
          const t = lv / LV;
          col.push([p[0] + (pit.x - p[0]) * 0.06 * t + (rc() - 0.5) * 5, p[1] + depth * t + (rc() - 0.5) * 6]);
        }
        return col;
      });
      rim.forEach(function (p, k) {
        const q = rim[(k + 1) % N], A = drops[k], B = drops[(k + 1) % N];
        if (Math.min(p[1], q[1]) > pit.y + pit.ry * 0.35) return;
        const lit = 0.18 - (p[0] - pit.x) / pit.rx * 0.14;
        for (let lv = 0; lv < LV; lv++) {
          const base = mix("#aaa48f", "#1b1f1c", Math.pow((lv + 1) / LV, 0.8));
          const c1 = tone(base, lit + (rc() - 0.5) * 0.08), c2 = tone(base, lit - 0.06 + (rc() - 0.5) * 0.08);
          inside += poly([A[lv], B[lv], B[lv + 1]], c1, " stroke=\"" + c1 + "\" stroke-width=\".8\"") + poly([A[lv], B[lv + 1], A[lv + 1]], c2, " stroke=\"" + c2 + "\" stroke-width=\".8\"");
        }
      });
      // The near rim casts a shadow onto the far wall just inside it.
      rim.forEach(function (p, k) {
        const q = rim[(k + 1) % N];
        if (Math.max(p[1], q[1]) < pit.y + pit.ry * 0.2) return;
        inside += poly([p, q, [q[0], q[1] - 16 * K], [p[0], p[1] - 16 * K]], "#000000", " fill-opacity=\".35\"");
      });
      // The waterfall: one sheet of water from the river's full width at the lip, narrowing and darkening as it
      // falls down the far wall, streaked white, with spray where it lands in the dark.
      // It starts from the river's last whole cross-section before the rim, so the water itself bends over the
      // edge (the "spill", drawn over the rim below) rather than meeting the drop along a seam.
      const end = center[lip], fall = widths[lip], SL = 8;
      const edgeA = sections[lip - 1][1], edgeB = sections[lip - 1][4];
      const spillL = edgeA[0] < edgeB[0] ? edgeA : edgeB, spillR = edgeA[0] < edgeB[0] ? edgeB : edgeA;
      const spillY = Math.max(spillL[1], spillR[1], end[1]) + 10 * K + 4;
      const sx = (spillL[0] + spillR[0]) / 2, half = (spillR[0] - spillL[0]) / 2;
      const bankL = spillL === edgeA ? sections[lip - 1][0] : sections[lip - 1][5], bankR = spillL === edgeA ? sections[lip - 1][5] : sections[lip - 1][0];
      const drop = depth * 0.97 - (spillY - end[1]);
      const sheet = [];
      for (let lv = 0; lv <= SL; lv++) {
        const t = lv / SL, w = half * (1 - 0.22 * t) + (lv ? (rc() - 0.5) * 3 : 0), sway = lv ? (rc() - 0.5) * 3 : 0;
        sheet.push([[sx - w + sway, spillY + drop * t], [sx + w + sway, spillY + drop * t]]);
      }
      const spill = [spillL, spillR, sheet[0][1], sheet[0][0]];
      for (let lv = 0; lv < SL; lv++) {
        const a = sheet[lv], b = sheet[lv + 1], t = (lv + 0.5) / SL, mid0 = (a[0][0] + a[1][0]) / 2, mid1 = (b[0][0] + b[1][0]) / 2;
        const top = [mid0, a[0][1]], bot = [mid1, b[0][1]];
        [[a[0], top, bot, b[0]], [top, a[1], b[1], bot]].forEach(function (q, side) {
          const c = mix(side ? "#8fcbe0" : "#b9e3f0", "#22343b", Math.pow(t, 1.5) * 0.9);
          inside += poly([q[0], q[1], q[2]], c, " stroke=\"" + c + "\" stroke-width=\".6\"") + poly([q[0], q[2], q[3]], tone(c, -0.04), " stroke=\"" + tone(c, -0.04) + "\" stroke-width=\".6\"");
        });
      }
      for (let k = 0; k < 9; k++) {
        const x = sx + (rc() - 0.5) * half * 1.6, len = drop * (0.35 + rc() * 0.5), w = 0.8 + rc() * 1.4;
        inside += poly([[x - w, spillY + 2], [x + w, spillY + 2], [x + (rc() - 0.5) * 3, spillY + len]], "#ffffff", " fill-opacity=\"" + (0.35 + rc() * 0.35).toFixed(2) + "\"");
      }
      for (let k = 0; k < 11; k++) {
        const mx = sx + (rc() - 0.5) * half * 4, my = spillY + drop * (0.84 + rc() * 0.12), sz = (8 + rc() * 12) * K + 4;
        inside += poly([[mx - sz, my], [mx, my - sz * 0.6], [mx + sz, my], [mx, my + sz * 0.35]], "#e4f2f5", " fill-opacity=\".2\"");
      }
      // A caver rappels the far wall beside the falls, lamp lit, roped to the rim.
      const sc = 0.85 * K + 0.25, ropeX = end[0] + fall * 1.6 + 14 * K;
      const ropeTop = rim.filter(function (p) { return p[1] < pit.y; }).reduce(function (best, p) {
        return Math.abs(p[0] - ropeX) < Math.abs(best[0] - ropeX) ? p : best;
      }, [pit.x, pit.y - pit.ry]);
      const caver = [ropeTop[0] + 3, ropeTop[1] + depth * 0.42];
      inside += line([ropeTop, [caver[0], caver[1] - 14 * sc]], "#f2b44f", 1.3);
      inside += "<g class=\"lantern\">" + poly([[caver[0] - 24 * K - 8, caver[1] - 6], [caver[0], caver[1] - 30 * sc], [caver[0] + 24 * K + 8, caver[1] - 6], [caver[0], caver[1] + 16 * K]], "#f6d36b", " fill-opacity=\".18\"") + "</g>";
      inside += draw3d(personModel("#d9573b", "#f2d35b", "#3f87ad"), caver[0], caver[1], sc, { shadow: false });
      body += "<defs><clipPath id=\"sinkhole\"><polygon points=\"" + pts2(rim) + "\"/></clipPath></defs><g clip-path=\"url(#sinkhole)\">" + inside + "</g>";
      // Grass and moss lip hanging over the rim's far edge.
      rim.forEach(function (p, k) {
        const q = rim[(k + 1) % N];
        if (Math.min(p[1], q[1]) > pit.y + pit.ry * 0.1 || Math.abs((p[0] + q[0]) / 2 - end[0]) < fall * 0.7) return;
        const m = [(p[0] + q[0]) / 2 + (rc() - 0.5) * 4, (p[1] + q[1]) / 2 + (5 + rc() * 7) * K + 2];
        body += poly([p, q, m], rc() < 0.5 ? "#6fa462" : "#5a8f58");
      });
      // The spill: the river bending over the rim into the sheet below, with white water breaking across it.
      // The banks run down to the rim beside it, so no ground shows between the river's edge and the falls.
      [[bankL, spillL], [spillR, bankR]].forEach(function (b) {
        const c = tone("#c7b984", (rc() - 0.5) * 0.08);
        body += poly([b[0], b[1], [b[1][0], spillY], [b[0][0], spillY]], c, " stroke=\"" + c + "\" stroke-width=\".8\"");
      });
      const mid = [(spill[0][0] + spill[1][0]) / 2, (spill[0][1] + spill[1][1]) / 2], low = [(spill[2][0] + spill[3][0]) / 2, spill[2][1]];
      [[spill[0], mid, low, spill[3], "#a6dbea"], [mid, spill[1], spill[2], low, "#8fcbe0"]].forEach(function (q) {
        body += poly([q[0], q[1], q[2]], q[4], " stroke=\"" + q[4] + "\" stroke-width=\".8\"") + poly([q[0], q[2], q[3]], tone(q[4], 0.08), " stroke=\"" + tone(q[4], 0.08) + "\" stroke-width=\".8\"");
      });
      for (let k = 0; k < 7; k++) {
        const t = k / 6, x = spill[0][0] + (spill[1][0] - spill[0][0]) * t, y = spill[0][1] + (spill[1][1] - spill[0][1]) * t + (spillY - mid[1]) * 0.6, s = (3 + rc() * 4) * K + 2;
        body += poly([[x - s, y + 1], [x, y - s * 0.8], [x + s, y + 1], [x, y + s * 0.5]], "#ffffff", " class=\"surf\" style=\"animation-delay:" + (rc() * 3).toFixed(2) + "s\"");
      }
    }

    // ---------- everything that stands on the ground, painted back to front ----------
    const pieces = [];
    function add(y, svg, grow) { pieces.push({ y: y, svg: svg, grow: grow }); }
    function hidden(x0, y0, x1, y1) {
      return cards.some(function (c) { return x0 > c.x + 6 && x1 < c.x + c.w - 6 && y0 > c.y + 6 && y1 < c.y + c.h - 6; });
    }

    // Forests: trees packed on a jittered grid wherever the forest claims the ground.
    const rt = rng(17);
    const gap = T * 0.5;
    let count = 0;
    for (let gy = 30; gy < H + T; gy += gap * 0.8) {
      for (let gx = -gap / 2; gx < W + gap; gx += gap) {
        const x = gx + (rt() - 0.5) * gap * 0.9, y = gy + (rt() - 0.5) * gap * 0.7;
        const f = forestAt(x, y), roll = rt();
        const lone = f < 0.4 && roll < 0.012 + 0.03 * inHills(y);
        if (!lone && f < 0.48 + (rt() - 0.5) * 0.3) continue;
        if (riverDist(x, y) < baseWidth * 0.9 + 14 || y > H + T * 0.4 || (pit && Math.hypot((x - pit.x) / pit.rx, (y - pit.y) / pit.ry) < 1.15)) continue;
        const h = T * (0.75 + rt() * 0.55) * (1 + 0.25 * inDeepWoods(y)) * (lone ? 0.9 : 1);
        if (hidden(x - h * 0.3, y - h, x + h * 0.3, y)) continue;
        const dark = inDeepWoods(y) * 0.7;
        const broad = rt() < (lone ? 0.6 : 0.12 + 0.2 * inHills(y));
        let svg = lone ? treeShadow(x, y, h) : "";
        if (broad) {
          const leaf = rt() < 0.18 ? (rt() < 0.5 ? "#d9a441" : "#c47a35") : (rt() < 0.5 ? "#6aa84f" : "#5c9a4a");
          svg += broadleaf(rt, x, y, h * 0.95, dark ? mix(leaf, NIGHT, dark) : leaf, y < FADE);
        } else {
          svg += pine(x, y, h, PINES[Math.floor(rt() * PINES.length)], y < FADE, dark);
        }
        add(y, svg);
        if (++count > maxTrees) break;
      }
      if (count > maxTrees) break;
    }
    // The tree line closes into the footer.
    let skyline = [[-10, H + 2]];
    for (let x = -10; x <= W + 20; x += T * 0.32) skyline.push([x, H - T * (0.25 + rt() * 0.3)], [x + T * 0.16, H - T * (0.05 + rt() * 0.1)]);
    skyline.push([W + 20, H + 2]);
    add(H + 50, poly(skyline, NIGHT));

    // Rolling hills for the biking stop, with switchbacks climbing the main one.
    const rh = rng(41);
    mounds.forEach(function (mnd) {
      const m = model(), rings = 5, n = 11, P = [[[mnd.x, moundHeight(mnd, mnd.x, mnd.z), mnd.z]]];
      for (let k = 1; k <= rings; k++) {
        const ringPts = [];
        for (let i = 0; i < n; i++) {
          const a = (i / n) * 6.2832 + k * 0.3, f = (k / rings) * (k < rings ? 0.92 + rh() * 0.16 : 1);
          const x = mnd.x + Math.cos(a) * mnd.rx * f, z = mnd.z + Math.sin(a) * mnd.rz * f;
          ringPts.push([x, k === rings ? 0 : moundHeight(mnd, x, z), z]);
        }
        P.push(ringPts);
      }
      const tris = [];
      for (let i = 0; i < n; i++) tris.push([P[0][0], P[1][i], P[1][(i + 1) % n]]);
      for (let k = 1; k < rings; k++) {
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          tris.push([P[k][i], P[k + 1][i], P[k + 1][j]], [P[k][i], P[k + 1][j], P[k][j]]);
        }
      }
      surface(m, tris.map(function (t) { return t.map(function (p) { return [p[0] - mnd.x, p[1], p[2] - mnd.z]; }); }), function (n2, c) {
        return mix("#79ad5d", "#bcd992", clamp(c[1] / mnd.h, 0, 1) * 0.85);
      });
      if (mnd.main) {
        const way = [[-0.92, 0.8], [0.55, 0.66], [-0.5, 0.42], [0.45, 0.2], [-0.25, -0.02], [0.1, -0.16]].map(function (u) {
          const x = mnd.x + u[0] * mnd.rx * 0.9, z = mnd.z + u[1] * mnd.rz * 0.9;
          return [x, z];
        });
        const trail = resample(way, 10 * K + 4);
        const tw = 5 * K + 2;
        const tf = frames(trail);
        for (let i = 0; i < trail.length - 1; i++) {
          const a = trail[i], b = trail[i + 1], na = tf[i].n, nb = tf[i + 1].n;
          const ya = moundHeight(mnd, a[0], a[1]) + 0.8, yb = moundHeight(mnd, b[0], b[1]) + 0.8;
          decal(m, [[a[0] + na[0] * tw - mnd.x, ya, a[1] + na[1] * tw - mnd.z], [b[0] + nb[0] * tw - mnd.x, yb, b[1] + nb[1] * tw - mnd.z],
            [b[0] - nb[0] * tw - mnd.x, yb, b[1] - nb[1] * tw - mnd.z], [a[0] - na[0] * tw - mnd.x, ya, a[1] - na[1] * tw - mnd.z]], i % 2 ? "#d6bd8c" : "#cbb07c", { bias: 400 });
        }
        const at = trail[Math.floor(trail.length * 0.34)];
        mnd.rider = { x: at[0], z: at[1], y: moundHeight(mnd, at[0], at[1]) };
        mnd.crest = [[mnd.x - mnd.rx * 0.5, mnd.z - mnd.rz * 0.55], [mnd.x + mnd.rx * 0.58, mnd.z - mnd.rz * 0.4], [mnd.x + mnd.rx * 0.7, mnd.z + mnd.rz * 0.1]];
      }
      add(mnd.z - mnd.rz * 0.2, draw3d(m, mnd.x, mnd.z, 1, { shadow: false }));
      (mnd.crest || []).forEach(function (c) {
        const y = moundHeight(mnd, c[0], c[1]);
        add(c[1] + 1, treeShadow(c[0], c[1] - y * 0.8, T) + pine(c[0] + y * 0.12, c[1] - y * 0.8, T * 0.9, PINES[1]));
      });
      if (mnd.rider) {
        const rd = mnd.rider;
        add(rd.z + 2, draw3d(riderModel(), rd.x, rd.z, 1.1 * K + 0.3, { y: rd.y, shadow: 0.15 }), true);
      }
      if (mnd.main) {
        body += path(rp, wander(rp, [mnd.x - mnd.rx * 0.83, mnd.z + mnd.rz * 0.72], [riverXAt(mnd.z + mnd.rz) || mnd.x, mnd.z + mnd.rz * 1.25], 6, 30), 7 * K + 3, DIRT);
      }
    });

    // The gorge: both banks rise in clusters of granite columns, taller near the water and stepping down behind.
    // A column never stands so tall that its top would hide the river.
    const rg = rng(43);
    function column(x, z, rc, h, grey) {
      const m = model(), rot = rg() * 6, moss = rg() < 0.55;
      loft(m, [ring(6, rc, -2, rg, 0.35, rot, 1.1), ring(6, rc * 0.9, h * 0.72, rg, 0.3, rot + 0.2, 1.1), ring(6, rc * 0.68, h, rg, 0.3, rot + 0.5, 1.1)],
        function (n) { return n[1] > 0.8 ? (moss ? "#8fae6a" : tone(grey, 0.08)) : tone(grey, (rg() - 0.5) * 0.1); });
      return m;
    }
    function standTall(x, z, rc, h) {
      while (h > 6 && riverDist(x + LEAN[0] * h, z + LEAN[1] * h) < baseWidth * 0.6 + rc * 0.8) h *= 0.82;
      return h;
    }
    for (let i = 0; i < last - 1; i++) {
      const p = center[i], g = inGorge(p[1]), f = fr[i];
      if (g < 0.15) continue;
      [1, -1].forEach(function (side) {
        for (let row = 0; row < 3; row++) {
          if (rg() < 0.25 + row * 0.15) continue;
          const rc = ((13 + rg() * 12) * K + 4) * (1 - row * 0.12);
          const d = widths[i] / 2 + baseWidth * 0.25 + rc * 0.9 + row * rc * 1.5 + rg() * 6;
          const x = p[0] + f.n[0] * side * d + f.t[0] * (rg() - 0.5) * 24, z = p[1] + f.n[1] * side * d + f.t[1] * (rg() - 0.5) * 24;
          if (riverDist(x, z) < widths[i] / 2 + rc * 0.7) continue;
          const h = standTall(x, z, rc, (30 + rg() * 45) * K * g * (1 - row * 0.25));
          if (h < 8 || hidden(x - rc, z - h * 0.8 - rc, x + rc + h * 0.12, z + rc)) continue;
          add(z + rc * 0.5, draw3d(column(x, z, rc, h, rg() < 0.5 ? "#aaa596" : "#9d9a8c"), x, z, 1, { shadow: 0.22 }));
        }
      });
    }
    // The climbing crag: a tall cluster on the east bank, its sunlit west face toward the river, with one
    // climber leading up the face and a partner belaying at its foot.
    if (st.climbing) {
      const f = st.climbing.feature, cx = Math.max(f.x, (riverXAt(f.z) || f.x) + baseWidth * 0.9 + 40 * K);
      const cols = [[0, 0, 30, 1], [-8, 26, 24, 0.82], [26, -18, 26, 0.9], [40, 20, 22, 0.66], [-4, -34, 22, 0.74], [58, -6, 20, 0.55]];
      let crag = null;
      cols.forEach(function (c) {
        const x = cx + c[0] * K, z = f.z + c[1] * K, rc = c[2] * K + 5, h = standTall(x, z, rc, (150 * K + 30) * c[3]);
        add(z + rc * 0.5, draw3d(column(x, z, rc, h, "#b0ab9b"), x, z, 1, { shadow: 0.24 }));
        if (!crag) crag = { x: x - rc * 0.95, z: z, h: h };
      });
      const s = 0.9 * K + 0.25, top = screen([crag.x + 3, crag.h * 0.97, crag.z]), mid = [crag.x - 2, crag.h * 0.55, crag.z + 2], belay = [crag.x - 22 * K - 6, 0, crag.z + 14 * K];
      add(crag.z + 40 * K, line([top, screen([mid[0] + 1, mid[1] + 14 * s, mid[2]]), screen([belay[0] + 2, 12 * s, belay[2]])], "#f2b44f", 1.4) +
        draw3d(personModel("#d9573b", "#f2b44f"), mid[0], mid[2], s, { y: mid[1], shadow: false }) +
        draw3d(personModel("#3f87ad", "#f2d35b"), belay[0], belay[2], s), true);
    }
    // Rapids: rocks breaking the water and kayakers in the eddies.
    if (st.whitewater) {
      const b = st.whitewater.box, rw = rng(47);
      center.forEach(function (p, i) {
        if (p[1] < b.y || p[1] > b.y + b.h || i % 2) return;
        const f = fr[i], off = (rw() - 0.5) * widths[i] * 0.7;
        add(p[1] + f.n[1] * off, draw3d(rockModel(rw, (4 + rw() * 5) * K + 2, "#8f9188"), p[0] + f.n[0] * off, p[1] + f.n[1] * off, 1, { shadow: 0.15 }));
        const c = [p[0] + f.n[0] * (rw() - 0.5) * widths[i] * 0.6, p[1] + f.n[1] * (rw() - 0.5) * widths[i] * 0.6], g = widths[i] * 0.22;
        body += poly([[c[0] + f.n[0] * g, c[1] + f.n[1] * g], [c[0] + f.t[0] * 7, c[1] + f.t[1] * 7], [c[0] - f.n[0] * g, c[1] - f.n[1] * g], [c[0] + f.t[0] * 3, c[1] + f.t[1] * 3]],
          "#ffffff", " class=\"surf\" style=\"animation-delay:" + (rw() * 3).toFixed(2) + "s\"");
      });
      [0.35, 0.7].forEach(function (f, k) {
        const y = b.y + b.h * f, x = riverXAt(y);
        if (x === null) return;
        const s = 0.85 * K + 0.25, m = boatModel(34, 9, k ? "#f2b44f" : "#d9573b"), pm = personModel(k ? "#3f87ad" : "#2f6449", "#f2d35b");
        add(y + 6, draw3d(m, x + (k ? 6 : -8) * K, y, s, { shadow: 0.12 }) + draw3d(pm, x + (k ? 6 : -8) * K, y, s * 0.9, { y: -4 * s, shadow: false }), true);
      });
    }

    // The Wilderness Outpost: a cabin in the meadow by the river, a dock, and canoes on a rack.
    if (st.gear) {
      const f = st.gear.feature, s = 0.95 * K + 0.12, rx = riverXAt(f.z + 40 * K);
      add(f.z + 40 * s, draw3d(cabinModel(), f.x, f.z, s, { shadow: 0.22 }), true);
      const rackX = f.x + (rx !== null && rx < f.x ? -1 : 1) * 86 * s;
      const rack = draw3d(rackModel(), rackX, f.z + 30 * s, s, { shadow: 0.18 }) +
        draw3d(boatModel(60, 13, "#e8713c"), rackX, f.z + 26 * s, s, { y: 18 * s, shadow: false }) +
        draw3d(boatModel(60, 13, "#3f87ad"), rackX, f.z + 36 * s, s, { y: 18 * s, shadow: false });
      add(f.z + 50 * s, rack, true);
      if (rx !== null) {
        const dir = rx < f.x ? -1 : 1, dock = model(), len = Math.abs(rx - f.x) * 0.5 + 30 * s;
        box(dock, 0, len, 2, 6, -9, 9, "#9c7048");
        [[0.3, -9], [0.3, 9], [0.95, -9], [0.95, 9]].forEach(function (q) { box(dock, q[0] * len - 2, q[0] * len + 2, -6, 8, q[1] - 2, q[1] + 2, "#6b4a33"); });
        const dx = dir < 0 ? rx + widths[0] * 0.1 : rx - len - widths[0] * 0.1;
        add(f.z + 64 * s, draw3d(dock, dx, f.z + 60 * s, 1, { shadow: 0.2 }) +
          draw3d(boatModel(46, 11, "#f2b44f"), dx + (dir < 0 ? -6 : len + 6) * 1, f.z + 76 * s, s, { shadow: 0.12 }), true);
      }
      add(f.z + 70 * s, draw3d(personModel("#3f87ad", "#2f6449", "#f2b44f"), f.x + 30 * s, f.z + 54 * s, s * 1.1, { shadow: 0.15 }), true);
    }

    // The campsite: two tents and a fire in a clearing in the woods.
    if (st.backpacking) {
      const f = st.backpacking.feature, s = 1.1 * K + 0.2, rc2 = rng(53);
      add(f.z - 10 * s, draw3d(tentModel("#f2b44f", 20, 26, 22), f.x - 50 * s, f.z - 16 * s, s, { shadow: 0.2 }), true);
      add(f.z + 4 * s, draw3d(tentModel("#3f87ad", 17, 22, 19), f.x + 46 * s, f.z - 4 * s, s, { shadow: 0.2 }), true);
      add(f.z + 30 * s, draw3d(campfireModel(rc2), f.x, f.z + 26 * s, s, { shadow: false }), true);
      const seat = model();
      box(seat, -16, 16, 0, 6, -4, 4, "#7a5636");
      add(f.z + 52 * s, draw3d(seat, f.x - 4 * s, f.z + 50 * s, s, { shadow: 0.18 }), true);
      add(f.z + 46 * s, draw3d(personModel("#d9573b", "#5a4030", "#2f6449"), f.x + 24 * s, f.z + 44 * s, s, { shadow: 0.15 }) +
        draw3d(personModel("#f2b44f", "#5a4030"), f.x - 28 * s, f.z + 38 * s, s, { shadow: 0.15 }), true);
    }

    // Around the cave: boulders on the rim and around it, and a partner watching from the near edge.
    if (pit) {
      const rk = rng(59), s = 0.9 * K + 0.25;
      for (let k = 0; k < 14; k++) {
        const a = rk() * 6.2832, d = 1.02 + rk() * 0.25, x = pit.x + Math.cos(a) * pit.rx * d, y = pit.y + Math.sin(a) * pit.ry * d;
        if (Math.hypot(x - center[lip][0], y - center[lip][1]) < widths[lip] * 1.4) continue;
        add(y, draw3d(rockModel(rk, (8 + rk() * 14) * K + 3), x, y, 1, { shadow: 0.2 }));
      }
      for (let k = 0; k < 10; k++) {
        const a = rk() * 6.2832, d = 1.5 + rk() * 1.4, x = pit.x + Math.cos(a) * pit.rx * d, y = pit.y + Math.sin(a) * pit.ry * d;
        if (riverDist(x, y) < baseWidth * 1.2) continue;
        add(y, draw3d(rockModel(rk, (14 + rk() * 22) * K + 4), x, y, 1, { shadow: 0.22 }));
      }
      const spot = [pit.x + pit.rx * 0.62, pit.y + pit.ry * 1.05];
      add(spot[1] + 4, draw3d(personModel("#3f87ad", "#f2d35b", "#b8562f"), spot[0], spot[1], s), true);
    }

    // Riverbank details that sprout as the kayak passes.
    const rb = rng(13);
    for (let i = 3; i < last - 2; i += 1 + Math.floor(rb() * 2)) {
      const p = center[i], f = fr[i], side = rb() < 0.5 ? -1 : 1, edge = widths[i] / 2 + baseWidth * 0.3;
      if (inGorge(p[1]) > 0.3) continue;
      const kind = rb(), off = edge + (kind < 0.22 ? 2 : 10 + rb() * 30);
      const x = p[0] + f.n[0] * off * side, y = p[1] + f.n[1] * off * side;
      if (y < FADE * 0.7 || x < 8 || x > W - 8 || cleared(x, y) > 0.5 || riverDist(x, y) < edge - 2) continue;
      if (hidden(x - 20, y - 20, x + 20, y)) continue;
      let svg;
      if (kind < 0.22) svg = reeds(rb, x, y, 24 * K + 6);
      else if (kind < 0.45) svg = bush(rb, x, y, (9 + rb() * 6) * K + 2);
      else if (kind < 0.65) svg = draw3d(rockModel(rb, (6 + rb() * 8) * K + 2), x, y, 1, { shadow: 0.18 });
      else if (kind < 0.85) svg = flowers(rb, x, y, 12 * K + 3);
      else svg = broadleaf(rb, x, y, T * 0.8, "#6aa84f");
      add(y, svg, true);
    }

    // Grouped into thin rows by depth, so the kayak can be slipped in between them and pass behind
    // whatever stands in front of it.
    pieces.sort(function (a, b) { return a.y - b.y; });
    let row = null, rowSvg = "";
    pieces.forEach(function (p) {
      const k = Math.floor(p.y / ROW);
      if (k !== row) {
        if (rowSvg) body += "<g data-row=\"" + row * ROW + "\">" + rowSvg + "</g>";
        row = k;
        rowSvg = "";
      }
      rowSvg += p.grow ? sprout(p.y, p.svg) : p.svg;
    });
    if (rowSvg) body += "<g data-row=\"" + row * ROW + "\">" + rowSvg + "</g>";

    return {
      svg: "<svg xmlns=\"" + SVGNS + "\" viewBox=\"0 0 " + W + " " + H + "\" preserveAspectRatio=\"none\" aria-hidden=\"true\" focusable=\"false\">" + body + "</svg>",
      route: center,
    };
  }

  const land = document.createElement("div");
  land.className = "land";
  host.insertBefore(land, host.firstChild);
  const art = document.createElement("div");
  land.appendChild(art);
  // The kayak lives inside the drawing, moved between rows of scenery as it travels, so trees, rocks and
  // banks in front of it hide it the way they should.
  const kayak = document.createElementNS(SVGNS, "g");
  kayak.innerHTML =
    "<g transform=\"translate(-23 -13)\">" +
    "<polygon points=\"2,13 12,8 23,7 23,13\" fill=\"#f6c46a\"/><polygon points=\"23,7 34,8 44,13 23,13\" fill=\"#f2b44f\"/>" +
    "<polygon points=\"2,13 23,13 23,19 12,18\" fill=\"#c98a36\"/><polygon points=\"23,13 44,13 34,18 23,19\" fill=\"#b3772e\"/>" +
    "<polygon points=\"18,1 21,1 27,25 24,25\" fill=\"#3b2a1e\"/><polygon points=\"16,0 22,0 21,5 17,5\" fill=\"#10281e\"/><polygon points=\"23,21 29,21 28,26 24,26\" fill=\"#10281e\"/>" +
    "<polygon points=\"20,10 26,10 26,16 20,16\" fill=\"#10281e\"/><polygon points=\"21,11 25,11 23,14\" fill=\"#d9573b\"/></g>";

  let route = [], sprouts = [], grown = 0, rows = [], slot = -1, boatSize = 1;
  function paddle() {
    if (route.length < 2) return;
    // Keep the kayak a little below the middle of the screen, on the river; past the river's end it has gone into the cave.
    const target = window.innerHeight * 0.58 - host.getBoundingClientRect().top;
    const end = route[route.length - 1];
    let lo = 0, hi = route.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (route[mid][1] < target) lo = mid; else hi = mid;
    }
    const a = route[lo], b = route[hi];
    const t = clamp((target - a[1]) / ((b[1] - a[1]) || 1), 0, 1);
    const angle = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
    const gone = clamp((target - end[1]) / 60, 0, 1);
    const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t + gone * 30;
    kayak.setAttribute("opacity", (1 - gone).toFixed(2));
    kayak.setAttribute("transform", "translate(" + x.toFixed(1) + " " + y.toFixed(1) + ") rotate(" + angle.toFixed(1) + ") scale(" + (boatSize * (1 - gone * 0.5)).toFixed(2) + ")");
    // Slot it in front of the rows behind it and behind the rows in front (a row's y is where its pieces meet the ground).
    let k = 0;
    while (k < rows.length && rows[k].y <= y + 4) k++;
    if (k !== slot) {
      slot = k;
      const svg = art.firstChild;
      if (svg) svg.insertBefore(kayak, k < rows.length ? rows[k].el : null);
    }
    // Scenery a little way downstream of the kayak grows in; once grown it stays.
    const reach = target + window.innerHeight * 0.32;
    while (grown < sprouts.length && sprouts[grown].y < reach) {
      sprouts[grown].el.classList.add("up");
      grown++;
    }
  }

  // Where the hero's river meets the bottom of the hero, in this element's coordinates.
  function heroRiver(hostBox) {
    const valley = document.querySelector(".scene img[src$='valley.svg']");
    if (!valley) return null;
    const v = valley.getBoundingClientRect();
    const scale = Math.max(v.width / 1440, v.height / 720); // the layers use xMidYMax slice
    return { x: v.left + v.width / 2 + (HERO_RIVER.x - 720) * scale - hostBox.left, w: HERO_RIVER.w * scale };
  }

  // Each stop: the river runs through the open slot beside its card, on the side nearest the card, and the
  // stop's set piece takes the rest of the slot. At the rapids and the cave the river runs down the middle.
  function readStations(hostBox) {
    return Array.from(host.querySelectorAll("[data-station]")).map(function (row, i) {
      const slot = row.querySelector(".spot").getBoundingClientRect();
      const card = row.querySelector(".card").getBoundingClientRect();
      const box = { x: slot.left - hostBox.left, y: slot.top - hostBox.top, w: slot.width, h: slot.height };
      const beside = slot.bottom > card.top + 20 && slot.top < card.bottom - 20;
      const kind = row.dataset.station;
      let side = beside ? (card.left < slot.left ? 0.18 : 0.82) : (i % 2 ? 0.16 : 0.84);
      if (kind === "whitewater" || kind === "caving") side = 0.5;
      if (kind === "climbing") {
        // The crag's sunlit face looks west, so the river runs down the west side of the slot.
        return { kind: kind, box: box, river: box.x + box.w * 0.24, feature: { x: box.x + box.w * 0.62, z: box.y + box.h * 0.62 } };
      }
      const featureAt = side < 0.5 ? 0.62 : side > 0.5 ? 0.38 : 0.5;
      return {
        kind: kind, box: box, river: box.x + box.w * side,
        feature: { x: box.x + box.w * featureAt, z: box.y + box.h * (kind === "caving" ? 0.55 : 0.6) },
      };
    });
  }
  // Where the cards rest once they have popped in (offsets ignore the reveal transform). Scenery wholly under
  // one is skipped. The pinned chart moves, so it never hides anything.
  function readCards() {
    return Array.from(host.querySelectorAll(".card:not(.stick)")).map(function (c) {
      let x = 0, y = 0, e = c;
      while (e && e !== host) {
        x += e.offsetLeft;
        y += e.offsetTop;
        e = e.offsetParent;
      }
      return { x: x, y: y, w: c.offsetWidth, h: c.offsetHeight };
    });
  }

  // Rebuild when the width changes or the page grows or shrinks noticeably (fonts loading, narrow layouts).
  let drawn = "", queued = false;
  function draw() {
    queued = false;
    const hostBox = host.getBoundingClientRect();
    const W = Math.round(host.clientWidth), H = Math.round(host.offsetHeight);
    const key = W + "x" + Math.round(H / 40);
    if (!W || !H || key === drawn) return;
    drawn = key;
    const wrap = host.querySelector(".wrap");
    const result = build(W, H, {
      pad: parseFloat(getComputedStyle(host).paddingBottom) || 0,
      margin: wrap ? wrap.getBoundingClientRect().left - hostBox.left : 16,
      start: heroRiver(hostBox),
      stations: readStations(hostBox),
      cards: readCards(),
    });
    art.innerHTML = result.svg;
    route = result.route;
    rows = Array.from(art.querySelectorAll("[data-row]")).map(function (el) { return { el: el, y: Number(el.dataset.row) + ROW }; });
    slot = -1;
    boatSize = clamp(W / 1100, 0.8, 1.26);
    sprouts = Array.from(art.querySelectorAll(".sprout")).map(function (el) { return { el: el, y: Number(el.dataset.y) }; });
    grown = 0;
    paddle();
  }
  function queue() {
    if (!queued) {
      queued = true;
      requestAnimationFrame(draw);
    }
  }
  if ("ResizeObserver" in window) new ResizeObserver(queue).observe(host);
  else window.addEventListener("resize", queue);
  queue();

  let rowing = false;
  window.addEventListener("scroll", function () {
    if (!rowing) {
      rowing = true;
      requestAnimationFrame(function () {
        rowing = false;
        paddle();
      });
    }
  }, { passive: true });
})();
