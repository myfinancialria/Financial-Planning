/* ============================================================================
   charts.js — interactive SVG charts, zero dependencies, monochrome only.

   Series are separated by a six-step neutral tone ramp AND by hatch pattern,
   so nothing depends on hue and everything survives a greyscale print.
   Every chart shares one tooltip element and supports keyboard focus.
   ========================================================================== */

const NS = "http://www.w3.org/2000/svg";
const TONES = ["--t1","--t2","--t3","--t4","--t5","--t6"];
const HATCH = ["solid","diag","diag-r","dots","horiz","cross"];

let tipEl = null;
function tip() {
  if (!tipEl) {
    tipEl = document.createElement("div");
    tipEl.className = "tip";
    tipEl.setAttribute("role", "status");
    document.body.appendChild(tipEl);
  }
  return tipEl;
}
export function showTip(html, evt) {
  const t = tip();
  t.innerHTML = html;
  t.classList.add("on");
  const pad = 14;
  const r = t.getBoundingClientRect();
  let x = evt.clientX + pad, y = evt.clientY + pad;
  if (x + r.width > window.innerWidth - 8) x = evt.clientX - r.width - pad;
  if (y + r.height > window.innerHeight - 8) y = evt.clientY - r.height - pad;
  t.style.left = Math.max(8, x) + "px";
  t.style.top = Math.max(8, y) + "px";
}
export function hideTip() { if (tipEl) tipEl.classList.remove("on"); }

/* ------------------------------------------------------------- utilities */

const el = (name, attrs = {}, parent) => {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue;
    n.setAttribute(k, v);
  }
  if (parent) parent.appendChild(n);
  return n;
};
const tone = (i) => `var(${TONES[i % TONES.length]})`;

export const fmtINR = (n, compact = true) => {
  const v = Math.round(Number(n) || 0);
  const a = Math.abs(v);
  const s = v < 0 ? "−" : "";
  if (!compact) return s + "₹" + a.toLocaleString("en-IN");
  if (a >= 10000000) return s + "₹" + (a / 10000000).toFixed(a >= 100000000 ? 0 : 2).replace(/\.00$/, "") + " Cr";
  if (a >= 100000)   return s + "₹" + (a / 100000).toFixed(a >= 10000000 ? 0 : 2).replace(/\.00$/, "") + " L";
  if (a >= 1000)     return s + "₹" + (a / 1000).toFixed(a >= 100000 ? 0 : 1).replace(/\.0$/, "") + "k";
  return s + "₹" + a.toLocaleString("en-IN");
};
export const fmtPct = (n, d = 0) => (Number(n) || 0).toFixed(d) + "%";

function defs(svg) {
  const d = el("defs", {}, svg);
  HATCH.forEach((h, i) => {
    if (h === "solid") return;
    const p = el("pattern", { id: `hx-${h}`, width: 6, height: 6,
      patternUnits: "userSpaceOnUse", patternTransform: h === "diag-r" ? "rotate(-45)" : h === "diag" ? "rotate(45)" : "" }, d);
    el("rect", { width: 6, height: 6, fill: "var(--paper)" }, p);
    if (h === "dots") el("circle", { cx: 3, cy: 3, r: 1.3, fill: "currentColor" }, p);
    else if (h === "cross") {
      el("path", { d: "M0 3h6M3 0v6", stroke: "currentColor", "stroke-width": 1 }, p);
    } else el("path", { d: "M0 0v6", stroke: "currentColor", "stroke-width": 2.4 }, p);
  });
  return d;
}
const fillFor = (i, useHatch) => {
  const h = HATCH[i % HATCH.length];
  return (useHatch && h !== "solid") ? `url(#hx-${h})` : tone(i);
};

function frame(container, { width = 640, height = 300, pad = {} } = {}) {
  container.innerHTML = "";
  const p = { t: 18, r: 18, b: 34, l: 56, ...pad };
  const svg = el("svg", {
    class: "chart", viewBox: `0 0 ${width} ${height}`,
    preserveAspectRatio: "xMidYMid meet", role: "img",
  }, container);
  defs(svg);
  return { svg, p, w: width - p.l - p.r, h: height - p.t - p.b, width, height };
}

function niceTicks(max, count = 5) {
  if (max <= 0) return [0];
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const out = [];
  for (let v = 0; v <= max + step * 0.001; v += step) out.push(v);
  return out;
}

function legend(container, items, onToggle) {
  const box = document.createElement("div");
  box.className = "legend";
  items.forEach((it, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "li";
    b.style.cssText = "background:none;border:0;padding:0;font:inherit;cursor:pointer";
    b.innerHTML = `<span class="sw" style="color:${tone(it.toneIndex ?? i)};background:${fillFor(it.toneIndex ?? i, it.hatch)}"></span>` +
      `<span>${it.label}</span>${it.value != null ? `<span class="val">${it.value}</span>` : ""}`;
    if (onToggle) b.addEventListener("click", () => {
      const off = b.dataset.off === "1";
      b.dataset.off = off ? "0" : "1";
      onToggle(i, !off);
    });
    else b.style.cursor = "default";
    box.appendChild(b);
  });
  container.appendChild(box);
  return box;
}

function interactive(node, html) {
  node.classList.add("mark");
  node.setAttribute("tabindex", "0");
  node.addEventListener("mousemove", (e) => showTip(html, e));
  node.addEventListener("mouseleave", hideTip);
  node.addEventListener("focus", (e) => {
    const r = node.getBoundingClientRect();
    showTip(html, { clientX: r.left + r.width / 2, clientY: r.top });
  });
  node.addEventListener("blur", hideTip);
}

/* ------------------------------------------------------------------ donut */

export function donut(container, data, opts = {}) {
  const { size = 260, thickness = 46, centerLabel = "", centerValue = "", fmt = fmtINR } = opts;
  container.innerHTML = "";
  const wrap = document.createElement("div");
  container.appendChild(wrap);
  const rows = data.filter((d) => Math.abs(d.value) > 0);
  const total = rows.reduce((s, d) => s + Math.abs(d.value), 0);

  const svg = el("svg", { class: "chart", viewBox: `0 0 ${size} ${size}`,
    style: `max-width:${size}px;margin:0 auto`, role: "img" }, wrap);
  defs(svg);
  const cx = size / 2, cy = size / 2, R = size / 2 - 6, r = R - thickness;

  if (total === 0) {
    el("circle", { cx, cy, r: (R + r) / 2, fill: "none",
      stroke: "var(--rule)", "stroke-width": thickness }, svg);
  }

  let a0 = -Math.PI / 2;
  rows.forEach((d, i) => {
    const frac = Math.abs(d.value) / total;
    const a1 = a0 + frac * Math.PI * 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const P = (ang, rad) => [cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad];
    const [x0, y0] = P(a0, R), [x1, y1] = P(a1, R);
    const [x2, y2] = P(a1, r), [x3, y3] = P(a0, r);
    const path = el("path", {
      d: `M${x0} ${y0} A${R} ${R} 0 ${large} 1 ${x1} ${y1} L${x2} ${y2} A${r} ${r} 0 ${large} 0 ${x3} ${y3} Z`,
      fill: fillFor(i, true), stroke: "var(--paper)", "stroke-width": 1.5,
      style: `color:${tone(i)}`,
    }, svg);
    interactive(path, `<div class="t">${d.label}</div><div class="r"><span>Value</span><span>${fmt(d.value)}</span></div><div class="r"><span>Share</span><span>${fmtPct(frac * 100, 1)}</span></div>`);
    a0 = a1;
  });

  if (centerValue !== "") {
    el("text", { x: cx, y: cy - 4, "text-anchor": "middle",
      style: "font-size:19px;font-weight:600;fill:var(--ink);font-family:var(--font-num)" }, svg)
      .textContent = centerValue;
    el("text", { x: cx, y: cy + 15, "text-anchor": "middle", class: "lbl" }, svg)
      .textContent = centerLabel;
  }

  legend(wrap, rows.map((d, i) => ({
    label: d.label, hatch: true, toneIndex: i,
    value: total ? fmtPct((Math.abs(d.value) / total) * 100, 0) : "",
  })));
  return wrap;
}

/* --------------------------------------------------------------- bar chart */

/**
 * Horizontal bars. `data` = [{label, value, note}]. Optional `target` per row
 * renders a tick mark, which is how the allocation drift chart reads.
 */
export function barsH(container, data, opts = {}) {
  const { fmt = fmtINR, width = 640, rowH = 30, showTarget = false, maxOverride = null } = opts;
  const height = Math.max(90, data.length * rowH + 44);
  const labelW = opts.labelW || 148;
  const { svg, p, w, h } = frame(container, { width, height, pad: { l: labelW, r: 76, t: 10, b: 30 } });
  const max = maxOverride ?? Math.max(1, ...data.map((d) => Math.max(d.value, d.target || 0)));
  const ticks = niceTicks(max, 4);
  const X = (v) => p.l + (v / max) * w;

  const g = el("g", { class: "grid" }, svg);
  ticks.forEach((t) => {
    el("line", { x1: X(t), x2: X(t), y1: p.t, y2: p.t + h }, g);
    el("text", { x: X(t), y: p.t + h + 18, "text-anchor": "middle", class: "lbl" }, svg)
      .textContent = opts.tickFmt ? opts.tickFmt(t) : fmt(t);
  });

  data.forEach((d, i) => {
    const y = p.t + i * rowH + 4;
    const bh = rowH - 12;
    el("text", { x: p.l - 10, y: y + bh / 2 + 4, "text-anchor": "end", class: "lbl",
      style: "fill:var(--ink-2)" }, svg).textContent = d.label;
    el("rect", { x: p.l, y, width: w, height: bh, fill: "var(--paper-3)" }, svg);
    const bar = el("rect", { x: p.l, y, width: Math.max(0, X(d.value) - p.l), height: bh,
      fill: fillFor(d.toneIndex ?? 0, !!d.hatch), style: `color:${tone(d.toneIndex ?? 0)}` }, svg);
    interactive(bar, `<div class="t">${d.label}</div><div class="r"><span>${opts.valueLabel || "Value"}</span><span>${fmt(d.value)}</span></div>` +
      (d.target != null ? `<div class="r"><span>Target</span><span>${fmt(d.target)}</span></div>` : "") +
      (d.note ? `<div class="tiny" style="margin-top:4px;opacity:.8">${d.note}</div>` : ""));
    if (showTarget && d.target != null) {
      el("line", { x1: X(d.target), x2: X(d.target), y1: y - 3, y2: y + bh + 3,
        stroke: "var(--ink)", "stroke-width": 2, "stroke-dasharray": "3 2" }, svg);
    }
    el("text", { x: X(d.value) + 8, y: y + bh / 2 + 4, class: "vlbl" }, svg)
      .textContent = opts.rowFmt ? opts.rowFmt(d) : fmt(d.value);
  });
  return svg;
}

/* -------------------------------------------------------- grouped columns */

export function columns(container, groups, series, opts = {}) {
  const { fmt = fmtINR, width = 640, height = 300 } = opts;
  const { svg, p, w, h } = frame(container, { width, height, pad: { l: 62, r: 14, t: 14, b: 46 } });
  const hidden = new Set();

  const draw = () => {
    [...svg.querySelectorAll("g.plot")].forEach((n) => n.remove());
    const plot = el("g", { class: "plot" }, svg);
    const vis = series.map((s, i) => ({ ...s, i })).filter((s) => !hidden.has(s.i));
    const max = Math.max(1, ...vis.flatMap((s) => s.values));
    const ticks = niceTicks(max, 5);
    const Y = (v) => p.t + h - (v / max) * h;

    const gg = el("g", { class: "grid" }, plot);
    ticks.forEach((t) => {
      el("line", { x1: p.l, x2: p.l + w, y1: Y(t), y2: Y(t) }, gg);
      el("text", { x: p.l - 8, y: Y(t) + 4, "text-anchor": "end", class: "lbl" }, plot)
        .textContent = opts.tickFmt ? opts.tickFmt(t) : fmt(t);
    });

    const gw = w / groups.length;
    const bw = Math.min(46, (gw * 0.72) / Math.max(1, vis.length));
    groups.forEach((gname, gi) => {
      const cx = p.l + gw * gi + gw / 2;
      const start = cx - (bw * vis.length) / 2;
      vis.forEach((s, si) => {
        const v = s.values[gi] || 0;
        const x = start + si * bw;
        const bar = el("rect", { x, y: Y(v), width: bw - 3, height: Math.max(0, p.t + h - Y(v)),
          fill: fillFor(s.i, true), style: `color:${tone(s.i)}` }, plot);
        interactive(bar, `<div class="t">${gname}</div><div class="r"><span>${s.label}</span><span>${fmt(v)}</span></div>`);
        if (opts.valueLabels !== false && v > 0)
          el("text", { x: x + (bw - 3) / 2, y: Y(v) - 5, "text-anchor": "middle", class: "vlbl" }, plot)
            .textContent = fmt(v);
      });
      el("text", { x: cx, y: p.t + h + 20, "text-anchor": "middle", class: "lbl",
        style: "fill:var(--ink-2)" }, plot).textContent = gname;
    });
    el("line", { x1: p.l, x2: p.l + w, y1: p.t + h, y2: p.t + h, class: "zero" }, plot);
  };

  draw();
  legend(container, series.map((s, i) => ({ label: s.label, hatch: true, toneIndex: i })),
    (i, off) => { off ? hidden.add(i) : hidden.delete(i); draw(); });
  return svg;
}

/* ---------------------------------------------------------- stacked bars */

export function stackedH(container, rows, series, opts = {}) {
  const { fmt = fmtINR, width = 640, rowH = 34, labelW = 150 } = opts;
  const height = rows.length * rowH + 40;
  const { svg, p, w, h } = frame(container, { width, height, pad: { l: labelW, r: 70, t: 8, b: 28 } });
  const totals = rows.map((r) => series.reduce((s, k) => s + Math.abs(r.values[k.key] || 0), 0));
  const max = Math.max(1, ...totals);

  rows.forEach((r, i) => {
    const y = p.t + i * rowH + 5;
    const bh = rowH - 14;
    el("text", { x: p.l - 10, y: y + bh / 2 + 4, "text-anchor": "end", class: "lbl",
      style: "fill:var(--ink-2)" }, svg).textContent = r.label;
    let x = p.l;
    series.forEach((s, si) => {
      const v = Math.abs(r.values[s.key] || 0);
      if (!v) return;
      const bw = (v / max) * w;
      const seg = el("rect", { x, y, width: bw, height: bh, fill: fillFor(si, true),
        stroke: "var(--paper)", "stroke-width": 0.75, style: `color:${tone(si)}` }, svg);
      interactive(seg, `<div class="t">${r.label}</div><div class="r"><span>${s.label}</span><span>${fmt(v)}</span></div><div class="r"><span>Share</span><span>${fmtPct(v / totals[i] * 100, 0)}</span></div>`);
      x += bw;
    });
    el("text", { x: x + 8, y: y + bh / 2 + 4, class: "vlbl" }, svg).textContent = fmt(totals[i]);
  });
  legend(container, series.map((s, i) => ({ label: s.label, hatch: true, toneIndex: i })));
  return svg;
}

/* ------------------------------------------------------------- waterfall */

export function waterfall(container, steps, opts = {}) {
  const { fmt = fmtINR, width = 700, height = 320 } = opts;
  const { svg, p, w, h } = frame(container, { width, height, pad: { l: 62, r: 14, t: 20, b: 62 } });
  let run = 0;
  const bars = steps.map((s) => {
    if (s.kind === "start") { run = s.value; return { ...s, from: 0, to: s.value }; }
    if (s.kind === "end")   return { ...s, from: 0, to: s.value };
    const from = run; run += s.value;
    return { ...s, from, to: run };
  });
  const max = Math.max(...bars.map((b) => Math.max(b.from, b.to)), 1);
  const min = Math.min(...bars.map((b) => Math.min(b.from, b.to)), 0);
  const span = max - min || 1;
  const Y = (v) => p.t + h - ((v - min) / span) * h;

  const gg = el("g", { class: "grid" }, svg);
  niceTicks(max, 4).forEach((t) => {
    el("line", { x1: p.l, x2: p.l + w, y1: Y(t), y2: Y(t) }, gg);
    el("text", { x: p.l - 8, y: Y(t) + 4, "text-anchor": "end", class: "lbl" }, svg).textContent = fmt(t);
  });
  el("line", { x1: p.l, x2: p.l + w, y1: Y(0), y2: Y(0), class: "zero" }, svg);

  const gw = w / bars.length, bw = Math.min(58, gw * 0.6);
  bars.forEach((b, i) => {
    const cx = p.l + gw * i + gw / 2;
    const y0 = Y(Math.max(b.from, b.to)), y1 = Y(Math.min(b.from, b.to));
    const isTerminal = b.kind === "start" || b.kind === "end";
    const rect = el("rect", {
      x: cx - bw / 2, y: y0, width: bw, height: Math.max(2, y1 - y0),
      fill: isTerminal ? "var(--t1)" : (b.value < 0 ? "url(#hx-diag)" : "var(--t4)"),
      stroke: "var(--ink)", "stroke-width": isTerminal ? 0 : 1,
      style: "color:var(--t3)",
    }, svg);
    interactive(rect, `<div class="t">${b.label}</div><div class="r"><span>${b.kind === "out" ? "Outgo" : "Amount"}</span><span>${fmt(Math.abs(b.value))}</span></div>` +
      (!isTerminal ? `<div class="r"><span>Running</span><span>${fmt(b.to)}</span></div>` : ""));
    if (i < bars.length - 1 && !isTerminal)
      el("line", { x1: cx + bw / 2, x2: p.l + gw * (i + 1) + gw / 2 - bw / 2,
        y1: Y(b.to), y2: Y(b.to), stroke: "var(--ink-4)", "stroke-width": 1, "stroke-dasharray": "2 2" }, svg);
    el("text", { x: cx, y: y0 - 6, "text-anchor": "middle", class: "vlbl" }, svg)
      .textContent = fmt(Math.abs(b.value));
    const t = el("text", { x: cx, y: p.t + h + 18, "text-anchor": "middle", class: "lbl" }, svg);
    const words = b.label.split(" ");
    if (words.length > 1 && b.label.length > 11) {
      el("tspan", { x: cx, dy: 0 }, t).textContent = words.slice(0, Math.ceil(words.length / 2)).join(" ");
      el("tspan", { x: cx, dy: 12 }, t).textContent = words.slice(Math.ceil(words.length / 2)).join(" ");
    } else t.textContent = b.label;
  });
  return svg;
}

/* ------------------------------------------------------------ line / area */

export function lines(container, xs, series, opts = {}) {
  const { fmt = fmtINR, width = 700, height = 300, xFmt = (v) => v, area = false, markers = [] } = opts;
  const { svg, p, w, h } = frame(container, { width, height, pad: { l: 62, r: 16, t: 16, b: 40 } });
  const hidden = new Set();

  const draw = () => {
    [...svg.querySelectorAll("g.plot")].forEach((n) => n.remove());
    const plot = el("g", { class: "plot" }, svg);
    const vis = series.map((s, i) => ({ ...s, i })).filter((s) => !hidden.has(s.i));
    const max = Math.max(1, ...vis.flatMap((s) => s.values));
    const X = (i) => p.l + (xs.length > 1 ? (i / (xs.length - 1)) * w : w / 2);
    const Y = (v) => p.t + h - (v / max) * h;

    const gg = el("g", { class: "grid" }, plot);
    niceTicks(max, 5).forEach((t) => {
      el("line", { x1: p.l, x2: p.l + w, y1: Y(t), y2: Y(t) }, gg);
      el("text", { x: p.l - 8, y: Y(t) + 4, "text-anchor": "end", class: "lbl" }, plot).textContent = fmt(t);
    });
    const step = Math.max(1, Math.ceil(xs.length / 9));
    const last = xs.length - 1;
    xs.forEach((x, i) => {
      // Draw every `step`-th label plus the final one — unless the final one
      // would land on top of the previous label.
      const stepped = i % step === 0;
      const isLast = i === last;
      if (!stepped && !isLast) return;
      if (isLast && !stepped && last % step > step / 2 === false && last - Math.floor(last / step) * step < step * 0.55) return;
      el("text", { x: X(i), y: p.t + h + 18, "text-anchor": "middle", class: "lbl" }, plot)
        .textContent = xFmt(x);
    });

    for (const m of markers) {
      const i = xs.indexOf(m.x);
      if (i < 0) continue;
      el("line", { x1: X(i), x2: X(i), y1: p.t, y2: p.t + h,
        stroke: "var(--ink-4)", "stroke-width": 1, "stroke-dasharray": "3 3" }, plot);
      el("text", { x: X(i) + 4, y: p.t + 11, class: "lbl", style: "fill:var(--ink-3)" }, plot)
        .textContent = m.label;
    }

    vis.forEach((s) => {
      const d = s.values.map((v, i) => `${i ? "L" : "M"}${X(i)} ${Y(v)}`).join(" ");
      if (area) el("path", { d: `${d} L${X(s.values.length - 1)} ${Y(0)} L${X(0)} ${Y(0)} Z`,
        fill: fillFor(s.i, true), opacity: 0.5, style: `color:${tone(s.i)}` }, plot);
      el("path", { d, class: s.dashed ? "stroke-2" : "stroke",
        style: s.dashed ? "" : `stroke:${tone(s.i)}` }, plot);
      s.values.forEach((v, i) => {
        const c = el("circle", { cx: X(i), cy: Y(v), r: 9, fill: "transparent" }, plot);
        interactive(c, `<div class="t">${xFmt(xs[i])}</div>` +
          vis.map((ss) => `<div class="r"><span>${ss.label}</span><span>${fmt(ss.values[i])}</span></div>`).join(""));
        if (xs.length <= 26)
          el("circle", { cx: X(i), cy: Y(v), r: 2.6, fill: "var(--paper)",
            stroke: tone(s.i), "stroke-width": 1.5 }, plot);
      });
    });
  };
  draw();
  if (series.length > 1)
    legend(container, series.map((s, i) => ({ label: s.label, toneIndex: i })),
      (i, off) => { off ? hidden.add(i) : hidden.delete(i); draw(); });
  return svg;
}

/* --------------------------------------------------------------- step tax */

/** The slab staircase — shows exactly which rupees are taxed at which rate. */
export function slabStep(container, rows, opts = {}) {
  const { width = 700, height = 260 } = opts;
  const { svg, p, w, h } = frame(container, { width, height, pad: { l: 46, r: 16, t: 18, b: 44 } });
  const total = rows.reduce((s, r) => s + r.amount, 0) || 1;
  let x = p.l;
  const maxRate = Math.max(0.3, ...rows.map((r) => r.rate));

  rows.forEach((r, i) => {
    const bw = (r.amount / total) * w;
    const bh = (r.rate / maxRate) * h;
    const y = p.t + h - bh;
    const rect = el("rect", { x, y, width: Math.max(1, bw - 1), height: Math.max(1, bh),
      fill: fillFor(i, true), style: `color:${tone(i)}`, stroke: "var(--ink)", "stroke-width": 0.75 }, svg);
    interactive(rect, `<div class="t">${fmtPct(r.rate * 100)} band</div>` +
      `<div class="r"><span>Income here</span><span>${fmtINR(r.amount)}</span></div>` +
      `<div class="r"><span>Tax</span><span>${fmtINR(r.tax)}</span></div>` +
      `<div class="tiny" style="margin-top:4px;opacity:.8">${fmtINR(r.from, false)} to ${r.to ? fmtINR(r.to, false) : "above"}</div>`);
    if (bw > 34) {
      el("text", { x: x + bw / 2, y: y - 6, "text-anchor": "middle", class: "vlbl" }, svg)
        .textContent = fmtPct(r.rate * 100);
      el("text", { x: x + bw / 2, y: p.t + h + 17, "text-anchor": "middle", class: "lbl" }, svg)
        .textContent = fmtINR(r.amount);
    }
    x += bw;
  });
  el("line", { x1: p.l, x2: p.l + w, y1: p.t + h, y2: p.t + h, class: "zero" }, svg);
  el("text", { x: p.l, y: p.t + h + 36, class: "lbl" }, svg).textContent = "Bar width = income in the band · height = rate";
  return svg;
}

/* ------------------------------------------------------------------ gauge */

export function gauge(container, value, opts = {}) {
  const { max = 100, size = 200, label = "", sub = "" } = opts;
  container.innerHTML = "";
  const svg = el("svg", { class: "chart", viewBox: `0 0 ${size} ${size * 0.66}`,
    style: `max-width:${size}px`, role: "img" }, container);
  const cx = size / 2, cy = size * 0.56, R = size * 0.42, sw = size * 0.1;
  const A = (f) => Math.PI * (1 + f);
  const P = (f, rad) => [cx + Math.cos(A(f)) * rad, cy + Math.sin(A(f)) * rad];
  const arc = (f0, f1, stroke, dash) => {
    const [x0, y0] = P(f0, R), [x1, y1] = P(f1, R);
    return el("path", { d: `M${x0} ${y0} A${R} ${R} 0 ${f1 - f0 > 0.5 ? 1 : 0} 1 ${x1} ${y1}`,
      fill: "none", stroke, "stroke-width": sw, "stroke-linecap": "butt",
      "stroke-dasharray": dash || "" }, svg);
  };
  arc(0, 1, "var(--paper-3)");
  [0.4, 0.6, 0.8].forEach((t) => {
    const [x0, y0] = P(t, R - sw / 2 - 1), [x1, y1] = P(t, R + sw / 2 + 1);
    el("line", { x1: x0, y1: y0, x2: x1, y2: y1, stroke: "var(--rule-2)", "stroke-width": 1 }, svg);
  });
  const f = Math.max(0, Math.min(1, value / max));
  if (f > 0) arc(0, f, "var(--ink)");
  el("text", { x: cx, y: cy - 6, "text-anchor": "middle",
    style: "font-size:30px;font-weight:600;fill:var(--ink);font-family:var(--font-num)" }, svg)
    .textContent = Math.round(value);
  el("text", { x: cx, y: cy + 12, "text-anchor": "middle", class: "lbl" }, svg).textContent = label;
  if (sub) el("text", { x: cx, y: cy + 26, "text-anchor": "middle", class: "lbl",
    style: "font-size:9.5px" }, svg).textContent = sub;
  return svg;
}

/* --------------------------------------------------------------- timeline */

/** Goals on a horizontal time axis, bar length = funded share. */
export function timeline(container, goals, opts = {}) {
  const { width = 700, rowH = 40, thisYear = new Date().getFullYear() } = opts;
  const rows = goals.filter((g) => g.futureCost > 0);
  if (!rows.length) { container.innerHTML = `<div class="empty">No goals recorded yet.</div>`; return; }
  const height = rows.length * rowH + 52;
  const { svg, p, w, h } = frame(container, { width, height, pad: { l: 152, r: 92, t: 24, b: 30 } });
  const maxYear = Math.max(...rows.map((g) => g.targetYear), thisYear + 1);
  const X = (y) => p.l + ((y - thisYear) / Math.max(1, maxYear - thisYear)) * w;

  const gg = el("g", { class: "grid" }, svg);
  const stepY = Math.max(1, Math.ceil((maxYear - thisYear) / 8));
  for (let y = thisYear; y <= maxYear; y += stepY) {
    el("line", { x1: X(y), x2: X(y), y1: p.t - 6, y2: p.t + h }, gg);
    el("text", { x: X(y), y: p.t - 11, "text-anchor": "middle", class: "lbl" }, svg).textContent = y;
  }

  rows.forEach((g, i) => {
    const y = p.t + i * rowH + 6;
    const bh = rowH - 18;
    el("text", { x: p.l - 10, y: y + bh / 2 + 4, "text-anchor": "end", class: "lbl",
      style: "fill:var(--ink-2)" }, svg).textContent =
      g.name.length > 22 ? g.name.slice(0, 21) + "…" : g.name;
    const x1 = X(g.targetYear);
    el("line", { x1: p.l, x2: x1, y1: y + bh / 2, y2: y + bh / 2,
      stroke: "var(--rule-2)", "stroke-width": 1, "stroke-dasharray": "2 3" }, svg);
    const track = el("rect", { x: p.l, y, width: Math.max(2, x1 - p.l), height: bh,
      fill: "var(--paper-3)", stroke: "var(--rule)", "stroke-width": 1 }, svg);
    const fw = Math.max(0, (x1 - p.l) * Math.min(1, g.fundedPct / 100));
    const fill = el("rect", { x: p.l, y, width: fw, height: bh,
      fill: g.status === "on track" ? "var(--t1)" : "url(#hx-diag)", style: "color:var(--t2)" }, svg);
    const html = `<div class="t">${g.name}</div>` +
      `<div class="r"><span>Target year</span><span>${g.targetYear} · ${g.years}y</span></div>` +
      `<div class="r"><span>Cost then</span><span>${fmtINR(g.futureCost)}</span></div>` +
      `<div class="r"><span>Projected</span><span>${fmtINR(g.projected)}</span></div>` +
      `<div class="r"><span>Funded</span><span>${g.fundedPct.toFixed(0)}%</span></div>` +
      `<div class="r"><span>Needs</span><span>${fmtINR(g.requiredSip)}/mo</span></div>`;
    interactive(track, html); interactive(fill, html);
    el("circle", { cx: x1, cy: y + bh / 2, r: 4, fill: "var(--paper)",
      stroke: "var(--ink)", "stroke-width": 1.6 }, svg);
    el("text", { x: x1 + 10, y: y + bh / 2 + 4, class: "vlbl" }, svg)
      .textContent = `${g.fundedPct.toFixed(0)}%`;
  });
  return svg;
}

export { legend, tone, fillFor };
