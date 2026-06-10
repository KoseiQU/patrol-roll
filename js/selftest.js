/* パとるロール — SelfTest (P1) */
/* 実行: URL に ?selftest=1 を付けた時のみ app.js が SelfTest.run() を呼ぶ */
(function () {
  let pass = 0, fail = 0;

  function ok(label) {
    console.log("[selftest] PASS", label);
    pass++;
  }
  function ng(label, detail) {
    console.error("[selftest] FAIL", label, detail || "");
    fail++;
  }
  function assert(cond, label, detail) {
    cond ? ok(label) : ng(label, detail);
  }

  async function run() {
    pass = 0; fail = 0;
    console.log("[selftest] START");

    /* ── 1. Store CRUD roundtrip ────────────────────── */
    const testId = "r_selftest_" + Date.now().toString(36);
    const testReport = {
      id: testId,
      createdAt: new Date().toISOString(),
      lat: 35.681236, lng: 139.767125,
      type: "crack", comment: "selftest",
      thumb: "", hasPhoto: false,
      ai: null, status: "未対応",
      statusHistory: [{ status: "未対応", at: new Date().toISOString(), by: "AI" }],
      reporterId: "selftest", reporterName: "SelfTest", cheers: 0
    };
    await Store.addReport(testReport);
    const fetched = await Store.getReport(testId);
    assert(fetched && fetched.id === testId, "Store.addReport + getReport");

    await Store.updateReport(testId, { comment: "updated" });
    const updated = await Store.getReport(testId);
    assert(updated && updated.comment === "updated", "Store.updateReport");

    const all = await Store.listReports();
    assert(all.some(r => r.id === testId), "Store.listReports includes test record");

    // cleanup: delete test report
    await Store.deleteReport(testId);
    const afterDel = await Store.getReport(testId);
    assert(!afterDel, "Store.deleteReport cleanup");

    /* ── 2. Photo store ─────────────────────────────── */
    const testBlob = new Blob(["test"], { type: "image/jpeg" });
    await Store.savePhoto(testId, testBlob);
    const gotBlob = await Store.getPhoto(testId);
    assert(gotBlob !== null, "Store.savePhoto + getPhoto");
    await Store.deletePhoto(testId);

    /* ── 3. XP / level curve ────────────────────────── */
    // Save original user state
    const origUser = JSON.parse(JSON.stringify(Store.user));

    Store.user.xp = 0; Store.user.level = 1;
    // Lv1→2 needs 100 XP
    Store.user.xp = 99;
    const r1 = Store.grantXP(1);
    assert(Store.user.level === 2 && r1.leveled === true, "XP: Lv1→2 at 100xp");
    // Lv2→3 needs 160 XP
    Store.user.xp = 0; Store.user.level = 2;
    Store.user.xp = 159;
    const r2 = Store.grantXP(1);
    assert(Store.user.level === 3 && r2.leveled === true, "XP: Lv2→3 at 160xp");
    // xpProgress ratio
    Store.user.xp = 50; Store.user.level = 1;
    const prog = Store.xpProgress();
    assert(prog.need === 100 && Math.abs(prog.ratio - 0.5) < 0.01, "Store.xpProgress Lv1 50/100");

    // restore
    Object.assign(Store.user, origUser);
    Store.saveUser();

    /* ── 4. DemoAI score ranges + category consistency ── */
    const types = ["crack","pothole","leak","other"];
    for (const type of types) {
      for (let trial = 0; trial < 5; trial++) {
        const res = await DemoAI.analyze({ type, comment: "", lat: 35.68, lng: 139.77, photoBlob: null });
        const scoreOk = res.score >= 0 && res.score <= 100;
        const catOk = ["要確認","経過観察","低リスク"].includes(res.category);
        const catScore = (res.score >= 70 && res.category === "要確認") ||
                         (res.score >= 40 && res.score < 70 && res.category === "経過観察") ||
                         (res.score < 40 && res.category === "低リスク");
        const hasReason = typeof res.reason === "string" && res.reason.length > 10;
        const modelOk = res.model === "demo-sim-1";
        assert(scoreOk, `DemoAI score 0-100 [${type}#${trial}]`, res.score);
        assert(catOk, `DemoAI category valid [${type}#${trial}]`, res.category);
        assert(catScore, `DemoAI category matches score [${type}#${trial}]`, `score=${res.score} cat=${res.category}`);
        assert(hasReason, `DemoAI reason present [${type}#${trial}]`);
        assert(modelOk, `DemoAI model name [${type}#${trial}]`);
      }
    }

    /* ── 5. Seed count + cluster presence ───────────── */
    const reports = await Store.listReports();
    // Seed generates 28 total (3+3+22)
    assert(reports.length >= 24, "Seed count ≥24", reports.length);

    // Cluster 1: crack reports from npc_c1 with scores 38, 55, 74
    const c1 = reports.filter(r => r.reporterId === "npc_c1");
    assert(c1.length === 3, "Cluster1 has 3 reports", c1.length);
    const c1scores = c1.map(r => r.ai && r.ai.score).sort((a,b) => a-b);
    assert(c1scores[0] === 38 && c1scores[1] === 55 && c1scores[2] === 74,
      "Cluster1 scores 38→55→74", c1scores.join(","));

    // Cluster 2: leak reports from npc_c2 with scores 31, 47, 63
    const c2 = reports.filter(r => r.reporterId === "npc_c2");
    assert(c2.length === 3, "Cluster2 has 3 reports", c2.length);
    const c2scores = c2.map(r => r.ai && r.ai.score).sort((a,b) => a-b);
    assert(c2scores[0] === 31 && c2scores[1] === 47 && c2scores[2] === 63,
      "Cluster2 scores 31→47→63", c2scores.join(","));

    /* ── 6. Notification unread count ───────────────── */
    const testNotifId = "n_selftest_" + Date.now().toString(36);
    await Store.addNotif({ id: testNotifId, at: new Date().toISOString(),
      kind: "info", title: "テスト", body: "自己テスト通知", reportId: null, read: false });
    const unread0 = Store.unreadCount;
    assert(unread0 > 0, "Notif unreadCount > 0 after add", unread0);
    await Store.markNotifRead(testNotifId);
    const unread1 = Store.unreadCount;
    assert(unread1 === unread0 - 1, "Notif unreadCount decremented after markRead", unread1);
    // cleanup: mark all read then verify — we don't wipe real notifs
    const allNotifs = await Store.listNotifs();
    const testNotif = allNotifs.find(n => n.id === testNotifId);
    assert(testNotif && testNotif.read === true, "Notif markNotifRead sets read=true");

    /* ── done ────────────────────────────────────────── */
    console.log(`[selftest] DONE pass=${pass} fail=${fail}`);
    if (fail === 0) {
      console.log("%c[selftest] ALL PASS ✓", "color:green;font-weight:bold");
    } else {
      console.warn(`%c[selftest] ${fail} FAILURE(S)`, "color:red;font-weight:bold");
    }
  }

  window.SelfTest = { run };
})();
