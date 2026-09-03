/* ============================================================================
   ui/dom.js — form primitives.

   Fields render as HTML strings carrying a data-path. One delegated listener
   per section writes straight into the store, so typing never triggers a
   re-render and the caret never jumps. Derived panels refresh separately.
   ========================================================================== */

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const inr = (n) => "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");
export const inrShort = (n) => {
  const v = Math.round(Number(n) || 0), a = Math.abs(v), s = v < 0 ? "−" : "";
  if (a >= 10000000) return `${s}₹${(a / 10000000).toFixed(2).replace(/\.?0+$/, "")} Cr`;
  if (a >= 100000) return `${s}₹${(a / 100000).toFixed(2).replace(/\.?0+$/, "")} L`;
  if (a >= 1000) return `${s}₹${(a / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${s}₹${a}`;
};
export const pct = (n, d = 0) => `${(Number(n) || 0).toFixed(d)}%`;

/* --------------------------------------------------------------- fields */

export function field(o) {
  const { label, path, type = "text", hint, options = [], placeholder = "",
          value = "", min, max, step, wide, id } = o;
  const key = id || path;
  const common = `id="f_${esc(key)}" data-path="${esc(path)}" ${placeholder ? `placeholder="${esc(placeholder)}"` : ""}`;
  let control;

  if (type === "select") {
    control = `<select ${common}>${options.map((op) => {
      const v = typeof op === "string" ? op : op.v;
      const t = typeof op === "string" ? op : op.t;
      return `<option value="${esc(v)}" ${String(value) === String(v) ? "selected" : ""}>${esc(t)}</option>`;
    }).join("")}</select>`;
  } else if (type === "check") {
    return `<div class="field inline"><input type="checkbox" ${common} ${value ? "checked" : ""}>` +
           `<label for="f_${esc(key)}">${esc(label)}</label>` +
           (hint ? `<span class="hint">${hint}</span>` : "") + `</div>`;
  } else if (type === "textarea") {
    control = `<textarea ${common} rows="${o.rows || 3}">${esc(value)}</textarea>`;
  } else if (type === "money") {
    control = `<div class="prefix"><span>₹</span><input type="number" inputmode="decimal" data-money="1" ` +
              `${common} value="${esc(value)}" min="${min ?? 0}" step="${step ?? 1000}"></div>`;
  } else if (type === "pct") {
    control = `<div class="suffix-pc"><input type="number" inputmode="decimal" ${common} ` +
              `value="${esc(value)}" min="${min ?? 0}" max="${max ?? 100}" step="${step ?? 0.1}"></div>`;
  } else {
    const t = type === "number" ? "number" : type === "date" ? "date" : "text";
    control = `<input type="${t}" ${common} value="${esc(value)}" ` +
              `${min != null ? `min="${min}"` : ""} ${max != null ? `max="${max}"` : ""} ${step != null ? `step="${step}"` : ""}>`;
  }
  return `<div class="field${wide ? " wide" : ""}">` +
         `<label for="f_${esc(key)}">${esc(label)}</label>${control}` +
         (hint ? `<span class="hint">${hint}</span>` : "") + `</div>`;
}

/** Bind one delegated listener that writes every field in `root` to the store. */
export function bindFields(root, store, onChange) {
  const handler = (e) => {
    const t = e.target;
    const path = t.dataset && t.dataset.path;
    if (!path) return;
    let v;
    if (t.type === "checkbox") v = t.checked;
    else if (t.type === "number") v = t.value === "" ? "" : Number(t.value);
    else v = t.value;
    store.set(path, v);
    if (onChange) onChange(path, v);
  };
  root.addEventListener("input", handler);
  root.addEventListener("change", handler);
  return () => { root.removeEventListener("input", handler); root.removeEventListener("change", handler); };
}

/* ---------------------------------------------------------------- blocks */

export const card = (title, body, opts = {}) =>
  `<section class="card${opts.hard ? " card--hard" : ""}"${opts.id ? ` id="${opts.id}"` : ""}>` +
  (title ? `<header><div class="grow"><${opts.h || "h2"}>${title}</${opts.h || "h2"}>` +
    (opts.sub ? `<p>${opts.sub}</p>` : "") + `</div>${opts.aside || ""}</header>` : "") +
  body + `</section>`;

export const stat = (k, v, d, opts = {}) =>
  `<div class="stat${opts.neg ? " stat--neg" : ""}"><div class="k">${k}</div>` +
  `<div class="v">${v}</div>${d ? `<div class="d">${d}</div>` : ""}</div>`;

export const statRow = (items, n) =>
  `<div class="stats s${n || items.length}">${items.join("")}</div>`;

export const note = (title, body, opts = {}) =>
  `<div class="note${opts.dashed ? " dashed" : ""}">${title ? `<h4>${title}</h4>` : ""}${body}</div>`;

export const meter = (label, value, max, opts = {}) => {
  const f = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return `<div class="meter"><div class="mrow"><b>${label}</b>` +
    `<span class="num">${opts.right ?? `${(f * 100).toFixed(0)}%`}</span></div>` +
    `<div class="track"><div class="fill${opts.hatch ? " hatch" : ""}" style="width:${(f * 100).toFixed(1)}%"></div>` +
    (opts.tick != null && max > 0 ? `<div class="tickmark" style="left:${Math.min(100, (opts.tick / max) * 100).toFixed(1)}%"></div>` : "") +
    `</div>${opts.sub ? `<div class="tiny muted" style="margin-top:3px">${opts.sub}</div>` : ""}</div>`;
};

export const chip = (text, opts = {}) =>
  `<span class="chip${opts.solid ? " chip--solid" : ""}${opts.dash ? " chip--dash" : ""}">${text}</span>`;

export const empty = (text) => `<div class="empty">${text}</div>`;

export const acc = (summary, body, open = false) =>
  `<details class="acc"${open ? " open" : ""}><summary>${summary}</summary><div class="accbody">${body}</div></details>`;

export const table = (headers, rows, opts = {}) =>
  `<div class="tablewrap"><table>` +
  `<thead><tr>${headers.map((h) => typeof h === "string"
    ? `<th>${h}</th>` : `<th class="${h.n ? "n" : ""}">${h.t}</th>`).join("")}</tr></thead>` +
  `<tbody>${rows.map((r) => `<tr${r.cls ? ` class="${r.cls}"` : ""}>${(r.cells || r).map((c) =>
    typeof c === "string" || typeof c === "number"
      ? `<td>${c}</td>` : `<td class="${c.n ? "n" : ""}"${c.span ? ` colspan="${c.span}"` : ""}>${c.t}</td>`
  ).join("")}</tr>`).join("")}</tbody>` +
  (opts.foot ? `<tfoot><tr>${opts.foot.map((c) => typeof c === "string"
    ? `<td>${c}</td>` : `<td class="${c.n ? "n" : ""}">${c.t}</td>`).join("")}</tr></tfoot>` : "") +
  `</table></div>`;

export const flag = (sev, title, body, why) =>
  `<div class="flag"><div class="sev" data-sev="${sev}" title="${sev === "high" ? "High priority" : sev === "med" ? "Medium" : "Low"}">` +
  `${sev === "high" ? "!" : sev === "med" ? "•" : "·"}</div>` +
  `<div class="fb"><h4>${title}</h4><p>${body}</p>${why ? `<div class="why">${why}</div>` : ""}</div></div>`;

/* ---------------------------------------------------------------- misc */

export function toast(msg) {
  let t = document.getElementById("toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status");
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("on");
  clearTimeout(t._x);
  t._x = setTimeout(() => t.classList.remove("on"), 2400);
}

export function download(filename, text, mime = "application/json") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
}

export function confirmBox(message, onYes) {
  const wrap = document.createElement("div");
  wrap.className = "modal";
  wrap.innerHTML = `<div class="box"><h3 style="margin-bottom:10px">${message}</h3>` +
    `<div class="btnrow" style="justify-content:flex-end;margin-top:18px">` +
    `<button class="btn btn--quiet" data-no>Cancel</button>` +
    `<button class="btn btn--solid" data-yes>Confirm</button></div></div>`;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.addEventListener("click", (e) => {
    if (e.target === wrap || e.target.hasAttribute("data-no")) close();
    if (e.target.hasAttribute("data-yes")) { close(); onYes(); }
  });
}

/** Sum a set of dotted paths on an object. */
export const sumPaths = (obj, paths) =>
  paths.reduce((s, p) => s + (Number(p.split(".").reduce((n, k) => n?.[k], obj)) || 0), 0);
