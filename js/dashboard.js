/* パとるロール — Dashboard (P3) */
/* 技術者モードのフルスクリーンパネル。z-index: 9000 (map z-0, chrome z-1000, sheets z-11000+) */
(function () {

  function el(t, c, h) { return UI.el(t, c, h); }

  const STATUS_ORDER = ["未対応", "現場確認", "修繕指示", "修繕完了"];

  /* ── status advance helper (shared with Detail._renderEngineer) ── */
  function nextStatus(cur) {
    const i = STATUS_ORDER.indexOf(cur);
    return i >= 0 && i < STATUS_ORDER.length - 1 ? STATUS_ORDER[i + 1] : null;
  }

  async function advanceStatus(report, onDone) {
    const next = nextStatus(report.status);
    if (!next) return;
    const at = new Date().toISOString();
    const hist = (report.statusHistory || []).concat([{ status: next, at, by: "技術者" }]);
    const updated = await Store.updateReport(report.id, { status: next, statusHistory: hist });
    if (next === "修繕完了" && report.reporterId === "me") {
      await window.Notify?.repairDone?.(updated || report);
    }
    if (typeof onDone === "function") onDone(updated || report, next);
    return updated;
  }

  /* expose the helper for Detail._renderEngineer */
  window.Dashboard = window.Dashboard || {};
  window.Dashboard.advanceStatus = advanceStatus;
  window.Dashboard.nextStatus = nextStatus;

  /* ── panel DOM refs ────────────────────────────────── */
  let panel = null;
  let currentTab = "list";
  let mapFloating = null;   // floating chip when on map tab

  /* ── init ────────────────────────────────────────────── */
  function init() {
    if (panel) return;
    panel = el("div", "db-panel");
    panel.id = "db-panel";
    panel.hidden = true;
    document.body.appendChild(panel);
  }

  /* ── render (called by App.setMode) ──────────────────── */
  async function render() {
    if (!panel) init();
    if (App.mode !== "engineer") {
      panel.hidden = true;
      _hideMapFloat();
      return;
    }
    panel.hidden = false;
    currentTab = currentTab || "list";
    await _renderPanel();
  }

  async function _renderPanel() {
    panel.innerHTML = "";

    /* header */
    const head = el("div", "db-header");
    const title = el("div", "db-title", "🛠 技術者ダッシュボード");
    const backBtn = el("button", "db-back-btn", "市民モードへ戻る");
    backBtn.addEventListener("click", () => {
      App.setMode("citizen");
      _hideMapFloat();
    });
    head.appendChild(title);
    head.appendChild(backBtn);
    panel.appendChild(head);

    /* KPI cards */
    const reports = await Store.listReports();
    panel.appendChild(await _buildKpi(reports));

    /* tabs */
    const tabs = el("div", "db-tabs");
    [["list", "リスト"], ["map", "マップ"], ["watch", "定点ウォッチ"]].forEach(([id, label]) => {
      const tb = el("button", "db-tab" + (currentTab === id ? " active" : ""), label);
      tb.dataset.tab = id;
      tb.addEventListener("click", () => switchTab(id));
      tabs.appendChild(tb);
    });
    panel.appendChild(tabs);

    /* tab content area */
    const content = el("div", "db-content");
    content.id = "db-content";
    panel.appendChild(content);

    await _renderTab(currentTab, reports);
  }

  function switchTab(id) {
    currentTab = id;
    // update active tab highlight
    panel.querySelectorAll(".db-tab").forEach(t => {
      t.classList.toggle("active", t.dataset.tab === id);
    });
    Store.listReports().then(reps => _renderTab(id, reps));
  }

  async function _renderTab(id, reports) {
    const content = document.getElementById("db-content");
    if (!content) return;
    content.innerHTML = "";

    if (id === "list") {
      _hideMapFloat();
      content.appendChild(await _buildList(reports));
    } else if (id === "map") {
      _showMapTab(content);
    } else if (id === "watch") {
      _hideMapFloat();
      content.appendChild(_buildWatch(reports));
    }
  }

  /* ── KPI cards ─────────────────────────────────────── */
  async function _buildKpi(reports) {
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 3600 * 1000;

    const open = reports.filter(r => r.status === "未対応").length;
    const highRisk = reports.filter(r => r.ai && r.ai.score >= 70 && r.status !== "修繕完了").length;
    const thisWeek = reports.filter(r => new Date(r.createdAt).getTime() >= weekAgo).length;
    const done = reports.filter(r => r.status === "修繕完了").length;
    const eligible = reports.filter(r => r.status !== "解析中").length;
    const repairRate = eligible > 0 ? Math.round((done / eligible) * 100) : 0;

    const row = el("div", "db-kpi-row");
    row.appendChild(_kpiCard("🚩", open, "未対応"));
    row.appendChild(_kpiCard("🔴", highRisk, "要確認(高)"));
    row.appendChild(_kpiCard("📅", thisWeek, "今週の新規"));
    row.appendChild(_kpiCard("✅", repairRate + "%", "修繕完了率"));
    return row;
  }

  function _kpiCard(icon, val, label) {
    const c = el("div", "db-kpi");
    c.innerHTML = `<div class="db-kpi-ico">${icon}</div>
      <div class="db-kpi-val">${val}</div>
      <div class="db-kpi-label">${label}</div>`;
    return c;
  }

  /* ── LIST tab ──────────────────────────────────────── */
  async function _buildList(reports) {
    const wrap = el("div", "db-list-wrap");

    /* filter chips */
    const filterBar = el("div", "db-filter-bar");
    let filterStatus = null;
    let filterType = null;

    const statusChips = el("div", "db-filter-group");
    ["未対応", "現場確認", "修繕指示", "修繕完了"].forEach(s => {
      const c = el("button", "db-filter-chip", s);
      c.addEventListener("click", () => {
        filterStatus = filterStatus === s ? null : s;
        statusChips.querySelectorAll(".db-filter-chip").forEach(x => x.classList.remove("active"));
        if (filterStatus) c.classList.add("active");
        refreshList();
      });
      statusChips.appendChild(c);
    });

    const typeChips = el("div", "db-filter-group");
    Object.entries(window.PR_TYPES || {}).forEach(([key, t]) => {
      const c = el("button", "db-filter-chip", t.emoji + " " + t.label);
      c.addEventListener("click", () => {
        filterType = filterType === key ? null : key;
        typeChips.querySelectorAll(".db-filter-chip").forEach(x => x.classList.remove("active"));
        if (filterType) c.classList.add("active");
        refreshList();
      });
      typeChips.appendChild(c);
    });

    filterBar.appendChild(statusChips);
    filterBar.appendChild(typeChips);
    wrap.appendChild(filterBar);

    const listEl = el("div", "db-list");
    listEl.id = "db-report-list";
    wrap.appendChild(listEl);

    function refreshList() {
      Store.listReports().then(reps => {
        // sort: score desc, 解析中 last
        let sorted = reps.slice().sort((a, b) => {
          const sa = a.ai ? a.ai.score : -1;
          const sb = b.ai ? b.ai.score : -1;
          return sb - sa;
        });
        if (filterStatus) sorted = sorted.filter(r => r.status === filterStatus);
        if (filterType) sorted = sorted.filter(r => r.type === filterType);
        renderRows(sorted);
      });
    }

    function renderRows(reps) {
      const el2 = document.getElementById("db-report-list");
      if (!el2) return;
      el2.innerHTML = "";
      if (reps.length === 0) {
        el2.innerHTML = `<div class="db-list-empty">該当する報告がありません</div>`;
        return;
      }
      reps.forEach(r => el2.appendChild(_buildRow(r)));
    }

    refreshList();
    return wrap;
  }

  function _buildRow(report) {
    const tm = (window.PR_TYPES || {})[report.type] || { label: report.type, emoji: "❓" };
    const score = report.ai ? report.ai.score : null;
    const color = (score != null && window.DemoAI) ? DemoAI.colorFor(score) : "#9bb3c0";
    const next = nextStatus(report.status);

    const row = el("div", "db-row");
    row.id = "db-row-" + report.id;

    const thumb = el("img", "db-thumb");
    thumb.src = report.thumb || "";
    thumb.alt = tm.label;
    row.appendChild(thumb);

    const info = el("div", "db-row-info");
    const top = el("div", "db-row-top");
    const scorePill = el("span", "db-score-pill");
    scorePill.style.background = color;
    scorePill.textContent = score != null ? String(score) : "解析中";
    top.appendChild(scorePill);
    top.appendChild(el("span", "db-row-type", tm.emoji + " " + tm.label));
    top.appendChild(el("span", "db-row-time", UI.timeAgo(report.createdAt)));
    info.appendChild(top);
    info.appendChild(UI.statusBadge(report.status));
    row.appendChild(info);

    if (next) {
      const advBtn = el("button", "db-adv-btn", "▶ 次へ進める");
      advBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        advBtn.disabled = true;
        advBtn.textContent = "…";
        await advanceStatus(report, (updated, newStatus) => {
          if (newStatus === "修繕完了") {
            const rowEl = document.getElementById("db-row-" + report.id);
            if (rowEl) {
              rowEl.classList.add("db-row-done-flash");
              setTimeout(() => rowEl && rowEl.classList.remove("db-row-done-flash"), 900);
            }
          }
          // re-render the row
          const rowEl = document.getElementById("db-row-" + report.id);
          if (rowEl && updated) {
            const newRow = _buildRow(updated);
            newRow.id = "db-row-" + updated.id;
            rowEl.parentNode.replaceChild(newRow, rowEl);
          }
        });
      });
      row.appendChild(advBtn);
    }

    row.addEventListener("click", () => window.Detail?.open?.(report.id));
    return row;
  }

  /* ── MAP tab ───────────────────────────────────────── */
  function _showMapTab(content) {
    // hide the dashboard panel body; reveal the map through
    content.innerHTML = "";
    panel.classList.add("db-map-mode");

    if (!mapFloating) {
      mapFloating = el("div", "db-map-float");
      const backChip = el("button", "db-map-back", "← リストに戻る");
      backChip.addEventListener("click", () => switchTab("list"));
      const heatLabel = el("label", "db-heat-label");
      const heatCheck = el("input", "db-heat-check");
      heatCheck.type = "checkbox";
      heatCheck.addEventListener("change", () => window.MapView?.setHeat?.(heatCheck.checked));
      heatLabel.appendChild(heatCheck);
      heatLabel.appendChild(document.createTextNode("ヒートマップ"));
      mapFloating.appendChild(backChip);
      mapFloating.appendChild(heatLabel);
      document.body.appendChild(mapFloating);
    }
    mapFloating.style.display = "flex";
  }

  function _hideMapFloat() {
    panel.classList.remove("db-map-mode");
    if (mapFloating) mapFloating.style.display = "none";
  }

  /* ── WATCH tab: 定点ウォッチ ──────────────────────── */
  function _buildWatch(reports) {
    const wrap = el("div", "db-watch-wrap");

    const clusters = _findClusters(reports);
    if (clusters.length === 0) {
      wrap.innerHTML = `<div class="db-list-empty">30m以内に複数報告のある地点はまだありません</div>`;
      return wrap;
    }

    clusters.forEach(cluster => {
      const card = el("div", "db-watch-card");

      // location summary
      const locRow = el("div", "db-watch-loc");
      const latLng = cluster[0];
      locRow.innerHTML = `<span class="db-watch-loc-ico">📍</span>
        <span class="db-watch-loc-txt">${latLng.toFixed(4)}, ${cluster[1].toFixed(4)}</span>
        <span class="db-watch-count">${cluster[2].length} 件</span>`;
      card.appendChild(locRow);

      // sparkline + trend
      const sorted = cluster[2].slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const scores = sorted.map(r => r.ai ? r.ai.score : 0);
      const sparkRow = el("div", "db-watch-spark-row");
      sparkRow.appendChild(_sparkline(scores));
      const trend = _trendArrow(scores);
      const trendSpan = el("span", "db-watch-trend " + trend.cls, trend.arrow + " " + trend.label);
      sparkRow.appendChild(trendSpan);
      card.appendChild(sparkRow);

      card.addEventListener("click", () => _openClusterSheet(cluster[2]));
      wrap.appendChild(card);
    });

    return wrap;
  }

  /* 35m単リンケージ・クラスタリング(union-find、~30件なのでO(n²)で十分)
     ※グリッドハッシュはセル境界をまたぐ点を分断するため不採用 */
  function _findClusters(reports) {
    const pts = reports.filter(r => r.ai);
    const n = pts.length;
    const R = 35; // meters
    const parent = Array.from({ length: n }, (_, i) => i);
    const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const distM = (a, b) => {
      const dLat = (a.lat - b.lat) * 111320;
      const dLng = (a.lng - b.lng) * 111320 * Math.cos(a.lat * Math.PI / 180);
      return Math.hypot(dLat, dLng);
    };
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        if (distM(pts[i], pts[j]) <= R) parent[find(i)] = find(j);
    const groups = {};
    pts.forEach((p, i) => {
      const root = find(i);
      if (!groups[root]) groups[root] = [];
      groups[root].push(p);
    });
    return Object.values(groups)
      .filter(g => g.length >= 2)
      .map(g => {
        const items = g.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        const lat = g.reduce((s, p) => s + p.lat, 0) / g.length;
        const lng = g.reduce((s, p) => s + p.lng, 0) / g.length;
        return [lat, lng, items];
      });
  }

  function _sparkline(scores) {
    const W = 100, H = 28, pad = 3;
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("width", W);
    svg.setAttribute("height", H);
    svg.setAttribute("class", "db-sparkline");
    if (scores.length < 2) return svg;

    const mn = Math.min(...scores);
    const mx = Math.max(...scores) || 100;
    const sx = (i) => pad + i * (W - 2 * pad) / (scores.length - 1);
    const sy = (v) => H - pad - (v - mn) / (mx - mn + 0.001) * (H - 2 * pad);

    const pts = scores.map((v, i) => `${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(" ");
    const poly = document.createElementNS(ns, "polyline");
    poly.setAttribute("points", pts);
    poly.setAttribute("fill", "none");
    poly.setAttribute("stroke", "#ff4d5e");
    poly.setAttribute("stroke-width", "2.5");
    poly.setAttribute("stroke-linecap", "round");
    poly.setAttribute("stroke-linejoin", "round");
    svg.appendChild(poly);

    // dots
    scores.forEach((v, i) => {
      const circle = document.createElementNS(ns, "circle");
      circle.setAttribute("cx", sx(i).toFixed(1));
      circle.setAttribute("cy", sy(v).toFixed(1));
      circle.setAttribute("r", "3");
      circle.setAttribute("fill", "#ff4d5e");
      svg.appendChild(circle);
    });
    return svg;
  }

  function _trendArrow(scores) {
    if (scores.length < 2) return { arrow: "→", label: "変化なし", cls: "neutral" };
    const delta = scores[scores.length - 1] - scores[0];
    if (delta >= 10) return { arrow: "↗", label: "悪化トレンド", cls: "rising" };
    if (delta <= -10) return { arrow: "↘", label: "改善中", cls: "falling" };
    return { arrow: "→", label: "横ばい", cls: "neutral" };
  }

  /* cluster detail sheet: vertical timeline */
  function _openClusterSheet(reps) {
    const body = el("div", "db-timeline");
    const sorted = reps.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    sorted.forEach((r, i) => {
      const row = el("div", "db-tl-row");
      const score = r.ai ? r.ai.score : null;
      const color = (score != null && window.DemoAI) ? DemoAI.colorFor(score) : "#9bb3c0";

      const dotCol = el("div", "db-tl-rail");
      const dot = el("div", "db-tl-dot", String(i + 1));
      dotCol.appendChild(dot);
      if (i < sorted.length - 1) dotCol.appendChild(el("div", "db-tl-line"));
      row.appendChild(dotCol);

      const info = el("div", "db-tl-info");
      const dateStr = new Date(r.createdAt).toLocaleDateString("ja-JP", { month: "long", day: "numeric" });
      const scorePill = el("span", "db-score-pill sm");
      scorePill.style.background = color;
      scorePill.textContent = score != null ? String(score) : "…";

      const top = el("div", "db-tl-top");
      top.appendChild(el("span", "db-tl-date", dateStr));
      top.appendChild(scorePill);
      info.appendChild(top);

      if (r.thumb) {
        const img = el("img", "db-tl-thumb");
        img.src = r.thumb;
        img.alt = r.type;
        img.addEventListener("click", () => window.Detail?.open?.(r.id));
        info.appendChild(img);
      }
      info.appendChild(UI.statusBadge(r.status));
      row.appendChild(info);
      body.appendChild(row);
    });

    const scores = sorted.map(r => r.ai ? r.ai.score : 0);
    const trend = _trendArrow(scores);
    if (trend.cls === "rising") {
      const warn = el("div", "db-tl-warn", "⚠️ 悪化トレンドが確認されています。早急な対応を検討してください。");
      body.appendChild(warn);
    }

    UI.sheet({ title: "📍 定点レポート", bodyEl: body });
  }

  /* ── open/close ────────────────────────────────────── */
  function open() {
    App.setMode("engineer");
  }

  function close() {
    App.setMode("citizen");
  }

  window.Dashboard = Object.assign(window.Dashboard || {}, {
    init, render, open, close, advanceStatus, nextStatus
  });
})();
