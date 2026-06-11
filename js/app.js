/* パとるロール — App bootstrap (P1) */
/* P2/P3 が配線を追加していく */
(function () {
  const TOKYO = { lat: 35.681236, lng: 139.767125 };

  const App = {
    center: TOKYO,
    get mode() { return Store.settings.mode; },
    setMode(m) {
      Store.settings.mode = m;
      Store.saveSettings();
      document.body.classList.toggle("mode-engineer", m === "engineer");
      window.MapView?.refresh();
      window.Dashboard?.render?.();
    }
  };

  async function getLocation() {
    return new Promise(resolve => {
      if (!navigator.geolocation) return resolve(null);
      const tid = setTimeout(() => resolve(null), 3000);
      navigator.geolocation.getCurrentPosition(
        pos => { clearTimeout(tid); resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
        ()  => { clearTimeout(tid); resolve(null); }
      );
    });
  }

  async function boot() {
    await Store.init();

    if (Store.volatile) {
      window.UI?.toast?.("プライベートモードのためデータは保存されません", { icon: "⚠️", ms: 5000 });
    }

    // onboarding (P2 fills Onboarding.show)
    if (!Store.settings.onboarded) {
      await window.Onboarding?.show?.();
    }

    // geolocation with 3s timeout
    const loc = await getLocation();
    if (loc) {
      App.center = loc;
      Store.settings.center = loc;
    } else {
      if (navigator.geolocation) {
        Store.settings.geoDenied = true;
        Store.saveSettings();
        // show geo-denied banner (P2 implements the element)
        const banner = document.getElementById("geo-banner");
        if (banner) banner.hidden = false;
        document.body.classList.add("has-banner");
      }
    }

    // seed demo data
    await Seed.ensure(App.center);

    // init map (P2)
    await window.MapView?.init?.("map", App.center);

    // bind UI modules (P2/P3 will fill these)
    window.Profile?.init?.();
    window.Post?.init?.();
    window.Notify?.init?.();
    window.Dashboard?.init?.();
    window.Settings?.init?.();

    // P2: render citizen home chrome (avatar chip / FAB / quick actions / legend)
    bindChrome();

    // mode class
    document.body.classList.toggle("mode-engineer", App.mode === "engineer");

    // selftest
    if (location.search.includes("selftest=1")) {
      SelfTest.run().catch(e => console.error("[selftest] ERROR", e));
    }

    // service worker (not on file://)
    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      navigator.serviceWorker.register("sw.js").catch(e => console.warn("[SW] registration failed", e));
    }
  }

  /* ── P2: citizen home chrome ───────────────────────── */
  function bindChrome() {
    renderAvatarChip();
    renderFab();
    renderQuickActions();
    renderLegend();
    // keep avatar chip live as XP/level changes
    Store.on("user:change", renderAvatarChip);
  }

  function renderAvatarChip() {
    const host = document.getElementById("avatar-chip");
    if (!host) return;
    const u = Store.user;
    const prog = Store.xpProgress();
    const ring = Math.round(prog.ratio * 360);
    host.innerHTML = "";
    const chip = document.createElement("button");
    chip.className = "av-chip";
    chip.setAttribute("aria-label", "プロフィール");
    chip.innerHTML =
      `<span class="av-ring" style="background:conic-gradient(var(--c-accent) ${ring}deg, #d8e8ef ${ring}deg)">
         <span class="av-emoji">${u.avatar || "😊"}</span>
       </span>
       <span class="av-meta">
         <span class="av-lv">Lv.${prog.level}</span>
         <span class="av-xpbar"><span class="av-xpfill" style="width:${Math.round(prog.ratio * 100)}%"></span></span>
       </span>`;
    chip.addEventListener("click", () => window.Profile?.open?.());
    host.appendChild(chip);
  }

  function renderFab() {
    const host = document.getElementById("fab-main");
    if (!host) return;
    host.innerHTML = "";
    const btn = document.createElement("button");
    btn.className = "fab-cam";
    btn.setAttribute("aria-label", "報告する");
    btn.innerHTML = `<span class="fab-cam-emoji">📸</span>`;
    btn.addEventListener("click", () => window.Post?.open?.());
    host.appendChild(btn);

    // show "タップで報告" label for the first 3 app opens
    try {
      const seen = Number(localStorage.getItem("pr_fab_hint") || "0");
      if (seen < 3) {
        const label = document.createElement("div");
        label.className = "fab-label";
        label.textContent = "タップで報告";
        host.appendChild(label);
        localStorage.setItem("pr_fab_hint", String(seen + 1));
      }
    } catch (e) {}
  }

  function renderQuickActions() {
    bindQuick("btn-locate", "📍", "現在地", () => window.MapView?.locate?.());
    bindQuick("btn-my-reports", "🗒", "マイ報告", openMyReports);
    bindQuick("btn-settings", "⚙️", "設定", () => window.Settings?.open?.());
  }

  function bindQuick(id, emoji, label, fn) {
    const host = document.getElementById(id);
    if (!host) return;
    host.innerHTML = "";
    const b = document.createElement("button");
    b.className = "qa-btn";
    b.setAttribute("aria-label", label);
    b.innerHTML = `<span>${emoji}</span>`;
    b.addEventListener("click", fn);
    host.appendChild(b);
  }

  async function openMyReports() {
    const all = await Store.listReports();
    const mine = all.filter(r => r.reporterId === "me");
    const body = document.createElement("div");
    body.className = "myrep-list";
    if (mine.length === 0) {
      body.innerHTML = `<div class="myrep-empty">
        <div class="myrep-empty-ico">📭</div>
        <div>まだ報告がありません。</div>
        <div class="myrep-empty-sub">下の📸ボタンから最初の報告をしてみましょう！</div>
      </div>`;
    } else {
      mine.forEach(r => {
        const row = document.createElement("button");
        row.className = "myrep-row";
        const tm = (window.PR_TYPES || {})[r.type] || { label: r.type, emoji: "❓" };
        const score = r.ai ? r.ai.score : null;
        const color = (score != null && window.DemoAI) ? DemoAI.colorFor(score) : "#9bb3c0";
        row.innerHTML =
          `<img class="myrep-thumb" src="${r.thumb || ""}" alt="">
           <div class="myrep-info">
             <div class="myrep-top"><span class="myrep-type">${tm.emoji} ${tm.label}</span>
               <span class="myrep-score" style="background:${color}">${score != null ? score : "…"}</span></div>
             <div class="myrep-bottom">${UI.timeAgo(r.createdAt)}・${r.status}</div>
           </div>`;
        row.addEventListener("click", () => { sh.close(); window.Detail?.open?.(r.id); });
        body.appendChild(row);
      });
    }
    const sh = UI.sheet({ title: "🗒 あなたの報告", bodyEl: body });
  }

  function renderLegend() {
    const host = document.getElementById("legend-chip");
    if (!host) return;
    host.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "legend collapsed";
    wrap.innerHTML =
      `<button class="legend-toggle" aria-label="凡例">🗂</button>
       <div class="legend-items">
         <span class="legend-item"><span class="legend-dot" style="background:var(--c-danger)"></span>要確認</span>
         <span class="legend-item"><span class="legend-dot" style="background:var(--c-warn)"></span>経過観察</span>
         <span class="legend-item"><span class="legend-dot" style="background:var(--c-ok)"></span>低リスク</span>
       </div>`;
    wrap.querySelector(".legend-toggle").addEventListener("click", () => {
      wrap.classList.toggle("collapsed");
    });
    host.appendChild(wrap);
  }

  window.App = App;
  document.addEventListener("DOMContentLoaded", boot);
})();
