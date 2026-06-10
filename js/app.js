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

  window.App = App;
  document.addEventListener("DOMContentLoaded", boot);
})();
