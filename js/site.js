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

  // Hero parallax: farther mountain layers sink faster as the page scrolls.
  // Skipped on narrow screens, where the stacked hero would push the scene out of view.
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

  // Stat pictures: small unit charts in the land's low-poly style. Each uses one green ramp, keeps the
  // sun yellow for the single mark that matters, groups its units so they can be counted at a glance, and
  // labels in muted ink. Each piece carries --i, its place in the build-up animation (see .viz in styles.css).
  const INK = { light: "#a9cd86", mid: "#6fa462", dark: "#2f6449", deep: "#245039", accent: "#f2b44f", line: "#cfdacb" };
  function pts(list) { return list.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" "); }
  function shape(list, fill, i, extra) {
    return "<polygon class=\"v\" style=\"--i:" + i + "\" points=\"" + pts(list) + "\" fill=\"" + fill + "\"" + (extra || "") + "/>";
  }
  function label(x, y, text, anchor) { return "<text x=\"" + x + "\" y=\"" + y + "\" text-anchor=\"" + (anchor || "middle") + "\">" + text + "</text>"; }
  // A peak or a tree: a triangle lit on its west half.
  function peak(x, base, w, h, lit, shade, i) {
    return shape([[x - w / 2, base], [x, base - h], [x, base]], lit, i) + shape([[x, base - h], [x + w / 2, base], [x, base]], shade, i);
  }
  const VIZ = {
    // Fifty years as fifty trees, one per year, a taller tree at each decade. Faded trees off the left edge are the "+".
    years: function () {
      let s = "<line x1=\"4\" y1=\"66\" x2=\"196\" y2=\"66\" stroke=\"" + INK.line + "\" stroke-width=\"1\"/>";
      for (let k = 1; k <= 3; k++) s += peak(14 - k * 3.6, 66, 5, 22, INK.light, INK.mid, 0).replace(/class="v"/g, "class=\"v\" opacity=\"" + (0.45 - k * 0.12).toFixed(2) + "\"");
      for (let i = 0; i < 49; i++) {
        const x = 14 + i * 3.6, decade = i % 10 === 0;
        s += peak(x, 66, decade ? 7 : 5, decade ? 44 : 24 + (i * 7 % 5), decade ? INK.dark : INK.light, decade ? INK.deep : INK.mid, i);
      }
      s += peak(190, 66, 8, 50, INK.accent, "#c98a36", 50);
      return s + label(14, 80, "50 yrs ago", "start") + label(196, 80, "today", "end");
    },
    // A hundred trips as a hundred peaks: four blocks of twenty-five, so the count reads as 25 × 4.
    trips: function () {
      let s = "", i = 0;
      for (let block = 0; block < 4; block++) {
        for (let row = 0; row < 5; row++) {
          for (let col = 0; col < 5; col++) {
            const x = 12 + block * 46 + col * 8.2, base = 16 + row * 12.4;
            s += peak(x, base, 7, 9.5, INK.mid, INK.dark, i++);
          }
        }
      }
      return s + "<line x1=\"4\" y1=\"80\" x2=\"196\" y2=\"80\" stroke=\"" + INK.line + "\" stroke-width=\"1\"/>" +
        label(30, 92, "25") + label(76, 92, "50") + label(122, 92, "75") + label(168, 92, "100");
    },
    // The most a standard trip takes: twelve hikers in single file under a bracket.
    group: function () {
      let s = "<path d=\"M14 26 V20 H186 V26\" fill=\"none\" stroke=\"" + INK.line + "\" stroke-width=\"1.2\"/>" + label(100, 14, "max 12 per trip");
      s += "<line x1=\"4\" y1=\"70\" x2=\"196\" y2=\"70\" stroke=\"" + INK.line + "\" stroke-width=\"1\"/>";
      for (let k = 0; k < 12; k++) {
        const x = 21 + k * 14.4;
        s += shape([[x - 5.5, 70], [x, 44], [x, 70]], INK.mid, k * 2) + shape([[x, 44], [x + 5.5, 70], [x, 70]], INK.dark, k * 2);
        s += shape([[x - 3.6, 38], [x, 32], [x + 3.6, 38], [x, 42.5]], INK.deep, k * 2);
      }
      return s + label(21, 84, "1", "middle") + label(179.4, 84, "12", "middle");
    },
    // About a month from sign-up to departure: four weeks on a track, darkening toward the trip.
    month: function () {
      let s = "";
      const steps = [INK.light, "#8cbb70", INK.mid, INK.dark];
      for (let w = 0; w < 4; w++) {
        const x0 = 22 + w * 40, x1 = x0 + 38;
        s += shape([[x0, 44], [x1, 44], [x1, 56], [x0, 56]], steps[w], w * 6);
        s += label((x0 + x1) / 2, 72, "wk " + (w + 1));
      }
      s += shape([[20, 56], [20, 22], [22, 22], [22, 56]], "#10281e", 0) + shape([[22, 22], [36, 27], [22, 32]], INK.accent, 0);
      s += peak(190, 56, 20, 22, INK.accent, "#c98a36", 26) + shape([[187, 56], [190, 44], [193, 56]], "#3a2a1e", 26);
      return s + label(22, 86, "opens", "start") + label(196, 86, "departs", "end");
    },
  };
  document.querySelectorAll("[data-viz]").forEach(function (box) {
    const draw = VIZ[box.dataset.viz];
    if (draw) box.innerHTML = "<svg viewBox=\"0 0 200 96\" focusable=\"false\">" + draw() + "</svg>";
  });

  // Cards and the stat row pop in the first time they scroll into view; stat numbers count up as they do.
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function countUp(stat) {
    const b = stat.querySelector("b");
    const parts = b.textContent.match(/^(\D*)(\d+)(.*)$/);
    if (!parts || still) return;
    const end = Number(parts[2]);
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
    const title = detail.querySelector("h3");
    const text = detail.querySelector("p");
    const prompt = { title: title.textContent, text: text.textContent };
    // Nothing is selected until a bar is chosen; choosing the selected bar again clears it.
    function show(button) {
      const on = button && button.getAttribute("aria-pressed") !== "true";
      buttons.forEach(function (item) {
        item.setAttribute("aria-pressed", on && item === button ? "true" : "false");
      });
      title.textContent = on ? button.dataset.title : prompt.title;
      text.textContent = on ? button.dataset.detail : prompt.text;
    }
    buttons.forEach(function (button) {
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", function () { show(button); });
    });
    requestAnimationFrame(function () { chart.classList.add("ready"); });
  }
})();
