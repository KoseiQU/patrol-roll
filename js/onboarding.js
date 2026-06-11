/* パとるロール — Onboarding (P2) */
/* 3 slides → nickname + avatar → geolocation permission → resolve */
(function () {

  function el(t, c, h) { return UI.el(t, c, h); }

  const SLIDES = [
    { emoji: "🗺", title: "まちをパトロール", body: "道路のひび割れや段差を、ゲーム感覚でみんなで見守りましょう。", art: "slide-map" },
    { emoji: "🤖", title: "撮って送るだけ", body: "気になる場所を撮影すると、AIが危険度を判定します。", art: "slide-ai" },
    { emoji: "🛠", title: "まちが、直る", body: "あなたの報告が技術者に届き、補修につながります。\n※デモ版：AI判定はシミュレーションです（本番は Claude Haiku 4.5 を想定）。", art: "slide-fix" }
  ];

  const AVATARS = ["😊", "😎", "🐱", "🐶", "🦊", "🐻", "🐼", "🦁", "🐸", "🐧", "🦉", "🦄"];

  function show() {
    return new Promise(resolve => {
      const root = el("div", "ob-root");
      const card = el("div", "ob-card");
      root.appendChild(card);
      const ov = UI.overlay(root);

      let idx = 0;
      let nickname = "";
      let avatar = AVATARS[0];

      function renderSlide() {
        const s = SLIDES[idx];
        card.innerHTML = "";
        card.classList.remove("ob-form-mode");

        const art = el("div", "ob-art " + s.art, `<span class="ob-art-emoji">${s.emoji}</span>`);
        card.appendChild(art);

        const body = el("div", "ob-slide-body");
        body.appendChild(el("h1", "ob-title", s.title));
        const p = el("p", "ob-text");
        p.textContent = s.body;
        body.appendChild(p);
        card.appendChild(body);

        const dots = el("div", "ob-dots");
        SLIDES.forEach((_, i) => {
          const d = el("span", "ob-dot" + (i === idx ? " on" : ""));
          dots.appendChild(d);
        });
        card.appendChild(dots);

        const nav = el("div", "ob-nav");
        if (idx > 0) {
          const back = el("button", "ob-back", "戻る");
          back.addEventListener("click", () => { idx--; renderSlide(); });
          nav.appendChild(back);
        } else {
          nav.appendChild(el("div", "ob-spacer"));
        }
        const next = el("button", "ob-next", idx < SLIDES.length - 1 ? "次へ →" : "はじめる →");
        next.addEventListener("click", () => {
          if (idx < SLIDES.length - 1) { idx++; renderSlide(); }
          else renderForm();
        });
        nav.appendChild(next);
        card.appendChild(nav);

        animateIn(card);
      }

      function renderForm() {
        card.innerHTML = "";
        card.classList.add("ob-form-mode");

        card.appendChild(el("div", "ob-art slide-name", `<span class="ob-art-emoji">${avatar}</span>`));
        const avatarBig = card.querySelector(".ob-art-emoji");

        const body = el("div", "ob-slide-body");
        body.appendChild(el("h1", "ob-title", "プロフィール設定"));
        body.appendChild(el("p", "ob-text", "ニックネームとアバターを選んでください。"));
        card.appendChild(body);

        const label1 = el("label", "ob-label", "ニックネーム");
        card.appendChild(label1);
        const input = el("input", "ob-input");
        input.type = "text";
        input.maxLength = 16;
        input.placeholder = "例: みまもり太郎";
        input.value = nickname;
        card.appendChild(input);

        card.appendChild(el("label", "ob-label", "アバター"));
        const grid = el("div", "ob-avatar-grid");
        AVATARS.forEach(a => {
          const b = el("button", "ob-avatar" + (a === avatar ? " sel" : ""), a);
          b.addEventListener("click", () => {
            grid.querySelectorAll(".ob-avatar").forEach(x => x.classList.remove("sel"));
            b.classList.add("sel");
            avatar = a;
            if (avatarBig) avatarBig.textContent = a;
          });
          grid.appendChild(b);
        });
        card.appendChild(grid);

        const start = el("button", "ob-next ob-start", "📍 位置情報を使ってはじめる");
        card.appendChild(start);
        const skipGeo = el("button", "ob-skip", "位置情報なしで続ける");
        card.appendChild(skipGeo);

        input.addEventListener("input", () => { nickname = input.value; });

        start.addEventListener("click", () => finish(true));
        skipGeo.addEventListener("click", () => finish(false));

        animateIn(card);
        setTimeout(() => input.focus(), 200);
      }

      function finish(requestGeo) {
        const name = (nickname || "").trim();
        Store.user.name = name || "パトロール隊員";
        Store.user.avatar = avatar;
        Store.saveUser();
        Store.settings.onboarded = true;
        Store.saveSettings();

        const done = () => { ov.close(); resolve(); };

        if (requestGeo && navigator.geolocation) {
          // Trigger the browser permission prompt now. app.js will read the
          // real position afterward (with its own 3s timeout), so we resolve
          // quickly regardless of the user's choice.
          let settled = false;
          const finishOnce = () => { if (!settled) { settled = true; done(); } };
          const tid = setTimeout(finishOnce, 8000); // safety: user ignoring prompt
          navigator.geolocation.getCurrentPosition(
            pos => { clearTimeout(tid); Store.settings.center = { lat: pos.coords.latitude, lng: pos.coords.longitude }; Store.saveSettings(); finishOnce(); },
            () => { clearTimeout(tid); finishOnce(); },
            { timeout: 7000 }
          );
        } else {
          done();
        }
      }

      function animateIn(node) {
        node.classList.remove("ob-in");
        void node.offsetWidth;
        node.classList.add("ob-in");
      }

      renderSlide();
    });
  }

  window.Onboarding = { show, AVATARS };
})();
