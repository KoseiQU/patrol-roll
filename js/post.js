/* パとるロール — Post wizard + AI-scan reveal (P2) */
/* The signature moment: 3-step wizard → AI scan animation → score reveal → rewards */
(function () {

  function el(t, c, h) { return UI.el(t, c, h); }
  function types() { return window.PR_TYPES || {}; }

  const HINT_CHIPS = ["深さがある", "通学路です", "広がってきた"];
  const SCAN_HINTS = [
    "ひび割れの幅を推定しています…",
    "過去の報告と照合しています…",
    "雨天データと照合しています…",
    "段差の深さを解析しています…",
    "周辺の地盤情報を確認しています…"
  ];

  /* ── image resize: long edge to maxPx, JPEG ──────── */
  function resizeImage(srcBlobOrFile, maxPx, quality) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(srcBlobOrFile);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(canvas);
      };
      img.onerror = e => { URL.revokeObjectURL(url); reject(e); };
      img.src = url;
    });
  }
  function canvasToBlob(canvas, q) {
    return new Promise(res => canvas.toBlob(b => res(b), "image/jpeg", q));
  }

  /* ── wizard state ────────────────────────────────── */
  let state = null;
  let ov = null;

  function reset() {
    if (state && state.previewUrl) { try { URL.revokeObjectURL(state.previewUrl); } catch (e) {} }
    if (state && state.miniMap) { try { state.miniMap.remove(); } catch (e) {} }
    state = {
      step: 1,
      fullBlob: null,   // 1568px JPEG Blob
      thumb: null,      // 320px dataURL
      previewUrl: null, // object URL for preview <img>
      type: null,
      comment: "",
      lat: null, lng: null,
      miniMap: null, miniMarker: null,
      submitting: false
    };
  }

  /* ── open wizard ─────────────────────────────────── */
  function open() {
    reset();
    const center = (window.App && App.center) || { lat: 35.681236, lng: 139.767125 };
    state.lat = center.lat; state.lng = center.lng;

    const root = el("div", "post-root");
    root.innerHTML = `
      <div class="post-card">
        <div class="post-topbar">
          <button class="post-close" aria-label="閉じる">✕</button>
          <div class="post-steps">
            <span class="post-dot on" data-s="1"></span>
            <span class="post-dot" data-s="2"></span>
            <span class="post-dot" data-s="3"></span>
          </div>
          <div style="width:36px"></div>
        </div>
        <div class="post-stage"></div>
      </div>`;
    ov = UI.overlay(root);

    root.querySelector(".post-close").addEventListener("click", close);
    state.stage = root.querySelector(".post-stage");
    state.dots = root.querySelectorAll(".post-dot");
    renderStep(1);
  }

  function close() {
    if (ov) ov.close();
    if (state && state.previewUrl) { try { URL.revokeObjectURL(state.previewUrl); } catch (e) {} }
    if (state && state.miniMap) { try { state.miniMap.remove(); } catch (e) {} state.miniMap = null; }
    ov = null;
  }

  function setStep(n) {
    state.step = n;
    state.dots.forEach(d => d.classList.toggle("on", Number(d.dataset.s) <= n));
  }

  function swapStage(node) {
    state.stage.innerHTML = "";
    node.classList.add("post-enter");
    state.stage.appendChild(node);
    requestAnimationFrame(() => node.classList.add("post-enter-in"));
  }

  /* ── STEP 1: photo ───────────────────────────────── */
  function renderStep(n) {
    if (n === 1) renderPhotoStep();
    else if (n === 2) renderTypeStep();
    else if (n === 3) renderLocationStep();
  }

  function renderPhotoStep() {
    setStep(1);
    const box = el("div", "post-step");
    box.appendChild(el("h2", "post-h", "📸 写真を撮ろう"));
    box.appendChild(el("p", "post-sub", "気になる場所をパチリ。AIが危険度を判定します。"));

    const preview = el("div", "post-preview");
    if (state.thumb) {
      const img = el("img", "post-preview-img");
      img.src = state.previewUrl || state.thumb;
      preview.appendChild(img);
      preview.classList.add("has");
    } else {
      preview.innerHTML = `<div class="post-preview-empty"><span class="post-cam-emoji">📷</span><span>写真がここに表示されます</span></div>`;
    }
    box.appendChild(preview);

    // hidden file inputs
    const camIn = el("input"); camIn.type = "file"; camIn.accept = "image/*"; camIn.setAttribute("capture", "environment"); camIn.style.display = "none";
    const libIn = el("input"); libIn.type = "file"; libIn.accept = "image/*"; libIn.style.display = "none";
    box.appendChild(camIn); box.appendChild(libIn);

    const btns = el("div", "post-photo-btns");
    const bCam = el("button", "post-pbtn", `<span>📷</span>撮影する`);
    const bLib = el("button", "post-pbtn", `<span>🖼</span>ライブラリ`);
    const bDemo = el("button", "post-pbtn demo", `<span>🎨</span>デモ写真を使う`);
    btns.appendChild(bCam); btns.appendChild(bLib); btns.appendChild(bDemo);
    box.appendChild(btns);

    const next = el("button", "post-next", "次へ →");
    next.disabled = !state.fullBlob;
    box.appendChild(next);

    bCam.addEventListener("click", () => camIn.click());
    bLib.addEventListener("click", () => libIn.click());
    const onFile = async (inp) => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      await acceptPhotoFile(f, preview, next);
    };
    camIn.addEventListener("change", () => onFile(camIn));
    libIn.addEventListener("change", () => onFile(libIn));
    bDemo.addEventListener("click", () => acceptDemoPhoto(preview, next));

    next.addEventListener("click", () => { if (state.fullBlob) renderStep(2); });
    swapStage(box);
  }

  async function acceptPhotoFile(file, preview, next) {
    preview.classList.add("loading");
    preview.innerHTML = `<div class="post-preview-empty"><span class="post-spin">⏳</span><span>読み込み中…</span></div>`;
    try {
      const fullCanvas = await resizeImage(file, 1568, 0.72);
      const thumbCanvas = await resizeImage(file, 320, 0.6);
      state.fullBlob = await canvasToBlob(fullCanvas, 0.72);
      state.thumb = thumbCanvas.toDataURL("image/jpeg", 0.6);
      if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
      state.previewUrl = URL.createObjectURL(state.fullBlob);
      showPreview(preview, state.previewUrl, next);
    } catch (e) {
      console.error(e);
      UI.toast("写真の読み込みに失敗しました", { icon: "⚠️" });
      preview.classList.remove("loading");
      preview.innerHTML = `<div class="post-preview-empty"><span class="post-cam-emoji">📷</span><span>もう一度お試しください</span></div>`;
    }
  }

  async function acceptDemoPhoto(preview, next) {
    preview.classList.add("loading");
    preview.innerHTML = `<div class="post-preview-empty"><span class="post-spin">🎨</span><span>デモ写真を生成中…</span></div>`;
    try {
      // pick a plausible type/score for the demo art (final score comes from analyze())
      const tkeys = Object.keys(types());
      const demoType = state.type || tkeys[Math.floor(Math.random() * tkeys.length)];
      const demoScore = 40 + Math.floor(Math.random() * 50);
      state.fullBlob = await Seed.demoPhoto(demoType, demoScore);
      state.thumb = Seed.demoThumb(demoType, demoScore);
      state._demoType = demoType; // gentle hint for step 2 preselect
      if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
      state.previewUrl = URL.createObjectURL(state.fullBlob);
      showPreview(preview, state.previewUrl, next);
    } catch (e) {
      console.error(e);
      UI.toast("デモ写真の生成に失敗しました", { icon: "⚠️" });
    }
  }

  function showPreview(preview, url, next) {
    preview.classList.remove("loading");
    preview.classList.add("has");
    preview.innerHTML = "";
    const img = el("img", "post-preview-img");
    img.src = url;
    preview.appendChild(img);
    const badge = el("div", "post-preview-ok", "✓ 準備OK");
    preview.appendChild(badge);
    next.disabled = false;
    next.classList.add("ready");
  }

  /* ── STEP 2: type + comment ──────────────────────── */
  function renderTypeStep() {
    setStep(2);
    const box = el("div", "post-step");
    box.appendChild(el("h2", "post-h", "🔎 どんな異常?"));
    box.appendChild(el("p", "post-sub", "いちばん近いものを選んでください。"));

    const grid = el("div", "post-type-grid");
    const T = types();
    Object.keys(T).forEach(key => {
      const t = T[key];
      const chip = el("button", "post-type-chip");
      chip.dataset.type = key;
      chip.style.setProperty("--tc", t.color);
      chip.innerHTML = `<span class="post-type-emoji">${t.emoji}</span><span class="post-type-label">${t.label}</span>`;
      if (state.type === key || (!state.type && state._demoType === key)) {
        chip.classList.add("sel");
        state.type = key;
      }
      chip.addEventListener("click", () => {
        grid.querySelectorAll(".post-type-chip").forEach(c => c.classList.remove("sel"));
        chip.classList.add("sel");
        state.type = key;
        next.disabled = false;
      });
      grid.appendChild(chip);
    });
    box.appendChild(grid);

    box.appendChild(el("label", "post-label", "ひとことメモ（任意）"));
    const ta = el("textarea", "post-textarea");
    ta.placeholder = "例: 雨でもないのに濡れている";
    ta.value = state.comment || "";
    ta.addEventListener("input", () => { state.comment = ta.value; });
    box.appendChild(ta);

    const chipRow = el("div", "post-hint-chips");
    HINT_CHIPS.forEach(h => {
      const c = el("button", "post-hint-chip", "＋ " + h);
      c.addEventListener("click", () => {
        const cur = ta.value.trim();
        ta.value = cur ? (cur + " " + h) : h;
        state.comment = ta.value;
        ta.focus();
      });
      chipRow.appendChild(c);
    });
    box.appendChild(chipRow);

    const nav = el("div", "post-nav");
    const back = el("button", "post-back", "← 戻る");
    const next = el("button", "post-next", "次へ →");
    next.disabled = !state.type;
    nav.appendChild(back); nav.appendChild(next);
    box.appendChild(nav);

    back.addEventListener("click", () => renderStep(1));
    next.addEventListener("click", () => { if (state.type) renderStep(3); });
    swapStage(box);
  }

  /* ── STEP 3: location confirm with mini-map ──────── */
  function renderLocationStep() {
    setStep(3);
    const box = el("div", "post-step");
    box.appendChild(el("h2", "post-h", "📍 場所の確認"));
    box.appendChild(el("p", "post-sub", "ピンをドラッグして微調整できます。"));

    const mapEl = el("div", "post-minimap");
    mapEl.id = "post-minimap-" + Date.now();
    box.appendChild(mapEl);

    const nav = el("div", "post-nav");
    const back = el("button", "post-back", "← 戻る");
    const submit = el("button", "post-submit", "この場所で報告する 🚀");
    nav.appendChild(back); nav.appendChild(submit);
    box.appendChild(nav);

    back.addEventListener("click", () => {
      if (state.miniMap) { try { state.miniMap.remove(); } catch (e) {} state.miniMap = null; }
      renderStep(2);
    });
    submit.addEventListener("click", () => doSubmit(submit));

    swapStage(box);

    // init mini-map after it's in the DOM
    setTimeout(() => initMiniMap(mapEl.id), 60);
  }

  function initMiniMap(id) {
    try {
      const m = L.map(id, { zoomControl: true, attributionControl: false, tap: true })
        .setView([state.lat, state.lng], 17);
      L.tileLayer(window.PR_TILE_URL, {
        subdomains: "abcd", maxZoom: 20, className: "pr-tiles"
      }).addTo(m);
      const icon = L.divIcon({
        className: "post-pin-wrap",
        html: `<div class="post-drag-pin">📍</div>`,
        iconSize: [40, 40], iconAnchor: [20, 38]
      });
      const marker = L.marker([state.lat, state.lng], { icon, draggable: true }).addTo(m);
      marker.on("dragend", () => {
        const p = marker.getLatLng();
        state.lat = p.lat; state.lng = p.lng;
      });
      // tap map to move pin
      m.on("click", e => {
        marker.setLatLng(e.latlng);
        state.lat = e.latlng.lat; state.lng = e.latlng.lng;
      });
      state.miniMap = m; state.miniMarker = marker;
      setTimeout(() => m.invalidateSize(), 80);
    } catch (e) { console.warn("[post] minimap init failed", e); }
  }

  /* ── SUBMIT → save → AI scan reveal ──────────────── */
  async function doSubmit(btn) {
    if (state.submitting) return;       // 二重送信防止
    state.submitting = true;
    btn.disabled = true;
    btn.classList.add("loading");
    btn.textContent = "送信中…";

    const id = "r_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const report = {
      id,
      createdAt: new Date().toISOString(),
      lat: state.lat, lng: state.lng,
      type: state.type,
      comment: state.comment || "",
      thumb: state.thumb || "",
      hasPhoto: !!state.fullBlob,
      ai: null,
      status: "解析中",
      statusHistory: [{ status: "解析中", at: new Date().toISOString(), by: "AI" }],
      reporterId: "me",
      reporterName: (Store.user && Store.user.name) || "あなた",
      cheers: 0
    };

    try {
      if (state.fullBlob) await Store.savePhoto(id, state.fullBlob);
      await Store.addReport(report);
    } catch (e) {
      console.error(e);
      UI.toast("保存に失敗しました", { icon: "⚠️" });
      state.submitting = false; btn.disabled = false; btn.classList.remove("loading");
      btn.textContent = "この場所で報告する 🚀";
      return;
    }

    // clean up mini-map before swapping to scan view
    if (state.miniMap) { try { state.miniMap.remove(); } catch (e) {} state.miniMap = null; }

    runScanReveal(report);
  }

  /* ── AI scan animation + reveal sequence ─────────── */
  async function runScanReveal(report) {
    const box = el("div", "post-step scan-step");
    const card = el("div", "scan-card");
    const img = el("img", "scan-img");
    img.src = state.previewUrl || state.thumb || "";
    card.appendChild(img);
    card.appendChild(el("div", "scan-line"));
    card.appendChild(el("div", "scan-radar"));
    card.appendChild(el("div", "scan-grid"));
    box.appendChild(card);

    const hint = el("div", "scan-hint", SCAN_HINTS[0]);
    box.appendChild(hint);
    const dots = el("div", "scan-dots", "● ● ●");
    box.appendChild(dots);
    swapStage(box);

    // rotate hint texts
    let hi = 0;
    const rot = setInterval(() => {
      hi = (hi + 1) % SCAN_HINTS.length;
      hint.classList.add("fade");
      setTimeout(() => { hint.textContent = SCAN_HINTS[hi]; hint.classList.remove("fade"); }, 180);
    }, 900);

    // call the (simulated) AI
    let ai;
    try {
      ai = await DemoAI.analyze({ type: report.type, comment: report.comment, lat: report.lat, lng: report.lng, photoBlob: state.fullBlob });
    } catch (e) {
      ai = { score: 50, category: "経過観察", reason: "解析に問題が発生しました。", model: "demo-sim-1" };
    }
    clearInterval(rot);

    // persist AI result + flip status to 未対応
    const at = new Date().toISOString();
    await Store.updateReport(report.id, {
      ai,
      status: "未対応",
      statusHistory: [
        { status: "解析中", at: report.createdAt, by: "AI" },
        { status: "未対応", at, by: "AI" }
      ]
    });

    revealResult(report, ai);
  }

  /* ── reveal score + category + reason + rewards ──── */
  async function revealResult(report, ai) {
    const T = types();
    const tm = T[report.type] || T.other;
    const danger = ai.score >= 70;

    const box = el("div", "post-step result-step");

    // category stamp (slams in)
    const stamp = el("div", "result-stamp " + bandClass(ai.score));
    stamp.textContent = ai.category;

    const ringWrap = el("div", "result-ring-wrap");
    const ring = UI.scoreRing(ai.score, 156);
    ringWrap.appendChild(ring);
    box.appendChild(ringWrap);
    box.appendChild(stamp);

    const reasonBox = el("div", "result-reason");
    box.appendChild(reasonBox);

    // reward strip (slides in later)
    const reward = el("div", "result-reward");
    reward.innerHTML = `<span class="rw-xp">+50 XP</span><span class="rw-sep">/</span><span class="rw-pt">+10 🎟</span>`;
    box.appendChild(reward);

    const cta = el("div", "result-cta");
    const mapBtn = el("button", "post-next big", "🗺 地図で見る");
    cta.appendChild(mapBtn);
    box.appendChild(cta);

    swapStage(box);

    // 1) score count up
    if (ring._num) UI.countUp(ring._num, ai.score, 900);

    // 2) category stamp slam after a beat
    setTimeout(() => {
      stamp.classList.add("in");
      if (danger) {
        flashRed();
        box.classList.add("shake");
        navigatorVibrate();
      }
    }, 700);

    // 3) typewriter reason
    setTimeout(() => typewriter(reasonBox, ai.reason, 16), 1150);

    // 4) reward strip + grants
    setTimeout(async () => {
      reward.classList.add("in");
      UI.confettiBurst("post");

      // update user counters
      Store.user.totalReports = (Store.user.totalReports || 0) + 1;
      if (!Store.user.typesPosted.includes(report.type)) Store.user.typesPosted.push(report.type);
      // track hunter (要確認) discoveries
      if (ai.category === "要確認") Store.user._hunterCount = (Store.user._hunterCount || 0) + 1;
      Store.saveUser();

      Store.grantPoints(10);
      const lvl = Store.grantXP(50);

      // badges
      window.Profile?.checkBadges?.("post");

      if (lvl && lvl.leveled) {
        setTimeout(() => levelUpOverlay(lvl.level), 350);
      }
    }, 1700);

    mapBtn.addEventListener("click", () => {
      const id = report.id;
      close();
      window.MapView?.focus?.(id);
    });
  }

  /* ── helpers for reveal ──────────────────────────── */
  function bandClass(s) { return s >= 70 ? "danger" : s >= 40 ? "warn" : "ok"; }

  function flashRed() {
    const f = el("div", "result-flash");
    document.body.appendChild(f);
    requestAnimationFrame(() => f.classList.add("on"));
    setTimeout(() => { f.classList.remove("on"); setTimeout(() => f.remove(), 300); }, 220);
  }

  function navigatorVibrate() {
    try { if (navigator.vibrate) navigator.vibrate([30, 40, 30]); } catch (e) {}
  }

  function typewriter(node, text, speed) {
    if (UI.prefersReduced()) { node.textContent = text; return; }
    node.textContent = "";
    let i = 0;
    const tick = () => {
      if (i <= text.length) {
        node.textContent = text.slice(0, i);
        i++;
        setTimeout(tick, speed);
      }
    };
    tick();
  }

  function levelUpOverlay(level) {
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

  function init() {
    // nothing to bind here; app.js wires the FAB to Post.open
  }

  window.Post = { init, open, close, resizeImage };
})();
