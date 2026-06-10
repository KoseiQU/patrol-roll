/* パとるロール — Store (P1) */
/* IndexedDB "patrol-roll" v1: reports, photos, notifs */
(function () {
  const DB_NAME = "patrol-roll";
  const DB_VER = 1;

  /* ── defaults ─────────────────────────────────────── */
  const DEFAULT_USER = {
    name: "パトロール隊員",
    avatar: "😊",
    xp: 0, level: 1, points: 0,
    totalReports: 0, repairedCount: 0,
    badges: [], typesPosted: [], gachaCount: 0
  };
  const DEFAULT_SETTINGS = {
    mode: "citizen", onboarded: false, center: null, geoDenied: false
  };

  /* ── pub/sub ──────────────────────────────────────── */
  const _listeners = {};
  function on(event, cb) {
    (_listeners[event] = _listeners[event] || []).push(cb);
  }
  function emit(event, detail) {
    (_listeners[event] || []).forEach(cb => { try { cb(detail); } catch (e) { console.error(e); } });
  }

  /* ── IndexedDB bootstrap ──────────────────────────── */
  let _db = null;
  let _memReports = [];
  let _memPhotos = {};
  let _memNotifs = [];
  let volatile = false;

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("reports")) {
          const rs = db.createObjectStore("reports", { keyPath: "id" });
          rs.createIndex("createdAt", "createdAt");
        }
        if (!db.objectStoreNames.contains("photos")) {
          db.createObjectStore("photos", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("notifs")) {
          const ns = db.createObjectStore("notifs", { keyPath: "id" });
          ns.createIndex("at", "at");
        }
      };
      req.onsuccess = e => resolve(e.target.result);
      req.onerror = e => reject(e.target.error);
    });
  }

  function tx(store, mode, fn) {
    if (volatile) return Promise.resolve(fn(null));
    return new Promise((resolve, reject) => {
      const t = _db.transaction(store, mode);
      const s = t.objectStore(store);
      const req = fn(s);
      if (req && req.onsuccess !== undefined) {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      } else {
        t.oncomplete = () => resolve(req ? req.result : undefined);
        t.onerror = () => reject(t.error);
      }
    });
  }

  /* ── user / settings from localStorage ───────────── */
  function loadUser() {
    try {
      const raw = localStorage.getItem("pr_user");
      return raw ? Object.assign({}, DEFAULT_USER, JSON.parse(raw)) : Object.assign({}, DEFAULT_USER);
    } catch { return Object.assign({}, DEFAULT_USER); }
  }
  function loadSettings() {
    try {
      const raw = localStorage.getItem("pr_settings");
      return raw ? Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw)) : Object.assign({}, DEFAULT_SETTINGS);
    } catch { return Object.assign({}, DEFAULT_SETTINGS); }
  }

  /* ── level / XP math ─────────────────────────────── */
  // XP needed to go from level n → n+1 = 100 + 60*(n-1)
  function xpProgress() {
    const u = Store.user;
    const n = u.level;
    if (n >= 20) return { level: n, cur: u.xp, need: 0, ratio: 1 };
    const need = 100 + 60 * (n - 1);
    const cur = u.xp;
    return { level: n, cur, need, ratio: Math.min(1, cur / need) };
  }

  function rankName() {
    const lv = Store.user.level;
    if (lv >= 15) return "伝説のインフラ守護神";
    if (lv >= 10) return "まちの見守り隊長";
    if (lv >= 7)  return "ベテラン調査員";
    if (lv >= 4)  return "パトロール隊員";
    return "みならい隊員";
  }

  function grantXP(amount) {
    const u = Store.user;
    u.xp += amount;
    let leveled = false;
    while (u.level < 20) {
      const need = 100 + 60 * (u.level - 1);
      if (u.xp >= need) { u.xp -= need; u.level++; leveled = true; }
      else break;
    }
    Store.saveUser();
    return leveled ? { leveled: true, level: u.level } : { leveled: false };
  }

  function grantPoints(amount) {
    Store.user.points += amount;
    Store.saveUser();
  }

  /* ── unreadCount ──────────────────────────────────── */
  let unreadCount = 0;

  /* ── public API ───────────────────────────────────── */
  async function init() {
    Store.user = loadUser();
    Store.settings = loadSettings();
    try {
      _db = await openDB();
    } catch (e) {
      console.warn("[Store] IndexedDB unavailable, using memory fallback:", e);
      volatile = true;
      Store.volatile = true;
    }
    // preload unread count
    const notifs = await listNotifs();
    unreadCount = notifs.filter(n => !n.read).length;
    Store.unreadCount = unreadCount;
  }

  function saveUser() {
    try { localStorage.setItem("pr_user", JSON.stringify(Store.user)); } catch { }
    emit("user:change", Store.user);
  }

  function saveSettings() {
    try { localStorage.setItem("pr_settings", JSON.stringify(Store.settings)); } catch { }
    emit("settings:change", Store.settings);
  }

  async function addReport(report) {
    if (volatile) {
      _memReports.push(report);
    } else {
      await tx("reports", "readwrite", s => s.put(report));
    }
    emit("reports:change", report);
    return report;
  }

  async function updateReport(id, patch) {
    const report = await getReport(id);
    if (!report) return null;
    Object.assign(report, patch);
    if (volatile) {
      const idx = _memReports.findIndex(r => r.id === id);
      if (idx >= 0) _memReports[idx] = report;
    } else {
      await tx("reports", "readwrite", s => s.put(report));
    }
    emit("reports:change", report);
    return report;
  }

  async function listReports() {
    if (volatile) {
      return [..._memReports].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    return new Promise((resolve, reject) => {
      const t = _db.transaction("reports", "readonly");
      const s = t.objectStore("reports");
      const req = s.getAll();
      req.onsuccess = () => {
        const arr = (req.result || []).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        resolve(arr);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function getReport(id) {
    if (volatile) return _memReports.find(r => r.id === id) || null;
    return tx("reports", "readonly", s => s.get(id));
  }

  async function deleteReport(id) {
    if (volatile) {
      _memReports = _memReports.filter(r => r.id !== id);
      return;
    }
    await tx("reports", "readwrite", s => s.delete(id));
  }

  async function savePhoto(id, blob) {
    if (volatile) { _memPhotos[id] = blob; return; }
    await tx("photos", "readwrite", s => s.put({ id, blob }));
  }

  async function getPhoto(id) {
    if (volatile) return _memPhotos[id] || null;
    const rec = await tx("photos", "readonly", s => s.get(id));
    return rec ? rec.blob : null;
  }

  async function deletePhoto(id) {
    if (volatile) { delete _memPhotos[id]; return; }
    await tx("photos", "readwrite", s => s.delete(id));
  }

  async function addNotif(n) {
    if (volatile) { _memNotifs.push(n); }
    else { await tx("notifs", "readwrite", s => s.put(n)); }
    if (!n.read) { Store.unreadCount = (Store.unreadCount || 0) + 1; }
    emit("notifs:change", n);
  }

  async function listNotifs() {
    let arr;
    if (volatile) {
      arr = [..._memNotifs];
    } else {
      arr = await new Promise((resolve, reject) => {
        const t = _db.transaction("notifs", "readonly");
        const req = t.objectStore("notifs").getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    }
    arr.sort((a, b) => b.at.localeCompare(a.at));
    Store.unreadCount = arr.filter(n => !n.read).length;
    return arr;
  }

  async function markNotifRead(idOrAll) {
    const arr = await listNotifs();
    const toUpdate = idOrAll === "all" ? arr.filter(n => !n.read) : arr.filter(n => n.id === idOrAll && !n.read);
    for (const n of toUpdate) {
      n.read = true;
      if (volatile) {
        const i = _memNotifs.findIndex(x => x.id === n.id);
        if (i >= 0) _memNotifs[i] = n;
      } else {
        await tx("notifs", "readwrite", s => s.put(n));
      }
    }
    Store.unreadCount = (await listNotifs()).filter(n => !n.read).length;
    emit("notifs:change", null);
  }

  async function resetAll() {
    if (volatile) {
      _memReports = []; _memPhotos = {}; _memNotifs = [];
    } else {
      await tx("reports", "readwrite", s => s.clear());
      await tx("photos", "readwrite", s => s.clear());
      await tx("notifs", "readwrite", s => s.clear());
    }
    localStorage.removeItem("pr_user");
    localStorage.removeItem("pr_settings");
    Store.user = Object.assign({}, DEFAULT_USER);
    Store.settings = Object.assign({}, DEFAULT_SETTINGS);
    Store.unreadCount = 0;
    emit("reports:change", null);
    emit("notifs:change", null);
    emit("user:change", Store.user);
    emit("settings:change", Store.settings);
  }

  /* ── expose ───────────────────────────────────────── */
  window.Store = {
    volatile: false,
    user: null,
    settings: null,
    unreadCount: 0,
    init,
    saveUser, saveSettings,
    addReport, updateReport, listReports, getReport, deleteReport,
    savePhoto, getPhoto, deletePhoto,
    addNotif, listNotifs, markNotifRead,
    resetAll,
    grantXP, grantPoints,
    xpProgress, rankName,
    on, emit
  };
})();
