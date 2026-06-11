/* パとるロール — Settings (P3) */
/* ⚙️ボタン → ボトムシート: モード切替 / 通知 / リセット / このアプリについて */
(function () {

  function el(t, c, h) { return UI.el(t, c, h); }

  function init() {
    // nothing to bind at init; app.js wires btn-settings to Settings.open
  }

  function open() {
    const body = el("div", "cfg-body");

    /* ── モード切替 ── */
    const modeSection = el("div", "cfg-section");
    modeSection.appendChild(el("div", "cfg-section-title", "利用モード"));

    const modeDesc = el("div", "cfg-mode-desc",
      App.mode === "engineer"
        ? "技術者モード: 全報告のスコア一覧・ステータス管理・ヒートマップが使えます。"
        : "市民モード: 異常を撮影・報告し、まちをパトロールします。");

    const seg = el("div", "cfg-seg");
    const citizenBtn = el("button", "cfg-seg-btn" + (App.mode === "citizen" ? " active" : ""), "🏃 市民");
    const engBtn = el("button", "cfg-seg-btn" + (App.mode === "engineer" ? " active" : ""), "🛠 技術者");

    citizenBtn.addEventListener("click", () => {
      if (App.mode === "citizen") return;
      App.setMode("citizen");
      citizenBtn.classList.add("active");
      engBtn.classList.remove("active");
      modeDesc.textContent = "市民モード: 異常を撮影・報告し、まちをパトロールします。";
      sh.close();
    });
    engBtn.addEventListener("click", () => {
      if (App.mode === "engineer") return;
      App.setMode("engineer");
      engBtn.classList.add("active");
      citizenBtn.classList.remove("active");
      modeDesc.textContent = "技術者モード: 全報告のスコア一覧・ステータス管理・ヒートマップが使えます。";
      sh.close();
    });

    seg.appendChild(citizenBtn);
    seg.appendChild(engBtn);
    modeSection.appendChild(seg);
    modeSection.appendChild(modeDesc);
    body.appendChild(modeSection);

    /* ── Web通知 ── */
    const notifSection = el("div", "cfg-section");
    notifSection.appendChild(el("div", "cfg-section-title", "Web通知"));

    const notifRow = el("div", "cfg-notif-row");
    const notifStatus = el("span", "cfg-notif-status", _notifStatusText());
    const notifBtn = el("button", "cfg-notif-btn", "通知を許可する");

    if (!window.Notification || Notification.permission === "granted") {
      notifBtn.style.display = "none";
    }
    notifBtn.addEventListener("click", async () => {
      try {
        const perm = await Notification.requestPermission();
        notifStatus.textContent = _notifStatusText();
        if (perm === "granted") {
          notifBtn.style.display = "none";
          UI.toast("通知が許可されました！", { icon: "🔔" });
        } else {
          UI.toast("通知は許可されませんでした", { icon: "⚠️" });
        }
      } catch (e) {
        UI.toast("お使いのブラウザでは通知がサポートされていません", { icon: "ℹ️" });
      }
    });

    notifRow.appendChild(notifStatus);
    notifRow.appendChild(notifBtn);
    notifSection.appendChild(notifRow);
    body.appendChild(notifSection);

    /* ── デモデータをリセット ── */
    const resetSection = el("div", "cfg-section");
    resetSection.appendChild(el("div", "cfg-section-title", "デモデータ"));
    const resetBtn = el("button", "cfg-reset-btn", "🗑 デモデータをリセット");
    resetBtn.addEventListener("click", async () => {
      const ok = confirm("全ての報告・通知・進捗がリセットされます。よろしいですか？");
      if (!ok) return;
      await Store.resetAll();
      location.reload();
    });
    resetSection.appendChild(resetBtn);
    body.appendChild(resetSection);

    /* ── このアプリについて ── */
    const aboutSection = el("div", "cfg-section");
    aboutSection.appendChild(el("div", "cfg-section-title", "このアプリについて"));
    const aboutCard = el("div", "cfg-about-card");
    aboutCard.innerHTML = `
      <div class="cfg-about-row"><span class="cfg-about-label">バージョン</span><span>v0.1-demo</span></div>
      <div class="cfg-about-divider"></div>
      <div class="cfg-about-note">
        <b>デモ版注記</b><br>
        ・AI危険度判定はシミュレーションです（本番は Claude Haiku 4.5 を想定）。<br>
        ・すべてのデータはこの端末内(IndexedDB/localStorage)にのみ保存されます。サーバーには送信されません。<br>
        ・地図タイルは CARTO Voyager（デモ用途）。本番では商用タイル契約が必要です。
      </div>
      <div class="cfg-about-divider"></div>
      <div class="cfg-about-row cfg-about-credit">
        <span>パとるロール デモ版</span>
        <span class="cfg-about-ver">市民参加型インフラ点検PWA</span>
      </div>`;
    aboutSection.appendChild(aboutCard);
    body.appendChild(aboutSection);

    const sh = UI.sheet({ title: "⚙️ 設定", bodyEl: body });
  }

  function _notifStatusText() {
    if (!window.Notification) return "このブラウザでは通知を使えません";
    const p = Notification.permission;
    if (p === "granted") return "✅ 通知が許可されています";
    if (p === "denied") return "🚫 通知がブロックされています（ブラウザ設定で変更してください）";
    return "🔕 通知はまだ許可されていません";
  }

  window.Settings = { init, open };
})();
