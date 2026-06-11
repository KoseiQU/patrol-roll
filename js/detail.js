/* パとるロール — Detail bottom sheet (P2; P3 adds engineer status controls) */
(function () {

  const STEPS = ["未対応", "現場確認", "修繕指示", "修繕完了"];

  function el(t, c, h) { return UI.el(t, c, h); }
  function typeMeta(type) { return (window.PR_TYPES || {})[type] || { label: type, emoji: "❓", color: "#6b7f8e" }; }

  /* find the latest history time for a given status */
  function historyTime(report, status) {
    if (!report.statusHistory) return null;
    for (let i = report.statusHistory.length - 1; i >= 0; i--) {
      if (report.statusHistory[i].status === status) return report.statusHistory[i].at;
    }
    return null;
  }

  /* ── vertical status stepper ─────────────────────── */
  function buildStepper(report) {
    const wrap = el("div", "dt-stepper");
    const curIdx = STEPS.indexOf(report.status);
    STEPS.forEach((st, i) => {
      const row = el("div", "dt-step" + (i <= curIdx ? " done" : "") + (i === curIdx ? " current" : ""));
      const dotCol = el("div", "dt-step-rail");
      const dot = el("div", "dt-step-dot", i < curIdx ? "✓" : (i === curIdx ? "●" : ""));
      dotCol.appendChild(dot);
      if (i < STEPS.length - 1) dotCol.appendChild(el("div", "dt-step-line"));
      row.appendChild(dotCol);

      const txt = el("div", "dt-step-txt");
      txt.appendChild(el("div", "dt-step-name", st));
      const at = historyTime(report, st);
      if (at) txt.appendChild(el("div", "dt-step-when", new Date(at).toLocaleDateString("ja-JP", { month: "long", day: "numeric" }) + "・" + UI.timeAgo(at)));
      else if (i > curIdx) txt.appendChild(el("div", "dt-step-when muted", "これから"));
      row.appendChild(txt);
      wrap.appendChild(row);
    });
    return wrap;
  }

  /* ── main open ───────────────────────────────────── */
  async function open(id) {
    const report = await Store.getReport(id);
    if (!report) return;
    const tm = typeMeta(report.type);
    const isMine = report.reporterId === "me";
    const score = report.ai ? report.ai.score : null;
    const cat = report.ai ? report.ai.category : "解析中";

    const body = el("div", "dt-body");

    /* photo (tap to zoom) */
    const photoWrap = el("div", "dt-photo");
    const img = el("img", "dt-photo-img");
    img.alt = tm.label;
    img.src = report.thumb || "";
    photoWrap.appendChild(img);
    const zoomHint = el("div", "dt-zoom-hint", "🔍 タップで拡大");
    photoWrap.appendChild(zoomHint);
    if (isMine) photoWrap.appendChild(el("div", "dt-mine-badge", "🏅 あなたの報告"));
    photoWrap.addEventListener("click", () => zoomPhoto(report));
    body.appendChild(photoWrap);

    /* score + category row */
    const head = el("div", "dt-head");
    if (score != null) {
      const ring = UI.scoreRing(score, 84);
      head.appendChild(ring);
      // count up immediately
      if (ring._num) UI.countUp(ring._num, score, 700);
    } else {
      const wait = el("div", "dt-analyzing", "⏳");
      head.appendChild(wait);
    }
    const headMeta = el("div", "dt-head-meta");
    const catPill = el("div", "dt-cat-pill");
    catPill.style.background = window.DemoAI ? DemoAI.colorFor(cat) : "#6b7f8e";
    catPill.textContent = cat;
    headMeta.appendChild(catPill);
    const typeChip = el("div", "dt-type-chip");
    typeChip.style.setProperty("--tc", tm.color);
    typeChip.innerHTML = `<span>${tm.emoji}</span>${tm.label}`;
    headMeta.appendChild(typeChip);
    headMeta.appendChild(UI.statusBadge(report.status));
    head.appendChild(headMeta);
    body.appendChild(head);

    /* reporter + time */
    const meta = el("div", "dt-reporter");
    meta.innerHTML = `<span class="dt-rep-name">👤 ${report.reporterName || "匿名"}</span>` +
      `<span class="dt-rep-time">${UI.timeAgo(report.createdAt)}</span>`;
    body.appendChild(meta);

    /* comment */
    if (report.comment) {
      const cm = el("div", "dt-comment");
      cm.innerHTML = `<span class="dt-quote">“</span>${escapeHtml(report.comment)}`;
      body.appendChild(cm);
    }

    /* AI reason card */
    if (report.ai && report.ai.reason) {
      const reason = el("div", "dt-reason");
      reason.appendChild(el("div", "dt-reason-head", "🤖 AIの見立て"));
      reason.appendChild(el("div", "dt-reason-body", escapeHtml(report.ai.reason)));
      body.appendChild(reason);
    }

    /* status timeline */
    const tlHead = el("div", "dt-section-head", "対応のあゆみ");
    body.appendChild(tlHead);
    body.appendChild(buildStepper(report));

    /* cheers button */
    const cheerWrap = el("div", "dt-cheer-wrap");
    const cheerBtn = el("button", "dt-cheer-btn");
    const cheerCount = el("span", "dt-cheer-count", String(report.cheers || 0));
    cheerBtn.innerHTML = `<span class="dt-cheer-fist">👊</span><span class="dt-cheer-label">なおして!</span>`;
    cheerBtn.appendChild(cheerCount);
    cheerWrap.appendChild(cheerBtn);
    body.appendChild(cheerWrap);

    let localCheers = report.cheers || 0;
    cheerBtn.addEventListener("click", async () => {
      localCheers++;
      cheerCount.textContent = String(localCheers);
      cheerCount.classList.remove("pop");
      void cheerCount.offsetWidth;
      cheerCount.classList.add("pop");
      cheerBtn.classList.remove("punch");
      void cheerBtn.offsetWidth;
      cheerBtn.classList.add("punch");
      await Store.updateReport(report.id, { cheers: localCheers });
      // badge: cheer10 counts total cheers the user gave this session-ish via user counter
      Store.user._cheersGiven = (Store.user._cheersGiven || 0) + 1;
      Store.saveUser();
      window.Profile?.checkBadges?.("cheer");
    });

    /* P3 hook: engineer status-change controls mount here */
    const engSlot = el("div", "dt-engineer-slot");
    engSlot.dataset.reportId = report.id;
    body.appendChild(engSlot);

    const sh = UI.sheet({ title: tm.label + "の報告", bodyEl: body });

    // let P3 populate engineer controls if present
    if (window.Detail && typeof window.Detail._renderEngineer === "function") {
      try { window.Detail._renderEngineer(report, engSlot, sh); } catch (e) { console.warn(e); }
    }

    return sh;
  }

  /* ── full photo zoom (loads full Blob from IndexedDB) ── */
  async function zoomPhoto(report) {
    const content = el("div", "dt-zoom");
    const img = el("img", "dt-zoom-img");
    img.src = report.thumb || "";
    content.appendChild(img);
    const hint = el("div", "dt-zoom-close-hint", "タップで閉じる");
    content.appendChild(hint);
    const ov = UI.overlay(content);
    content.addEventListener("click", () => { ov.close(); if (objUrl) URL.revokeObjectURL(objUrl); });
    let objUrl = null;
    if (report.hasPhoto) {
      try {
        const blob = await Store.getPhoto(report.id);
        if (blob) { objUrl = URL.createObjectURL(blob); img.src = objUrl; }
      } catch (e) { /* keep thumb */ }
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  /* ── P3: engineer status controls ───────────────────── */
  function _renderEngineer(report, slotEl, sheet) {
    if (!window.App || App.mode !== "engineer") return;
    const next = window.Dashboard && window.Dashboard.nextStatus
      ? window.Dashboard.nextStatus(report.status)
      : null;

    // always show current status; only show advance button if there is a next step
    const wrap = UI.el("div", "dt-eng-wrap");
    const curRow = UI.el("div", "dt-eng-cur");
    curRow.innerHTML = `<span class="dt-eng-label">現在のステータス：</span>`;
    curRow.appendChild(UI.statusBadge(report.status));
    wrap.appendChild(curRow);

    if (next) {
      const advBtn = UI.el("button", "dt-eng-adv-btn", "▶ " + next + " に進める");
      advBtn.addEventListener("click", async () => {
        advBtn.disabled = true;
        advBtn.textContent = "更新中…";
        await window.Dashboard.advanceStatus(report, (updated, newStatus) => {
          if (sheet && typeof sheet.close === "function") sheet.close();
          if (updated) window.Detail?.open?.(updated.id);
        });
      });
      wrap.appendChild(advBtn);
    }

    slotEl.appendChild(wrap);
  }

  window.Detail = Object.assign(window.Detail || {}, { open, STEPS, escapeHtml, _renderEngineer });
})();
