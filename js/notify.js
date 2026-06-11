/* パとるロール — Notify (P3) */
/* 🔔ベル + 通知センター + push() + repairDone() */
(function () {

  function el(t, c, h) { return UI.el(t, c, h); }

  const KIND_ICON = {
    repair_done: "✅",
    status: "🛠",
    badge: "🏅",
    levelup: "⬆️",
    info: "ℹ️"
  };

  /* ── repair-type messages ──────────────────────────── */
  const REPAIR_MSG = {
    pothole: "あなたの報告で陥没が起きる前に補修されました！",
    crack:   "あなたの報告でひび割れが補修されました！",
    leak:    "あなたの報告で水漏れ箇所が修繕されました！",
    other:   "あなたの報告がまちの修繕につながりました！"
  };

  /* ── bell element ref ──────────────────────────────── */
  let bellBtn = null;
  let bellBadge = null;

  /* ── init: render bell into #notif-bell ───────────── */
  function init() {
    const host = document.getElementById("notif-bell");
    if (!host) return;

    bellBtn = el("button", "bell-btn");
    bellBtn.setAttribute("aria-label", "通知センター");
    bellBtn.innerHTML = "🔔";
    bellBadge = el("span", "bell-badge");
    bellBadge.style.display = "none";
    bellBtn.appendChild(bellBadge);
    host.appendChild(bellBtn);

    bellBtn.addEventListener("click", openCenter);

    // keep badge live
    Store.on("notifs:change", updateBadge);
    updateBadge();
  }

  function updateBadge() {
    const n = Store.unreadCount || 0;
    if (!bellBadge) return;
    if (n > 0) {
      bellBadge.textContent = n > 99 ? "99+" : String(n);
      bellBadge.style.display = "";
    } else {
      bellBadge.style.display = "none";
    }
  }

  /* ── notification center sheet ────────────────────── */
  async function openCenter() {
    const notifs = await Store.listNotifs();
    const body = el("div", "nc-list");

    if (notifs.length === 0) {
      body.innerHTML = `<div class="nc-empty">
        <div class="nc-empty-ico">🔕</div>
        <div class="nc-empty-txt">通知はありません</div>
      </div>`;
    } else {
      notifs.forEach(n => {
        const row = el("button", "nc-row" + (n.read ? "" : " unread"));
        row.innerHTML =
          `<span class="nc-kind-ico">${KIND_ICON[n.kind] || "ℹ️"}</span>
           <span class="nc-content">
             <span class="nc-title">${Detail.escapeHtml(n.title)}</span>
             <span class="nc-body">${Detail.escapeHtml(n.body)}</span>
             <span class="nc-time">${UI.timeAgo(n.at)}</span>
           </span>
           ${n.read ? "" : '<span class="nc-dot"></span>'}`;
        row.addEventListener("click", async () => {
          await Store.markNotifRead(n.id);
          sh.close();
          if (n.reportId) {
            window.MapView?.focus?.(n.reportId);
            window.Detail?.open?.(n.reportId);
          }
        });
        body.appendChild(row);
      });
    }

    // 「すべて既読」ボタン
    const footer = el("div", "nc-footer");
    const allReadBtn = el("button", "nc-all-read", "すべて既読にする");
    allReadBtn.addEventListener("click", async () => {
      await Store.markNotifRead("all");
      sh.close();
    });
    footer.appendChild(allReadBtn);
    body.appendChild(footer);

    const sh = UI.sheet({ title: "🔔 通知センター", bodyEl: body });
  }

  /* ── push: store + toast + Web Notification ──────── */
  async function push(kind, title, body, reportId) {
    const n = {
      id: "n_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      at: new Date().toISOString(),
      kind, title, body,
      reportId: reportId || null,
      read: false
    };
    await Store.addNotif(n);
    UI.toast(title + " — " + body, { icon: KIND_ICON[kind] || "🔔", ms: 3000 });
    if (Notification && Notification.permission === "granted") {
      try { new Notification(title, { body }); } catch (e) { /* non-blocking */ }
    }
  }

  /* ── repairDone: full repair-complete reward flow ─── */
  async function repairDone(report) {
    const msg = REPAIR_MSG[report.type] || REPAIR_MSG.other;
    await push("repair_done", "修繕完了！🎉", msg, report.id);

    // xp + points
    const lvl = Store.grantXP(200);
    Store.grantPoints(30);

    // repairedCount
    Store.user.repairedCount = (Store.user.repairedCount || 0) + 1;
    Store.saveUser();

    // badge
    window.Profile?.checkBadges?.("repair");

    // confetti
    UI.confettiBurst("repair");

    // level-up overlay if needed
    if (lvl && lvl.leveled) {
      setTimeout(() => _levelUpOverlay(lvl.level), 400);
    }
  }

  function _levelUpOverlay(level) {
    UI.confettiBurst("levelup");
    const c = el("div", "levelup");
    c.innerHTML = `
      <div class="levelup-inner">
        <div class="levelup-burst">⭐️</div>
        <div class="levelup-title">LEVEL UP!</div>
        <div class="levelup-lv">Lv.${level}</div>
        <div class="levelup-rank">${Store.rankName()}</div>
        <button class="levelup-ok">やったー！</button>
      </div>`;
    const o = UI.overlay(c);
    c.querySelector(".levelup-ok").addEventListener("click", () => o.close());
    setTimeout(() => { try { o.close(); } catch (e) {} }, 4500);
  }

  window.Notify = { init, push, repairDone, updateBadge, openCenter };
})();
