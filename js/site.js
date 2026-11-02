(function () {
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      const open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    nav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        nav.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  const layers = Array.from(document.querySelectorAll("[data-depth]"));
  const wide = window.matchMedia("(min-width: 861px)");
  if (layers.length && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    let queued = false;
    function paint() {
      const y = wide.matches ? Math.min(window.scrollY, window.innerHeight) : 0;
      layers.forEach(function (layer) {
        layer.style.transform = "translate3d(0," + (y * Number(layer.dataset.depth)).toFixed(1) + "px,0)";
      });
      queued = false;
    }
    window.addEventListener("scroll", function () {
      if (!queued) {
        queued = true;
        requestAnimationFrame(paint);
      }
    }, { passive: true });
    paint();
  }

  function pts(list) { return list.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" "); }
  function shape(list, fill, i, extra) {
    return "<polygon class=\"v\" style=\"--i:" + i + "\" points=\"" + pts(list) + "\" fill=\"" + fill + "\"" + (extra || "") + "/>";
  }
  const ALARM = { lit: "#d93a3a", shade: "#a51f24" }, WELL = { lit: "#6fa462", shade: "#2f6449" }, NONE = { lit: "#dfe3dc", shade: "#c8cfc5" };
  let gradients = 0;
  const VIZ = {
    ratio: function (box) {
      const of = Number(box.dataset.of), hit = Number(box.dataset.hit), on = box.dataset.tone === "good" ? WELL : ALARM;
      const w = 36, gap = 24, x0 = 100 - ((of - 1) * (w + gap)) / 2;
      let defs = "", s = "";
      for (let k = 0; k < of; k++) {
        const x = x0 + k * (w + gap), f = Math.max(0, Math.min(1, hit - k));
        let lit = f >= 1 ? on.lit : NONE.lit, shade = f >= 1 ? on.shade : NONE.shade;
        if (f > 0 && f < 1) {
          const id = "cut" + (gradients++);
          ["lit", "shade"].forEach(function (tone) {
            defs += "<linearGradient id=\"" + id + tone + "\" gradientUnits=\"userSpaceOnUse\" x1=\"" + (x - w / 2) + "\" x2=\"" + (x + w / 2) + "\" y1=\"0\" y2=\"0\">" +
              "<stop offset=\"" + f + "\" stop-color=\"" + on[tone] + "\"/><stop offset=\"" + f + "\" stop-color=\"" + NONE[tone] + "\"/></linearGradient>";
          });
          lit = "url(#" + id + "lit)";
          shade = "url(#" + id + "shade)";
        }
        s += shape([[x - 9, 20], [x, 9], [x, 31]], lit, k * 6) + shape([[x, 9], [x + 9, 20], [x, 31]], shade, k * 6);
        s += shape([[x - w / 2, 90], [x - w / 2 + 4, 41], [x, 35], [x, 90]], lit, k * 6 + 3) + shape([[x, 35], [x + w / 2 - 4, 41], [x + w / 2, 90], [x, 90]], shade, k * 6 + 3);
      }
      return (defs ? "<defs>" + defs + "</defs>" : "") + s;
    },
  };
  document.querySelectorAll("[data-viz]").forEach(function (box) {
    const draw = VIZ[box.dataset.viz];
    if (draw) box.innerHTML = "<svg viewBox=\"0 0 200 96\" focusable=\"false\">" + draw(box) + "</svg>";
  });

  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function countUp(stat) {
    const b = stat.querySelector("b");
    const parts = b.textContent.match(/^(\D*)(\d+)(.*)$/);
    if (!parts || still) return;
    const end = Number(parts[2]);
    if (end < 10) return;
    const start = performance.now();
    function tick(now) {
      const t = Math.min((now - start) / 1100, 1);
      b.textContent = parts[1] + Math.round(end * (1 - Math.pow(1 - t, 3))) + parts[3];
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  const pops = Array.from(document.querySelectorAll(".card, .stat-row"));
  function pop(el) {
    el.classList.add("in");
    if (el.classList.contains("stat-row")) el.querySelectorAll(".stat").forEach(countUp);
  }
  if ("IntersectionObserver" in window) {
    const watcher = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          pop(entry.target);
          watcher.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.08 });
    pops.forEach(function (el) { watcher.observe(el); });
  } else {
    pops.forEach(pop);
  }

  const chart = document.querySelector("[data-chart]");
  if (chart) {
    const buttons = Array.from(chart.querySelectorAll(".bar-btn"));
    const detail = document.querySelector("[data-chart-detail]");
    const num = detail.querySelector(".detail-num b");
    const title = detail.querySelector("h3");
    const text = detail.querySelector("p:not(.detail-num)");
    const waffle = document.querySelector("[data-waffle]");
    const people = [];
    for (let i = 0; i < 100; i++) {
      const person = document.createElement("span");
      person.style.setProperty("--i", i);
      waffle.appendChild(person);
      people.push(person);
    }
    function show(button) {
      const n = Number(button.dataset.n);
      buttons.forEach(function (item) { item.setAttribute("aria-pressed", item === button ? "true" : "false"); });
      people.forEach(function (person, i) { person.classList.toggle("hit", i < n); });
      waffle.classList.toggle("warn", button.dataset.tone === "warn");
      detail.classList.toggle("warn", button.dataset.tone === "warn");
      num.textContent = n;
      title.textContent = button.dataset.title;
      text.textContent = button.dataset.detail;
    }
    buttons.forEach(function (button) {
      button.addEventListener("click", function () { show(button); });
    });
    show(buttons[0]);
  }

  function mix(a, b, t) {
    const A = [1, 3, 5].map(function (i) { return parseInt(a.slice(i, i + 2), 16); });
    const B = [1, 3, 5].map(function (i) { return parseInt(b.slice(i, i + 2), 16); });
    return "#" + A.map(function (v, i) { return Math.round(v + (B[i] - v) * Math.max(0, Math.min(1, t))).toString(16).padStart(2, "0"); }).join("");
  }
  function rng(seed) {
    return function () {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function poly(list, fill, extra) {
    return "<polygon points=\"" + pts(list) + "\" fill=\"" + fill + "\"" + (extra === undefined ? " stroke=\"" + fill + "\" stroke-width=\".4\" stroke-linejoin=\"round\"" : extra) + "/>";
  }
  function wire(list, stroke, width) {
    return "<polyline points=\"" + pts(list) + "\" fill=\"none\" stroke=\"" + stroke + "\" stroke-width=\"" + width + "\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>";
  }
  function hex(cx, cy, r, rot) {
    const out = [];
    for (let k = 0; k < 6; k++) { const a = k / 6 * 6.2832 + (rot || 0); out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    return out;
  }

  const GT = { gold: "#b3a369", navy: "#003057" };
  function emblem() {
    const N = 16;
    function at(r, k) { const a = k / N * 6.2832 - 1.5708; return [50 + Math.cos(a) * r, 50 + Math.sin(a) * r]; }
    function light(k, facing) { const a = (k + 0.5) / N * 6.2832 - 1.5708; return -(Math.cos(a) + Math.sin(a)) * 0.7071 * facing; }
    function lit(base, l, hi, lo) { return l > 0 ? mix(base, hi, l * 0.65) : mix(base, lo, -l * 0.6); }
    const outline = [];
    for (let k = 0; k < N; k++) outline.push(at(48.5, k));
    let s = poly(outline.map(function (p) { return [p[0] + 2.5, p[1] + 3.5]; }), "#1c3326", " fill-opacity=\".3\"");
    for (let k = 0; k < N; k++) {
      [[48.5, 43, 0.95], [43, 37, -0.8]].forEach(function (b) {
        const l = light(k, b[2]);
        s += poly([at(b[0], k), at(b[0], k + 1), at(b[1], k + 1)], lit(GT.gold, l, "#f3e9c2", "#4f4528"));
        s += poly([at(b[0], k), at(b[1], k + 1), at(b[1], k)], lit(GT.gold, l - 0.06, "#f3e9c2", "#4f4528"));
      });
      s += poly([at(37, k), at(37, k + 1), at(25, k + 0.5)], lit(GT.navy, light(k, 0.7), "#4a7aa6", "#000d1a"));
      s += poly([at(25, k + 0.5), at(37, k + 1), at(25, k + 1.5)], lit(GT.navy, light(k + 0.5, 0.6), "#4a7aa6", "#000d1a"));
      s += poly([at(25, k + 0.5), at(25, k + 1.5), [47, 47]], lit(GT.navy, light(k + 0.5, 0.28), "#4a7aa6", "#000d1a"));
    }
    const G = [[29, 33], [49, 33], [49, 40], [32, 40], [29, 43], [29, 57], [32, 60], [42, 60], [42, 55], [37, 55], [37, 48], [49, 48], [49, 67], [29, 67], [22, 60], [22, 40]];
    const T = [[51, 33], [75, 33], [78, 36], [78, 40], [68, 40], [68, 67], [61, 67], [61, 40], [51, 40]];
    const letters = poly(G, "#fff", "") + poly(T, "#fff", "");
    s += "<defs><clipPath id=\"gt-letters\">" + letters + "</clipPath></defs>";
    s += poly(G, "#fff", " stroke=\"#fff\" stroke-width=\"3.4\"") + poly(T, "#fff", " stroke=\"#fff\" stroke-width=\"3.4\"");
    s += "<g clip-path=\"url(#gt-letters)\">" + poly([[0, 0], [100, 0], [100, 100], [0, 100]], GT.gold, "") +
      poly([[0, 0], [92, 0], [0, 88]], "#dccf9e", "") + poly([[100, 6], [100, 100], [10, 100]], "#958752", "") +
      "<polygon class=\"sheen\" points=\"10,26 19,26 5,74 -4,74\" fill=\"#fff\" fill-opacity=\".6\"/></g>";
    return "<svg viewBox=\"0 0 100 100\" aria-hidden=\"true\" focusable=\"false\">" + s + "</svg>";
  }

  const GLYPH = {
    gear: function () {
      return poly([[25, 7], [28, 7], [28, 13], [25, 11]], "#8f8a80") + poly([[9, 16], [31, 16], [31, 28], [9, 28]], "#a8744b") +
        poly([[6, 17], [20, 6], [20, 17]], "#d06a3c") + poly([[20, 6], [34, 17], [20, 17]], "#b8562f") +
        poly([[17, 20], [23, 20], [23, 28], [17, 28]], "#4a3527") + poly([[25, 19], [29, 19], [29, 23], [25, 23]], "#f6d36b");
    },
    backpacking: function () {
      return poly([[31, 3], [35, 13], [27, 13]], "#93bf73") + poly([[31, 8], [37, 22], [25, 22]], "#6fa462") + poly([[30, 22], [32, 22], [32, 27], [30, 27]], "#8a6440") +
        poly([[3, 28], [15, 9], [15, 28]], "#f2b44f") + poly([[15, 9], [27, 28], [15, 28]], "#c98a36") + poly([[11, 28], [15, 17], [19, 28]], "#2a2620");
    },
    biking: function () {
      return poly(hex(10, 21, 6.5, 0.5), "none", " stroke=\"#eef3ea\" stroke-width=\"2.2\" stroke-linejoin=\"round\"") +
        poly(hex(30, 21, 6.5, 0.5), "none", " stroke=\"#eef3ea\" stroke-width=\"2.2\" stroke-linejoin=\"round\"") +
        wire([[10, 21], [16, 11], [27, 11], [30, 21]], "#f2b44f", 2) + wire([[16, 11], [20, 21], [10, 21]], "#f2b44f", 2) + wire([[20, 21], [27, 11]], "#f2b44f", 2) +
        wire([[27, 11], [26, 6], [29.5, 5.5]], "#eef3ea", 1.8) + wire([[13.5, 8.5], [18, 8.5]], "#eef3ea", 2.4);
    },
    whitewater: function () {
      return poly([[0, 25], [40, 25], [40, 31], [0, 31]], "#3f87ad") + poly([[0, 25], [8, 19], [16, 25]], "#5ea7cb") + poly([[14, 25], [24, 18], [34, 25]], "#93cfe2") + poly([[30, 25], [36, 20], [42, 25]], "#5ea7cb") +
        wire([[11, 8], [29, 25]], "#3b2a1e", 1.6) + poly([[5, 19], [20, 16], [35, 19]], "#f6c46a") + poly([[5, 19], [35, 19], [20, 22.5]], "#c98a36") +
        poly([[18, 10], [22, 10], [22, 16], [18, 16]], "#d9573b") + poly(hex(20, 8, 2.4), "#f2d35b");
    },
    climbing: function () {
      return poly([[3, 30], [13, 6], [18, 30]], "#d4cfba") + poly([[13, 6], [25, 2], [24, 30], [18, 30]], "#a9ab9f") + poly([[25, 2], [37, 30], [24, 30]], "#7d8277") +
        wire([[20, 3], [19, 13], [21, 21]], "#f2b44f", 1.4) + poly(hex(21.5, 21, 2.2), "#d9573b");
    },
    caving: function () {
      return poly([[2, 30], [9, 11], [20, 5], [31, 11], [38, 30]], "#8f9087") + poly([[2, 30], [9, 11], [20, 5], [15, 16]], "#b5b3a4") +
        poly([[12, 30], [15, 18], [20, 14], [25, 18], [28, 30]], "#0b0f0d") + poly([[18.5, 23], [21.5, 23], [22.5, 29], [17.5, 29]], "#f2b44f") + poly([[17, 21], [23, 21], [20, 19]], "#ffd36b");
    },
  };

  document.querySelectorAll("[data-glyph]").forEach(function (box) {
    const draw = GLYPH[box.dataset.glyph];
    if (draw) box.innerHTML = "<svg viewBox=\"0 0 40 32\" focusable=\"false\">" + draw() + "</svg>";
  });

  const guide = document.querySelector("[data-guide]");
  if (guide) {
    guide.querySelector(".emblem").innerHTML = emblem();
    const sign = guide.querySelector("[data-guide-sign]");
    const glyph = sign.querySelector(".guide-glyph");
    const step = sign.querySelector("small");
    const name = sign.querySelector("strong");
    const rows = Array.from(document.querySelectorAll("[data-station]"));
    const stops = rows.map(function (row, i) {
      const jump = document.querySelector(".trip-picker a[href='#" + row.id + "']");
      return {
        row: row, kind: row.dataset.station, href: row.dataset.official || "#" + row.id,
        name: jump ? jump.querySelector(".region-name").textContent : row.querySelector("h3").textContent, step: "Stop " + (i + 1) + " of " + rows.length,
      };
    });
    const next = guide.querySelector("[data-next-step]");
    const tab = guide.querySelector("[data-next-tab]");
    const SEEN = "orgt-next-step-seen";
    let seen = false;
    try { seen = sessionStorage.getItem(SEEN) === "1"; } catch (e) { }
    function showTab() {
      tab.hidden = false;
      guide.classList.add("has-tab");
    }
    let autoClose = 0;
    function setNext(open, moveFocus) {
      clearTimeout(autoClose);
      guide.classList.toggle("next-open", open);
      next.setAttribute("aria-hidden", open ? "false" : "true");
      next.inert = !open;
      tab.setAttribute("aria-expanded", open ? "true" : "false");
      if (moveFocus) (open ? next.querySelector("h2") : tab).focus();
    }
    next.inert = true;
    if (seen) showTab();
    tab.addEventListener("click", function () { setNext(!guide.classList.contains("next-open"), true); });
    next.querySelector("[data-next-close]").addEventListener("click", function () { setNext(false, true); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && guide.classList.contains("next-open")) setNext(false, true);
    });

    let current = null, looking = false;
    function look() {
      looking = false;
      const line = window.innerHeight * 0.56;
      let at = null;
      stops.forEach(function (s) { if (s.row.getBoundingClientRect().top < line) at = s; });
      const past = stops[stops.length - 1].row.getBoundingClientRect().bottom < window.innerHeight * 0.25;
      if (past && !seen) {
        seen = true;
        try { sessionStorage.setItem(SEEN, "1"); } catch (e) { }
        showTab();
        setNext(true, false);
        autoClose = setTimeout(function () { setNext(false, next.contains(document.activeElement)); }, 5000);
      }
      if (at === stops[stops.length - 1] && past) at = null;
      if (at === current) return;
      if (at && guide.classList.contains("next-open")) setNext(false, false);
      if (at) {
        sign.href = at.href;
        sign.setAttribute("aria-label", at.name + ": official Campus Recreation page");
        step.textContent = at.step;
        name.textContent = at.name;
        glyph.innerHTML = "<svg viewBox=\"0 0 40 32\" focusable=\"false\">" + (GLYPH[at.kind] ? GLYPH[at.kind]() : "") + "</svg>";
        if (current) {
          sign.classList.remove("swing");
          void sign.offsetWidth;
          sign.classList.add("swing");
        }
      }
      guide.classList.toggle("at-stop", !!at);
      current = at;
    }
    if (stops.length) {
      window.addEventListener("scroll", function () {
        if (!looking) {
          looking = true;
          requestAnimationFrame(look);
        }
      }, { passive: true });
      window.addEventListener("resize", look);
      look();
    }
  }

  function filmStill(seed) {
    const r = rng(seed), W = 320, H = 180;
    let s = "";
    const grid = [];
    for (let j = 0; j <= 4; j++) {
      const row = [];
      for (let i = -1; i <= 9; i++) row.push([(i + (j % 2) * 0.5) * 40 + (r() - 0.5) * 16, j * 32 + (j && j < 4 ? (r() - 0.5) * 12 : 0)]);
      grid.push(row);
    }
    for (let j = 0; j < 4; j++) {
      const top = grid[j], bot = grid[j + 1];
      for (let k = 0; k < top.length - 1; k++) {
        const tris = j % 2 ? [[top[k], bot[k + 1], bot[k]], [top[k], top[k + 1], bot[k + 1]]] : [[top[k], top[k + 1], bot[k]], [bot[k], top[k + 1], bot[k + 1]]];
        tris.forEach(function (t) {
          const cy = (t[0][1] + t[1][1] + t[2][1]) / 3, j2 = (r() - 0.5) * 0.12;
          const sky = mix("#12304d", "#f0c27b", Math.pow(Math.max(cy, 0) / 128, 1.6));
          s += poly(t, j2 > 0 ? mix(sky, "#ffffff", j2) : mix(sky, "#000000", -j2));
        });
      }
    }
    const sun = 60 + r() * 200;
    s += poly(hex(sun, 104, 18, 0.26), "#fbe3a6") + poly(hex(sun, 104, 18, 0.26).slice(0, 4), "#f6cf7e");
    function ridge(base, rise, width, lit, dark) {
      let x = -30;
      while (x < W + 30) {
        const w = width * (0.7 + r() * 0.6), px = x + w * (0.35 + r() * 0.3), py = base - rise * (0.45 + r() * 0.55);
        s += poly([[x, H], [x, base], [px, py], [px, H]], lit) + poly([[px, py], [x + w, base], [x + w, H], [px, H]], dark);
        x += w;
      }
    }
    ridge(126, 54, 74, "#6d8a94", "#4a6877");
    ridge(146, 38, 58, "#4b7a5c", "#2f5a45");
    for (let x = -6; x < W + 10; x += 9 + r() * 8) {
      const h = 18 + r() * 22, w = h * 0.34;
      s += poly([[x - w, H], [x, H - h], [x, H]], "#1c4532") + poly([[x, H - h], [x + w, H], [x, H]], "#10281e");
    }
    const play = hex(160, 84, 21, 0.5);
    play.forEach(function (p, k) {
      const q = play[(k + 1) % 6], a = (k + 0.5) / 6 * 6.2832 + 0.5, l = -(Math.cos(a) + Math.sin(a)) * 0.7071;
      s += poly([[160, 84], p, q], l > 0 ? mix(GT.gold, "#f3e9c2", l * 0.6) : mix(GT.gold, "#4f4528", -l * 0.5));
    });
    s += poly([[153.5, 73.5], [153.5, 94.5], [171.5, 84]], "#ffffff");
    return "<svg viewBox=\"0 0 " + W + " " + H + "\" preserveAspectRatio=\"xMidYMid slice\" aria-hidden=\"true\" focusable=\"false\">" + s + "</svg>";
  }
  document.querySelectorAll("[data-video-slot]").forEach(function (slot, i) {
    if (slot.querySelector("iframe")) return;
    const id = (slot.dataset.youtube || "").trim();
    if (id) {
      const frame = document.createElement("iframe");
      frame.loading = "lazy";
      frame.src = "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(id);
      frame.title = slot.dataset.title || "Video";
      frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
      frame.allowFullscreen = true;
      slot.replaceChildren(frame);
      slot.classList.remove("video-slot");
      return;
    }
    slot.insertAdjacentHTML("afterbegin", filmStill(101 + i * 17));
  });
})();
