/* パとるロール — MapView (P2) */
/* Leaflet full-screen map: teardrop divIcons by AI category, heat layer, locate */
(function () {

  /* ── shared type metadata (exposed for post/detail/profile) ── */
  const TYPES = {
    crack:   { label: "ひび割れ", emoji: "⚡",  color: "#8a6cff" },
    pothole: { label: "陥没・段差", emoji: "🕳️", color: "#ff4d5e" },
    leak:    { label: "水漏れ跡", emoji: "💧",  color: "#1a8fe3" },
    other:   { label: "その他",   emoji: "❓",  color: "#6b7f8e" }
  };
  window.PR_TYPES = TYPES;

  /* tile source 一元定義(※ "basemaps" 複数形。post.js のミニマップも参照) */
  window.PR_TILE_URL = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
  window.PR_TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

  let map = null;
  let markerLayer = null;
  let heatLayer = null;
  let selfMarker = null;
  const markers = {};   // id -> L.marker

  /* ── teardrop SVG pin as divIcon ─────────────────── */
  function pinHTML(report) {
    const t = TYPES[report.type] || TYPES.other;
    const analyzing = report.status === "解析中" || !report.ai;
    const done = report.status === "修繕完了";
    let fill, emoji;
    if (analyzing) { fill = "#9bb3c0"; emoji = "⏳"; }
    else if (done) { fill = "#18b9c4"; emoji = "✅"; }
    else {
      fill = window.DemoAI ? DemoAI.colorFor(report.ai.score) : t.color;
      emoji = t.emoji;
    }
    const pulse = (!analyzing && !done && report.ai && report.ai.score >= 70 && report.status === "未対応");
    // 36×46 teardrop: circle head + pointed bottom
    const svg =
      `<svg width="36" height="46" viewBox="0 0 36 46" xmlns="http://www.w3.org/2000/svg">
        <path d="M18 45 C18 45 33 26 33 16 A15 15 0 1 0 3 16 C3 26 18 45 18 45 Z"
          fill="${fill}" stroke="#ffffff" stroke-width="3" stroke-linejoin="round"
          filter="url(#pinSh)"/>
        <defs><filter id="pinSh" x="-30%" y="-20%" width="160%" height="150%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(22,56,76,.35)"/>
        </filter></defs>
        <circle cx="18" cy="16" r="11" fill="rgba(255,255,255,.92)"/>
       </svg>`;
    return `<div class="pr-pin${pulse ? " pulse" : ""}">
        ${pulse ? '<span class="pr-pin-ring" style="--ring:' + fill + '"></span>' : ""}
        ${svg}
        <span class="pr-pin-emoji">${emoji}</span>
      </div>`;
  }

  function makeIcon(report) {
    return L.divIcon({
      className: "pr-pin-wrap",
      html: pinHTML(report),
      iconSize: [36, 46],
      iconAnchor: [18, 45],
      popupAnchor: [0, -42]
    });
  }

  /* ── init ────────────────────────────────────────── */
  function init(elId, center) {
    elId = elId || "map";
    center = center || (window.App && App.center) || { lat: 35.681236, lng: 139.767125 };
    if (map) return;

    map = L.map(elId, {
      zoomControl: false,
      attributionControl: true,
      tap: true
    }).setView([center.lat, center.lng], 16);

    // CARTO Voyager — attribution always visible.
    // 本番ではCARTOの商用タイル契約を確認すること。
    L.tileLayer(window.PR_TILE_URL, {
      attribution: window.PR_TILE_ATTR,
      subdomains: "abcd",
      maxZoom: 20,
      detectRetina: true,
      className: "pr-tiles"   // subtle game-like filter via CSS
    }).addTo(map);

    markerLayer = L.layerGroup().addTo(map);

    map.attributionControl.setPrefix("");

    Store.on("reports:change", () => refresh());
    refresh();
  }

  /* ── refresh all pins ────────────────────────────── */
  async function refresh() {
    if (!markerLayer) return;
    const reports = await Store.listReports();
    markerLayer.clearLayers();
    for (const k in markers) delete markers[k];
    for (const r of reports) {
      const m = L.marker([r.lat, r.lng], { icon: makeIcon(r), riseOnHover: true });
      m.on("click", () => { window.Detail?.open?.(r.id); });
      m.addTo(markerLayer);
      markers[r.id] = m;
    }
    if (heatLayer) await rebuildHeat();
  }

  /* ── focus + bounce one pin ──────────────────────── */
  async function focus(reportId) {
    const r = await Store.getReport(reportId);
    if (!r || !map) return;
    map.flyTo([r.lat, r.lng], Math.max(17, map.getZoom()), { duration: 0.7 });
    const doBounce = () => {
      const m = markers[reportId];
      if (!m) return;
      const node = m.getElement();
      if (node) {
        const pin = node.querySelector(".pr-pin");
        if (pin) {
          pin.classList.remove("drop", "bounce");
          // force reflow then add
          void pin.offsetWidth;
          pin.classList.add("bounce");
        }
      }
    };
    map.once("moveend", doBounce);
    setTimeout(doBounce, 750);
  }

  /* ── heat layer ──────────────────────────────────── */
  async function rebuildHeat() {
    const reports = await Store.listReports();
    const pts = reports
      .filter(r => r.ai && r.status !== "修繕完了")
      .map(r => [r.lat, r.lng, Math.max(0.15, r.ai.score / 100)]);
    if (heatLayer) {
      heatLayer.setLatLngs(pts);
    } else if (L.heatLayer) {
      heatLayer = L.heatLayer(pts, {
        radius: 28, blur: 22, maxZoom: 17,
        gradient: { 0.2: "#3ecf6e", 0.5: "#ffa726", 0.8: "#ff4d5e", 1: "#c20017" }
      });
    }
  }

  async function setHeat(on) {
    if (!map) return;
    if (on) {
      await rebuildHeat();
      if (heatLayer && !map.hasLayer(heatLayer)) heatLayer.addTo(map);
    } else if (heatLayer && map.hasLayer(heatLayer)) {
      map.removeLayer(heatLayer);
    }
  }

  /* ── locate (avatar chip marker) ─────────────────── */
  function locate() {
    if (!map) return;
    const center = (window.App && App.center) || { lat: 35.681236, lng: 139.767125 };
    const avatar = (window.Store && Store.user && Store.user.avatar) || "📍";
    if (!selfMarker) {
      const icon = L.divIcon({
        className: "pr-self-wrap",
        html: `<div class="pr-self"><span>${avatar}</span></div>`,
        iconSize: [44, 44],
        iconAnchor: [22, 22]
      });
      selfMarker = L.marker([center.lat, center.lng], { icon, interactive: false, zIndexOffset: 1000 });
      selfMarker.addTo(map);
    } else {
      selfMarker.setLatLng([center.lat, center.lng]);
    }
    map.flyTo([center.lat, center.lng], 16, { duration: 0.6 });
  }

  function getMap() { return map; }

  window.MapView = { init, refresh, focus, setHeat, locate, getMap, TYPES };
})();
