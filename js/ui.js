/* パとるロール — UI primitives (P2) */
/* UI.toast / sheet / overlay / countUp / scoreRing / confettiBurst / timeAgo / statusBadge */
(function () {

  /* ── small helpers ───────────────────────────────── */
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  const prefersReduced = () =>
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── toast ───────────────────────────────────────── */
  let toastWrap = null;
  function toast(msg, opts) {
    opts = opts || {};
    if (!toastWrap) {
      toastWrap = el("div", "ui-toast-wrap");
      document.body.appendChild(toastWrap);
    }
    const t = el("div", "ui-toast");
    if (opts.icon) t.appendChild(el("span", "ui-toast-ico", opts.icon));
    t.appendChild(el("span", null, msg));
    toastWrap.appendChild(t);
    // entrance
    requestAnimationFrame(() => t.classList.add("in"));
    const ms = opts.ms || 2600;
    setTimeout(() => {
      t.classList.remove("in");
      t.classList.add("out");
      setTimeout(() => t.remove(), 260);
    }, ms);
    return t;
  }

  /* ── bottom sheet ────────────────────────────────── */
  function sheet(cfg) {
    cfg = cfg || {};
    const root = document.getElementById("sheet-root") || document.body;
    const back = el("div", "ui-sheet-back");
    const panel = el("div", "ui-sheet");

    const head = el("div", "ui-sheet-head");
    head.appendChild(el("div", "ui-sheet-grip"));
    if (cfg.title) head.appendChild(el("div", "ui-sheet-title", cfg.title));
    const closeBtn = el("button", "ui-sheet-x", "✕");
    closeBtn.setAttribute("aria-label", "閉じる");
    head.appendChild(closeBtn);
    panel.appendChild(head);

    const body = el("div", "ui-sheet-body");
    if (cfg.bodyEl) body.appendChild(cfg.bodyEl);
    else if (cfg.html != null) body.innerHTML = cfg.html;
    panel.appendChild(body);

    back.appendChild(panel);
    root.appendChild(back);

    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      back.classList.remove("in");
      panel.classList.remove("in");
      setTimeout(() => {
        back.remove();
        if (typeof cfg.onClose === "function") cfg.onClose();
      }, 240);
    }

    closeBtn.addEventListener("click", close);
    back.addEventListener("click", e => { if (e.target === back) close(); });

    requestAnimationFrame(() => {
      back.classList.add("in");
      panel.classList.add("in");
    });

    return { close, panel, body };
  }

  /* ── full-screen overlay ─────────────────────────── */
  function overlay(contentEl) {
    const root = document.getElementById("overlay-root") || document.body;
    const back = el("div", "ui-overlay");
    if (contentEl) back.appendChild(contentEl);
    root.appendChild(back);
    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      back.classList.add("out");
      setTimeout(() => back.remove(), 240);
    }
    requestAnimationFrame(() => back.classList.add("in"));
    return { close, root: back };
  }

  /* ── number count-up ─────────────────────────────── */
  function countUp(node, to, ms) {
    to = Math.round(to);
    ms = ms || 900;
    if (prefersReduced()) { node.textContent = String(to); return; }
    const from = 0;
    const start = performance.now();
    function frame(now) {
      const t = Math.min(1, (now - start) / ms);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      node.textContent = String(Math.round(from + (to - from) * eased));
      if (t < 1) requestAnimationFrame(frame);
      else node.textContent = String(to);
    }
    requestAnimationFrame(frame);
  }

  /* ── circular score ring (SVG) ───────────────────── */
  function scoreRing(score, sizePx) {
    sizePx = sizePx || 96;
    const color = window.DemoAI ? DemoAI.colorFor(score) : "#18b9c4";
    const stroke = Math.max(6, Math.round(sizePx * 0.1));
    const r = (sizePx - stroke) / 2;
    const c = 2 * Math.PI * r;
    const ratio = Math.max(0, Math.min(1, score / 100));
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", `0 0 ${sizePx} ${sizePx}`);
    svg.setAttribute("width", sizePx);
    svg.setAttribute("height", sizePx);
    svg.setAttribute("class", "ui-ring");

    const track = document.createElementNS(ns, "circle");
    track.setAttribute("cx", sizePx / 2);
    track.setAttribute("cy", sizePx / 2);
    track.setAttribute("r", r);
    track.setAttribute("fill", "none");
    track.setAttribute("stroke", "#e6f1f5");
    track.setAttribute("stroke-width", stroke);
    svg.appendChild(track);

    const arc = document.createElementNS(ns, "circle");
    arc.setAttribute("cx", sizePx / 2);
    arc.setAttribute("cy", sizePx / 2);
    arc.setAttribute("r", r);
    arc.setAttribute("fill", "none");
    arc.setAttribute("stroke", color);
    arc.setAttribute("stroke-width", stroke);
    arc.setAttribute("stroke-linecap", "round");
    arc.setAttribute("stroke-dasharray", c.toFixed(2));
    arc.setAttribute("transform", `rotate(-90 ${sizePx / 2} ${sizePx / 2})`);
    if (prefersReduced()) {
      arc.setAttribute("stroke-dashoffset", (c * (1 - ratio)).toFixed(2));
    } else {
      arc.setAttribute("stroke-dashoffset", c.toFixed(2));
      arc.style.transition = "stroke-dashoffset 900ms cubic-bezier(.22,.61,.36,1)";
      requestAnimationFrame(() => requestAnimationFrame(() => {
        arc.setAttribute("stroke-dashoffset", (c * (1 - ratio)).toFixed(2));
      }));
    }
    svg.appendChild(arc);

    // center label
    const fo = document.createElementNS(ns, "foreignObject");
    fo.setAttribute("x", 0); fo.setAttribute("y", 0);
    fo.setAttribute("width", sizePx); fo.setAttribute("height", sizePx);
    const lab = el("div", "ui-ring-label");
    lab.style.height = sizePx + "px";
    const num = el("span", "ui-ring-num", "0");
    num.style.fontSize = Math.round(sizePx * 0.32) + "px";
    num.style.color = color;
    lab.appendChild(num);
    const unit = el("span", "ui-ring-unit", "点");
    lab.appendChild(unit);
    fo.appendChild(lab);
    svg.appendChild(fo);

    // expose the number node so callers can count it up
    svg._num = num;
    svg._color = color;
    return svg;
  }

  /* ── confetti ────────────────────────────────────── */
  function confettiBurst(kind) {
    if (prefersReduced() || typeof window.confetti !== "function") return;
    const teal = ["#18b9c4", "#1a8fe3", "#ff8a3d", "#3ecf6e", "#ffd54a"];
    if (kind === "levelup") {
      const end = Date.now() + 900;
      (function frame() {
        confetti({ particleCount: 5, angle: 60, spread: 70, origin: { x: 0, y: 0.7 }, colors: teal });
        confetti({ particleCount: 5, angle: 120, spread: 70, origin: { x: 1, y: 0.7 }, colors: teal });
        if (Date.now() < end) requestAnimationFrame(frame);
      })();
      confetti({ particleCount: 120, spread: 100, startVelocity: 45, origin: { y: 0.6 }, colors: teal });
    } else if (kind === "repair") {
      confetti({ particleCount: 90, spread: 80, startVelocity: 40, origin: { y: 0.6 }, colors: ["#3ecf6e", "#18b9c4", "#ffd54a"] });
    } else {
      // "post"
      confetti({ particleCount: 60, spread: 65, startVelocity: 35, origin: { y: 0.65 }, colors: teal });
    }
  }

  /* ── relative time ───────────────────────────────── */
  function timeAgo(iso) {
    const then = new Date(iso).getTime();
    if (isNaN(then)) return "";
    const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
    if (sec < 60) return "たった今";
    const min = Math.floor(sec / 60);
    if (min < 60) return min + "分前";
    const hr = Math.floor(min / 60);
    if (hr < 24) return hr + "時間前";
    const day = Math.floor(hr / 24);
    if (day < 7) return day + "日前";
    const wk = Math.floor(day / 7);
    if (wk < 5) return wk + "週間前";
    const mo = Math.floor(day / 30);
    if (mo < 12) return mo + "ヶ月前";
    return Math.floor(day / 365) + "年前";
  }

  /* ── status badge ────────────────────────────────── */
  const STATUS_META = {
    "解析中":   { cls: "st-analyzing", ico: "⏳" },
    "未対応":   { cls: "st-open",      ico: "🚩" },
    "現場確認": { cls: "st-check",     ico: "🔎" },
    "修繕指示": { cls: "st-order",     ico: "📋" },
    "修繕完了": { cls: "st-done",      ico: "✅" }
  };
  function statusBadge(status) {
    const m = STATUS_META[status] || { cls: "st-open", ico: "•" };
    const span = el("span", "ui-status " + m.cls);
    span.appendChild(el("span", "ui-status-ico", m.ico));
    span.appendChild(document.createTextNode(status));
    return span;
  }

  window.UI = {
    el, prefersReduced,
    toast, sheet, overlay,
    countUp, scoreRing, confettiBurst,
    timeAgo, statusBadge,
    STATUS_META
  };
})();
