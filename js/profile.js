/* パとるロール — Profile panel + badges + gacha (P2) */
(function () {

  function el(t, c, h) { return UI.el(t, c, h); }

  /* ── badge catalog ───────────────────────────────── */
  const BADGES = [
    { id: "first_post",   icon: "🌱", name: "はじめての報告", cond: "報告を1件投稿する",
      test: u => (u.totalReports || 0) >= 1 },
    { id: "types3",       icon: "🎯", name: "3種類みつけた", cond: "3種類の異常を報告する",
      test: u => (u.typesPosted || []).length >= 3 },
    { id: "posts5",       icon: "🖐", name: "5件達成", cond: "報告を5件投稿する",
      test: u => (u.totalReports || 0) >= 5 },
    { id: "posts10",      icon: "🔟", name: "10件達成", cond: "報告を10件投稿する",
      test: u => (u.totalReports || 0) >= 10 },
    { id: "first_repair", icon: "🛠", name: "初・修繕完了", cond: "あなたの報告が修繕される",
      test: u => (u.repairedCount || 0) >= 1 },
    { id: "hunter",       icon: "🦅", name: "危険ハンター", cond: "「要確認」を3件発見する",
      test: u => (u._hunterCount || 0) >= 3 },
    { id: "gacha1",       icon: "🎁", name: "カプセルデビュー", cond: "カプセルトイを1回まわす",
      test: u => (u.gachaCount || 0) >= 1 },
    { id: "cheer10",      icon: "👊", name: "応援団", cond: "「なおして!」を10回押す",
      test: u => (u._cheersGiven || 0) >= 10 }
  ];

  /* ── gacha prizes (mock) ─────────────────────────── */
  const PRIZES = [
    { icon: "🥕", name: "地元野菜セット応募券", tone: "win", flavor: "採れたて野菜が当たるかも！" },
    { icon: "🎫", name: "商店街ギフト券 500円分", tone: "win", flavor: "まちのお店で使えます。" },
    { icon: "🐻", name: "ご当地キャラ ステッカー", tone: "win", flavor: "限定デザイン！" },
    { icon: "☕️", name: "コーヒー無料券", tone: "win", flavor: "ひと休みどうぞ。" },
    { icon: "🧯", name: "防災グッズ", tone: "win", flavor: "もしもの備えに。" },
    { icon: "💨", name: "ハズレ", tone: "lose", flavor: "また挑戦！次はきっと当たります。" }
  ];
  const GACHA_COST = 100;

  let panelRef = null;

  /* ── checkBadges(trigger) — award newly-earned ───── */
  function checkBadges(trigger) {
    const u = Store.user;
    if (!u.badges) u.badges = [];
    let changed = false;
    for (const b of BADGES) {
      if (!u.badges.includes(b.id) && b.test(u)) {
        u.badges.push(b.id);
        changed = true;
        UI.toast("バッジ獲得！ " + b.name, { icon: b.icon, ms: 3200 });
        // notify center (P3) if available
        if (window.Notify && typeof window.Notify.push === "function") {
          window.Notify.push("badge", "バッジ獲得！", b.icon + " " + b.name + " を獲得しました", null);
        } else {
          // still record a notification so the badge history exists
          Store.addNotif({
            id: "n_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
            at: new Date().toISOString(), kind: "badge",
            title: "バッジ獲得！", body: b.icon + " " + b.name, reportId: null, read: false
          });
        }
      }
    }
    if (changed) {
      Store.saveUser();
      if (panelRef) refresh();
    }
    return changed;
  }

  /* ── open full-screen panel ──────────────────────── */
  function open() {
    const root = el("div", "prof-root");
    const card = el("div", "prof-card");
    root.appendChild(card);
    const ov = UI.overlay(root);
    panelRef = { ov, card };
    renderInto(card, ov);
    // tap backdrop closes
    root.addEventListener("click", e => { if (e.target === root) { ov.close(); panelRef = null; } });
  }

  function refresh() {
    if (panelRef) renderInto(panelRef.card, panelRef.ov);
  }

  function renderInto(card, ov) {
    const u = Store.user;
    const prog = Store.xpProgress();
    card.innerHTML = "";

    // close button
    const x = el("button", "prof-close", "✕");
    x.addEventListener("click", () => { ov.close(); panelRef = null; });
    card.appendChild(x);

    // header
    const head = el("div", "prof-head");
    head.appendChild(el("div", "prof-avatar", u.avatar || "😊"));
    const hm = el("div", "prof-head-meta");
    hm.appendChild(el("div", "prof-name", u.name || "パトロール隊員"));
    const medal = el("div", "prof-rank");
    medal.innerHTML = `<span class="prof-medal">🎖</span>${Store.rankName()}`;
    hm.appendChild(medal);
    head.appendChild(hm);
    card.appendChild(head);

    // level + xp bar
    const lvWrap = el("div", "prof-lv");
    const lvTop = el("div", "prof-lv-top");
    lvTop.innerHTML = `<span class="prof-lv-num">Lv.${prog.level}</span>` +
      (prog.level >= 20 ? `<span class="prof-xp-txt">MAX</span>` : `<span class="prof-xp-txt">${prog.cur} / ${prog.need} XP</span>`);
    lvWrap.appendChild(lvTop);
    const bar = el("div", "prof-xp-bar");
    const fill = el("div", "prof-xp-fill");
    fill.style.width = Math.round(prog.ratio * 100) + "%";
    bar.appendChild(fill);
    lvWrap.appendChild(bar);
    card.appendChild(lvWrap);

    // 3 stats
    const stats = el("div", "prof-stats");
    stats.appendChild(statCard("📝", u.totalReports || 0, "報告数"));
    stats.appendChild(statCard("🛠", u.repairedCount || 0, "修繕につながった"));
    stats.appendChild(statCard("🎟", u.points || 0, "所持チケット"));
    card.appendChild(stats);

    // badges
    card.appendChild(el("div", "prof-section-h", "獲得バッジ"));
    const grid = el("div", "prof-badge-grid");
    for (const b of BADGES) {
      const owned = (u.badges || []).includes(b.id);
      const cell = el("div", "prof-badge" + (owned ? " owned" : " locked"));
      cell.innerHTML = `<div class="prof-badge-ico">${owned ? b.icon : "🔒"}</div>` +
        `<div class="prof-badge-name">${owned ? b.name : "???"}</div>` +
        `<div class="prof-badge-cond">${owned ? "獲得済み" : b.cond}</div>`;
      grid.appendChild(cell);
    }
    card.appendChild(grid);

    // gacha
    card.appendChild(el("div", "prof-section-h", "ごほうびカプセル"));
    const gachaBox = el("div", "prof-gacha");
    gachaBox.innerHTML = `
      <div class="gacha-machine">
        <div class="gacha-dome"><div class="gacha-balls">🔴🟡🔵🟢</div></div>
        <div class="gacha-body"><div class="gacha-knob">🌀</div><div class="gacha-slot"></div></div>
      </div>`;
    const gachaBtn = el("button", "prof-gacha-btn");
    const can = (u.points || 0) >= GACHA_COST;
    gachaBtn.innerHTML = `カプセルをまわす <span class="gacha-cost">${GACHA_COST}🎟</span>`;
    gachaBtn.disabled = !can;
    if (!can) gachaBox.appendChild(el("div", "gacha-need", `あと ${GACHA_COST - (u.points || 0)}🎟 で挑戦できます`));
    gachaBtn.addEventListener("click", () => runGacha(gachaBox, gachaBtn));
    gachaBox.appendChild(gachaBtn);
    card.appendChild(gachaBox);

    // demo note
    card.appendChild(el("div", "prof-demo-note", "デモ版：景品は実在しないモックです。AI判定はシミュレーションです。"));
  }

  function statCard(ico, val, label) {
    const c = el("div", "prof-stat");
    c.innerHTML = `<div class="prof-stat-ico">${ico}</div><div class="prof-stat-val">${val}</div><div class="prof-stat-label">${label}</div>`;
    return c;
  }

  /* ── gacha animation ─────────────────────────────── */
  async function runGacha(box, btn) {
    const u = Store.user;
    if ((u.points || 0) < GACHA_COST) return;
    if (btn.disabled) return;
    btn.disabled = true;

    // spend
    Store.grantPoints(-GACHA_COST);
    u.gachaCount = (u.gachaCount || 0) + 1;
    Store.saveUser();

    const machine = box.querySelector(".gacha-machine");
    const knob = box.querySelector(".gacha-knob");
    machine.classList.add("cranking");
    if (knob) knob.classList.add("spin");

    // pick prize now
    const prize = PRIZES[Math.floor(Math.random() * PRIZES.length)];

    // capsule drop
    await wait(900);
    machine.classList.remove("cranking");
    const capsule = el("div", "gacha-capsule");
    capsule.textContent = "🥚";
    box.appendChild(capsule);
    requestAnimationFrame(() => capsule.classList.add("drop"));
    await wait(950);

    // open → prize card
    capsule.classList.add("open");
    await wait(300);
    capsule.remove();

    showPrize(box, prize);

    // badge for gacha
    checkBadges("gacha");

    // re-enable / refresh after a moment (points may now be < cost)
    setTimeout(() => { if (panelRef) refresh(); }, 2600);
  }

  function showPrize(box, prize) {
    const card = el("div", "gacha-prize " + (prize.tone === "lose" ? "lose" : "win"));
    card.innerHTML = `
      <div class="gacha-prize-ico">${prize.icon}</div>
      <div class="gacha-prize-name">${prize.name}</div>
      <div class="gacha-prize-flavor">${prize.flavor}</div>`;
    const ov = UI.overlay(wrapCenter(card));
    if (prize.tone !== "lose") UI.confettiBurst("post");
    const ok = el("button", "gacha-prize-ok", "受け取る");
    card.appendChild(ok);
    ok.addEventListener("click", () => ov.close());
    requestAnimationFrame(() => card.classList.add("in"));
  }

  function wrapCenter(node) {
    const w = el("div", "gacha-prize-wrap");
    w.appendChild(node);
    return w;
  }

  function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

  function init() {
    // header avatar chip is wired in app.js → calls Profile.open
  }

  window.Profile = { init, open, refresh, checkBadges, BADGES, PRIZES, GACHA_COST };
})();
