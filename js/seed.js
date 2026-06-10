/* パとるロール — Seed (P1) */
(function () {

  /* ── canvas photo generation ──────────────────────── */
  function drawAsphalt(ctx, w, h) {
    // base gray
    ctx.fillStyle = "#555";
    ctx.fillRect(0, 0, w, h);
    // noise speckles
    const idata = ctx.getImageData(0, 0, w, h);
    const d = idata.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * 60;
      d[i]   = Math.max(0, Math.min(255, d[i]   + n));
      d[i+1] = Math.max(0, Math.min(255, d[i+1] + n));
      d[i+2] = Math.max(0, Math.min(255, d[i+2] + n));
    }
    ctx.putImageData(idata, 0, 0);

    // subtle aggregate stones
    for (let k = 0; k < 120; k++) {
      const rx = Math.random() * w;
      const ry = Math.random() * h;
      const rs = 3 + Math.random() * 7;
      const bright = 80 + Math.random() * 80;
      ctx.fillStyle = `rgba(${bright},${bright},${bright-10},0.25)`;
      ctx.beginPath();
      ctx.ellipse(rx, ry, rs, rs * 0.7, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawCrack(ctx, w, h, score) {
    const cx = w * 0.5, cy = h * 0.5;
    // main jagged crack polyline
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = Math.max(2, score / 15);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    let px = cx - w * 0.3, py = cy - h * 0.05;
    ctx.moveTo(px, py);
    const steps = 14;
    for (let i = 0; i < steps; i++) {
      px += (w * 0.6 / steps) + (Math.random() - 0.3) * 15;
      py += (Math.random() - 0.5) * 40;
      ctx.lineTo(px, py);
    }
    ctx.stroke();
    // secondary branch
    if (score > 50) {
      ctx.lineWidth = Math.max(1, score / 30);
      ctx.beginPath();
      const bx = cx - w * 0.05, by = cy + h * 0.05;
      ctx.moveTo(bx, by);
      for (let i = 0; i < 6; i++) {
        ctx.lineTo(bx + (Math.random() - 0.3) * 60, by + 20 + Math.random() * 30);
      }
      ctx.stroke();
    }
    // shadow fill under crack
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = Math.max(3, score / 10);
    ctx.filter = "blur(2px)";
    ctx.stroke();
    ctx.filter = "none";
  }

  function drawPothole(ctx, w, h, score) {
    const cx = w * 0.5, cy = h * 0.52;
    const rx = 60 + score * 0.8, ry = rx * 0.6;
    // dark hole
    const g = ctx.createRadialGradient(cx, cy, 5, cx, cy, rx);
    g.addColorStop(0, "#111");
    g.addColorStop(0.5, "#1e1e1e");
    g.addColorStop(0.8, "#333");
    g.addColorStop(1, "#555");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    // broken edge
    ctx.strokeStyle = "#888";
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    // depth shading
    const dg = ctx.createRadialGradient(cx - rx * 0.2, cy - ry * 0.2, 2, cx, cy, rx);
    dg.addColorStop(0, "rgba(255,255,255,0.08)");
    dg.addColorStop(1, "rgba(0,0,0,0.6)");
    ctx.fillStyle = dg;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawLeak(ctx, w, h, score) {
    const cx = w * 0.5, cy = h * 0.5;
    const spread = 80 + score * 1.2;
    // wet dark stain blob
    const g = ctx.createRadialGradient(cx, cy, 5, cx, cy + 20, spread);
    g.addColorStop(0, "rgba(30,60,80,0.75)");
    g.addColorStop(0.5, "rgba(40,80,110,0.4)");
    g.addColorStop(1, "rgba(60,100,130,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, spread * 0.8, spread, -0.3, 0, Math.PI * 2);
    ctx.fill();
    // irregular puddle edge
    ctx.beginPath();
    const pts = 18;
    for (let i = 0; i < pts; i++) {
      const angle = (i / pts) * Math.PI * 2;
      const r = (spread * 0.55) + (Math.random() - 0.5) * spread * 0.3;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r * 0.7;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(20,50,70,0.3)";
    ctx.fill();
    // wet sheen highlight
    const sheen = ctx.createLinearGradient(cx - 40, cy - 30, cx + 20, cy + 10);
    sheen.addColorStop(0, "rgba(255,255,255,0.18)");
    sheen.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = sheen;
    ctx.beginPath();
    ctx.ellipse(cx - 10, cy - 10, 40, 15, -0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawVignette(ctx, w, h) {
    const g = ctx.createRadialGradient(w/2, h/2, Math.min(w,h)*0.3, w/2, h/2, Math.max(w,h)*0.75);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.45)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  function makeCanvas(type, score, size) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    drawAsphalt(ctx, size, size);
    if (type === "crack")   drawCrack(ctx, size, size, score);
    else if (type === "pothole") drawPothole(ctx, size, size, score);
    else if (type === "leak")    drawLeak(ctx, size, size, score);
    else {
      // "other": draw a faint crack + partial wet stain
      drawCrack(ctx, size, size, Math.min(score, 50));
    }
    drawVignette(ctx, size, size);
    return canvas;
  }

  async function demoPhoto(type, score) {
    const canvas = makeCanvas(type, score, 1568);
    return new Promise(resolve => {
      canvas.toBlob(blob => resolve(blob), "image/jpeg", 0.72);
    });
  }

  function demoThumb(type, score) {
    const canvas = makeCanvas(type, score, 320);
    return canvas.toDataURL("image/jpeg", 0.6);
  }

  /* ── helpers ──────────────────────────────────────── */
  function rId() {
    return "r_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function randInRange(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function offsetLatLng(lat, lng, maxM) {
    const dlat = (Math.random() * 2 - 1) * (maxM / 111000);
    const dlng = (Math.random() * 2 - 1) * (maxM / (111000 * Math.cos(lat * Math.PI / 180)));
    return { lat: lat + dlat, lng: lng + dlng };
  }

  function daysAgo(d) {
    const dt = new Date(Date.now() - d * 86400000);
    return dt.toISOString();
  }

  const NAMES = ["ご近所さんA","ご近所さんB","ご近所さんC","通りすがりD","まちのE",
                  "パトロールF","G隊員","H調査員","I住民","J市民","K通学路の父","L商店主"];
  const TYPES = ["crack","pothole","leak","other"];

  /* ── main ensure ──────────────────────────────────── */
  async function ensure(center) {
    const existing = await Store.listReports();
    if (existing.length > 0) return;

    const { lat, lng } = center;

    // status distribution: 未対応12 / 現場確認6 / 修繕指示4 / 修繕完了6
    const statusPool = [
      ...Array(12).fill("未対応"),
      ...Array(6).fill("現場確認"),
      ...Array(4).fill("修繕指示"),
      ...Array(6).fill("修繕完了")
    ];
    // shuffle
    for (let i = statusPool.length - 1; i > 0; i--) {
      const j = randInRange(0, i);
      [statusPool[i], statusPool[j]] = [statusPool[j], statusPool[i]];
    }

    // score distribution: high(≥70) 8, mid(40-69) 12, low(<40) 8
    const scorePool = [
      ...Array(8).fill("high"),
      ...Array(12).fill("mid"),
      ...Array(8).fill("low")
    ];
    for (let i = scorePool.length - 1; i > 0; i--) {
      const j = randInRange(0, i);
      [scorePool[i], scorePool[j]] = [scorePool[j], scorePool[i]];
    }

    function makeScore(band) {
      if (band === "high") return randInRange(70, 95);
      if (band === "mid")  return randInRange(40, 69);
      return randInRange(15, 39);
    }

    function category(s) {
      if (s >= 70) return "要確認";
      if (s >= 40) return "経過観察";
      return "低リスク";
    }

    function aiForScore(type, score) {
      // Re-use DemoAI reason logic synchronously with a simplified pick
      const reasons = {
        crack: { high: "ひび割れ幅が拡大しており、路盤への浸水リスクがあります。前兆検知スコアが高く優先対応を推奨します。",
                 mid:  "ひび割れが進行中の可能性があります。段差形成前に経過を観察してください。",
                 low:  "微細なひび割れで現時点のリスクは低いです。定期観察を継続してください。" },
        pothole:{ high: "陥没・段差が顕著で二輪車転倒リスクがあります。早急な補修を推奨します。",
                  mid:  "段差が形成されており、雨水侵入での拡大が懸念されます。",
                  low:  "軽微なくぼみです。次回点検時に確認してください。" },
        leak:   { high: "雨天でないにもかかわらず路面が濡れており、地下漏水の前兆が強く疑われます。",
                  mid:  "雨天でない日の濡れ跡として記録価値があります。継続観察を推奨します。",
                  low:  "わずかな湿り気ですが、複数日の観察が推奨されます。" },
        other:  { high: "複合的なリスクが懸念されます。現地での詳細確認を推奨します。",
                  mid:  "中程度のリスクと推定されます。技術者の目視確認を推奨します。",
                  low:  "現時点でのリスクは低いと推定されます。定期観察を継続してください。" }
      };
      const band = score >= 70 ? "high" : score >= 40 ? "mid" : "low";
      const r = reasons[type] || reasons.other;
      return { score, category: category(score), reason: r[band], model: "demo-sim-1" };
    }

    const reports = [];

    // ── 定点ウォッチ クラスタ 1 (scores: 38→55→74) ──
    const c1 = offsetLatLng(lat, lng, 600);
    const cluster1Types = ["crack","crack","crack"];
    const cluster1Scores = [38, 55, 74];
    const cluster1Days = [42, 28, 14];
    for (let i = 0; i < 3; i++) {
      const pos = offsetLatLng(c1.lat, c1.lng, 25);
      const type = cluster1Types[i];
      const score = cluster1Scores[i];
      const status = i < 2 ? "修繕指示" : "未対応";
      const id = rId();
      const thumb = demoThumb(type, score);
      const blob = await demoPhoto(type, score);
      const r = {
        id, createdAt: daysAgo(cluster1Days[i]),
        lat: pos.lat, lng: pos.lng, type,
        comment: "ひび割れが広がってきた気がします",
        thumb, hasPhoto: true,
        ai: aiForScore(type, score),
        status,
        statusHistory: [{ status: "未対応", at: daysAgo(cluster1Days[i]), by: "AI" }],
        reporterId: "npc_c1", reporterName: "ご近所さんA", cheers: randInRange(0, 8)
      };
      if (status !== "未対応") r.statusHistory.push({ status, at: daysAgo(cluster1Days[i] - 2), by: "技術者" });
      await Store.savePhoto(id, blob);
      reports.push(r);
    }

    // ── 定点ウォッチ クラスタ 2 (scores: 31→47→63) ──
    const c2 = offsetLatLng(lat, lng, 800);
    const cluster2Types = ["leak","leak","leak"];
    const cluster2Scores = [31, 47, 63];
    const cluster2Days = [44, 30, 16];
    for (let i = 0; i < 3; i++) {
      const pos = offsetLatLng(c2.lat, c2.lng, 25);
      const type = cluster2Types[i];
      const score = cluster2Scores[i];
      const status = i < 2 ? "現場確認" : "未対応";
      const id = rId();
      const thumb = demoThumb(type, score);
      const blob = await demoPhoto(type, score);
      const r = {
        id, createdAt: daysAgo(cluster2Days[i]),
        lat: pos.lat, lng: pos.lng, type,
        comment: "雨でもないのに濡れている",
        thumb, hasPhoto: true,
        ai: aiForScore(type, score),
        status,
        statusHistory: [{ status: "未対応", at: daysAgo(cluster2Days[i]), by: "AI" }],
        reporterId: "npc_c2", reporterName: "ご近所さんB", cheers: randInRange(0, 5)
      };
      if (status !== "未対応") r.statusHistory.push({ status, at: daysAgo(cluster2Days[i] - 1), by: "技術者" });
      await Store.savePhoto(id, blob);
      reports.push(r);
    }

    // ── 残り22件 ──
    for (let i = 0; i < 22; i++) {
      const pos = offsetLatLng(lat, lng, 1200);
      const type = TYPES[randInRange(0, 3)];
      const score = makeScore(scorePool[i]);
      const status = statusPool[i];
      const daysBack = randInRange(1, 42);
      const id = rId();
      const thumb = demoThumb(type, score);
      const blob = await demoPhoto(type, score);
      const comments = [
        "","","通学路で子供が多い","深さがある","広がってきた","毎日通るので気になる",
        "車道なので危ない","うっすら濡れている","段差になっている","浅いがひびが見える"
      ];
      const comment = comments[randInRange(0, comments.length - 1)];
      const sh = [{ status: "未対応", at: daysAgo(daysBack), by: "AI" }];
      const steps = ["未対応","現場確認","修繕指示","修繕完了"];
      const curIdx = steps.indexOf(status);
      for (let s = 1; s <= curIdx; s++) {
        sh.push({ status: steps[s], at: daysAgo(daysBack - s * 3), by: "技術者" });
      }
      const r = {
        id, createdAt: daysAgo(daysBack),
        lat: pos.lat, lng: pos.lng, type, comment,
        thumb, hasPhoto: true,
        ai: aiForScore(type, score),
        status, statusHistory: sh,
        reporterId: "npc_" + (i + 1),
        reporterName: NAMES[i % NAMES.length],
        cheers: randInRange(0, 12)
      };
      await Store.savePhoto(id, blob);
      reports.push(r);
    }

    // store all
    for (const r of reports) {
      await Store.addReport(r);
    }
  }

  window.Seed = { ensure, demoPhoto, demoThumb };
})();
