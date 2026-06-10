# パとるロール — デモ版 設計書(実装契約)

市民参加型インフラ点検プラットフォーム「パとるロール」の **$0 静的デモ版**。
元の要件定義書(AWS + Anthropic API 構成)から、サーバー・API・認証・課金要素を全て除去し、
**1台のスマホ/PCのブラウザ内で完結する PWA** として三層ループ(市民→AI→技術者)を体験できるようにする。

この文書が唯一の仕様。実装エージェントはここに書かれた契約(ファイル所有・モジュールAPI・データ型)から逸脱しないこと。

---

## 0. 絶対条件

- **$0 運用**: ビルド不要・npm不要・サーバー不要・APIキー不要。静的ファイルのみ。CDN(jsDelivr / Google Fonts / CARTOタイル)と端末内ストレージだけで動く。
- **AI判定はシミュレーション**(`js/ai.js`)。UI上は「AI解析」として演出するが、設定画面とオンボーディングに「デモ版:AI判定はシミュレーションです(本番は Claude Haiku 4.5 を想定)」と明記。
- **データは端末内のみ**(IndexedDB + localStorage)。位置情報を URL パラメータに載せない(元要件 3.3 の遵守)。
- **ポケモンGO風の体験**: 全画面マップが主役。丸く・明るく・チャンキーなUI。投稿→スコア判明を「ガチャ的な快感」に演出。
- スマホ(iOS Safari / Android Chrome)優先、PCでも崩れない。日本語UI。
- ES modules 不使用。**全JSは classic script で `window.X` にグローバル公開**(`<script>` を index.html で順番に読む)。フレームワーク不使用(vanilla JS)。

## 1. 元要件 → デモ版の対応

| 元要件(PDF) | デモ版での実装 |
|---|---|
| AWS Lambda + API Gateway + DynamoDB | なし。`js/store.js`(IndexedDB)が代替 |
| S3 画像保存 | IndexedDB に Blob 保存(長辺1568pxへクライアントリサイズは元要件どおり実施) |
| Anthropic API (Haiku 4.5) スコアリング | `js/ai.js` のルールベース疑似AI(遅延1.2〜2.4s演出、JSON `{score, category, reason}` 互換) |
| Cognito 認証・ロール分離 | ニックネームのみ。市民⇔技術者はモード切替(設定画面) |
| プッシュ通知 | アプリ内通知センター(+許可があれば Web Notification API も発火) |
| 投稿の地図即時反映 / 色分け(赤橙緑) | そのまま実装 |
| 技術者ダッシュボード(スコア順・ヒートマップ・ステータス管理・時系列追跡) | そのまま実装(同一端末内) |
| 実績・ランク・ポイント抽選 | そのまま実装(抽選はカプセルトイ演出のモック) |

## 2. 技術スタック(CDN は jsDelivr 固定)

- Leaflet 1.9.4: `https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js` + 同 `leaflet.css`
- leaflet.heat: `https://cdn.jsdelivr.net/npm/leaflet.heat@0.2.0/dist/leaflet-heat.js`
- canvas-confetti 1.9.3: `https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js`
- フォント: Google Fonts「M PLUS Rounded 1c」(weights 500,700,800)。fallback: `"Hiragino Maru Gothic ProN", "BIZ UDGothic", sans-serif`
- 地図タイル: CARTO Voyager `https://{s}.basemap.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png`
  attribution: `&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>`(attribution は常時表示。本番ではタイル契約要確認、とコード内コメント)

## 3. ファイル構成と所有権

```
patrol-roll/
  index.html            … P1で骨格、P2/P3が拡張
  manifest.webmanifest  … P1
  sw.js                 … P1
  README.md             … P1で雛形、P3で完成
  DESIGN.md             … 本書(編集禁止)
  icons/ icon-192.png icon-512.png icon-maskable-512.png apple-touch-icon.png … P1
  tools/make_icons.py   … P1(アイコン生成スクリプト)
  css/theme.css         … P1(デザイントークンのみ)
  css/app.css           … P2(全コンポーネントのスタイル。P3は末尾にダッシュボード分を追記)
  js/store.js  js/ai.js  js/seed.js  js/selftest.js  js/app.js … P1(app.jsはP2/P3が配線を拡張)
  js/ui.js  js/map.js  js/post.js  js/detail.js  js/profile.js  js/onboarding.js … P2
  js/notify.js  js/dashboard.js  js/settings.js … P3
```

- P1 = フェーズ1エージェント(エンジン層) / P2 = フェーズ2(市民UI) / P3 = フェーズ3(技術者UI+通知)。
- 後フェーズは前フェーズのファイルを **壊さず拡張**(関数追加・index.htmlへの要素追加は可、契約済みAPIのシグネチャ変更は不可)。
- `<script>` 読み込み順: leaflet → heat → confetti → store → ai → seed → ui → map → post → detail → profile → onboarding → notify → dashboard → settings → selftest → app (defer なし、body末尾)。P1時点で未作成のファイルの `<script>` タグも **最初から全部書いておく**(404になるとエラーになるため、P1では空ファイルとして全JSファイルを `// placeholder` で作成しておく)。

## 4. データモデル

```js
// Report
{
  id: "r_" + Date.now().toString(36) + ランダム4文字,
  createdAt: ISO8601文字列,
  lat: Number, lng: Number,
  type: "crack" | "pothole" | "leak" | "other",
  comment: String,           // 任意・空文字可
  thumb: String,             // dataURL JPEG 長辺320px(一覧・ピン用に Report 内へ直接保持)
  hasPhoto: Boolean,         // フル画像(長辺1568px JPEG Blob)は IndexedDB の photos ストアに id で保存
  ai: null | { score: 0-100整数, category: "要確認"|"経過観察"|"低リスク", reason: String, model: "demo-sim-1" },
  status: "解析中" | "未対応" | "現場確認" | "修繕指示" | "修繕完了",
  statusHistory: [{ status, at: ISO, by: "AI"|"技術者" }],
  reporterId: String,        // 自分は "me"、シードは "npc_1" など
  reporterName: String,
  cheers: Number             // 「なおして!」応援数(ローカル)
}

// User (localStorage "pr_user")
{ name, avatar /*絵文字1つ*/, xp, level, points, totalReports, repairedCount,
  badges: [badgeId,...], typesPosted: [type,...], gachaCount: Number }

// Notification (IndexedDB notifs ストア)
{ id, at: ISO, kind: "repair_done"|"status"|"badge"|"levelup"|"info",
  title, body, reportId: String|null, read: Boolean }

// Settings (localStorage "pr_settings")
{ mode: "citizen"|"engineer", onboarded: Boolean, center: {lat,lng}|null, geoDenied: Boolean }
```

- type のラベル/絵文字/基準色: crack=ひび割れ/⚡/#8a6cff、pothole=陥没・段差/🕳️/#ff4d5e、leak=水漏れ跡/💧/#1a8fe3、other=その他/❓/#6b7f8e
- カテゴリ⇔スコア: score≥70 → 要確認(色 `--c-danger`)、40–69 → 経過観察(`--c-warn`)、<40 → 低リスク(`--c-ok`)。ピンの色は **AIカテゴリの色**(typeの色はアイコン背景等の副次利用)。

## 5. モジュール契約(グローバルAPI)

### Store (js/store.js) — P1
```js
await Store.init()                      // IndexedDB "patrol-roll" v1: stores reports, photos, notifs
Store.user / Store.settings             // 読み込み済みオブジェクト(直接参照可)
Store.saveUser() / Store.saveSettings() // localStorage へ永続化 + "user:change"/"settings:change" emit
await Store.addReport(report)           // 保存して "reports:change" emit、reportを返す
await Store.updateReport(id, patch)     // statusHistory の追記は呼び出し側で patch に含める
await Store.listReports()               // createdAt 降順の配列
await Store.getReport(id)
await Store.savePhoto(id, blob) / await Store.getPhoto(id)  // Blob|null
await Store.addNotif(n) / await Store.listNotifs() / await Store.markNotifRead(id|"all") // "notifs:change" emit
Store.unreadCount                       // 数値(listNotifs/markNotifRead 時に更新)
Store.on(event, cb) / Store.emit(event, detail)   // 素朴な pub/sub
await Store.resetAll()                  // 全消去(設定の「デモをリセット」用)
Store.grantXP(amount) / Store.grantPoints(amount) // user更新+saveUser。levelup したら {leveled:true, level} を返す
```
- IndexedDB が開けない環境(iOS プライベートモード等)は **メモリ内フォールバック** にして `Store.volatile=true`。
- レベル曲線: レベル n→n+1 に必要XP = `100 + 60*(n-1)`、上限 Lv20。`Store.xpProgress()` が `{level, cur, need, ratio}` を返す。
- ランク(レベル連動): 1–3 みならい隊員 / 4–6 パトロール隊員 / 7–9 ベテラン調査員 / 10–14 まちの見守り隊長 / 15+ 伝説のインフラ守護神。`Store.rankName()`。

### DemoAI (js/ai.js) — P1
```js
await DemoAI.analyze({type, comment, lat, lng, photoBlob}) // 1.2〜2.4秒後に resolve
  // → { score, category, reason, model:"demo-sim-1" }
DemoAI.colorFor(scoreOrCategory)  // CSS変数名でなく実色文字列を返す
```
- スコア算定: type基礎値(pothole 55–88 / leak 50–82 / crack 30–68 / other 20–58 の範囲で乱数)
  + コメントキーワード補正(「深」「大き」「広が」「車道」「通学」「学校」「毎日」「雨でもないのに」「濡れ」각+4〜12、「小さ」「浅」「うっすら」−8)。0–100にクランプ。
- reason は日本語2〜3文のテンプレ(type×スコア帯で最低 12 パターン)+「前兆検知」観点(ひび割れ幅・段差・雨天でない濡れ跡=漏水疑い)を必ず織り込む。文末に優先度の根拠1文。
- 乱数シードは不要(毎回変わってよい)。

### Seed (js/seed.js) — P1
```js
await Seed.ensure(center)        // reports が0件のときだけ約28件を center 半径1.2km に生成
await Seed.demoPhoto(type, score) // Canvas でアスファルト質感+ひび/穴/濡れ跡のイラスト風JPEG Blob(長辺1568)を生成
Seed.demoThumb(type, score)       // 同様に 320px dataURL を返す(demoPhotoと同じ絵柄でなくてよい)
```
- シード内訳: 状態は 未対応12 / 現場確認6 / 修繕指示4 / 修繕完了6。スコア帯は 高8 / 中12 / 低8 程度に分散。reporterName は「ご近所さんA」等の偽名。createdAt は過去6週間に分散。
- **定点ウォッチ用クラスタを2つ**含める: 同一地点(±25m)に3件、createdAt が約2週おき、スコアが 38→55→74 / 31→47→63 と悪化していく系列。
- 写真は全件 `demoPhoto` 産(thumb も生成して格納)。

### SelfTest (js/selftest.js) — P1
- `location.search` に `selftest=1` がある時だけ `app.js` が `SelfTest.run()` を呼ぶ。
- console に `[selftest] PASS …` / `FAIL …` を出力: Store CRUD、XP/レベル曲線、DemoAI のスコア範囲とカテゴリ整合(各type×5回)、Seed件数と定点クラスタ存在、通知の未読カウント。最後に `[selftest] DONE pass=N fail=M`。

### App (js/app.js) — P1作成、P2/P3拡張
```js
App.center               // {lat,lng}。geolocation成功なら現在地、失敗/拒否なら東京駅 {lat:35.681236, lng:139.767125}
App.mode                 // Store.settings.mode の参照
App.setMode("citizen"|"engineer")  // body class "mode-engineer" 切替 + 各UIの再描画
```
- 起動順: `Store.init()` → (未オンボードなら `Onboarding.show()` を await) → 位置取得(3秒タイムアウト) → `Seed.ensure(App.center)` → `MapView.init()` → 各UI bind → selftest判定 → SW登録(localhostでも登録するが、同一オリジンは network-first なので開発を阻害しない)。
- P1時点では MapView 等が未実装のため、`window.MapView?.init` のようにオプショナル呼び出しで骨格だけ作る。

### UI (js/ui.js) — P2
```js
UI.toast(msg, {icon, ms})
UI.sheet({title, bodyEl|html, onClose}) → {close()}   // 下からのボトムシート(ドラッグで閉じれる必要はない。×ボタンと背景タップで閉)
UI.overlay(el) → {close()}                            // 全画面オーバーレイ(投稿フロー・演出用)
UI.countUp(el, to, ms)                                // 数字カウントアップ
UI.scoreRing(score, sizePx) → SVG要素                  // 円形ゲージ。色はカテゴリ色
UI.confettiBurst(kind)                                // "post"|"levelup"|"repair" で強さ違い
UI.timeAgo(iso) → "3分前" / "2日前"
UI.statusBadge(status) → span要素
```

### MapView (js/map.js) — P2
```js
MapView.init(elId, center)
MapView.refresh()                 // Store から全件読み直しピン再描画(reports:change を購読して自動でも可)
MapView.focus(reportId)           // パン+ズーム+該当ピンをバウンス
MapView.setHeat(bool)             // leaflet.heat レイヤ(intensity=score/100, radius 28)
MapView.locate()                  // 現在地へパン(自機マーカー=アバター絵文字の丸チップ)
```
- ピン: `L.divIcon` の SVG ティアドロップ(36×46px、白縁3px、カテゴリ色塗り、中に type絵文字 16px)。`解析中` は灰色+⏳。`修繕完了` はティール+✅。score≥70 の未対応ピンには CSS パルス輪。
- ピンタップ → `Detail.open(id)`。
- zoomControl: false。タイルには `filter: saturate(1.15) hue-rotate(-8deg)` 程度の軽い加工で明るいゲーム調に(やり過ぎ禁止、可読性優先)。

### Post (js/post.js) — P2
- FAB(📷)→ 全画面オーバーレイの3ステップウィザード:
  1. 写真: 「📷 撮影する」(`<input type=file accept=image/* capture=environment>`) / 「🖼 ライブラリ」 / 「🎨 デモ写真を使う」(Seed.demoPhoto)。選択後プレビュー。**長辺1568pxへリサイズ**(canvas, JPEG q0.72)+320pxサムネ生成。
  2. 種類(4チップ・絵文字付き)+ひとことメモ(任意、placeholder「例: 雨でもないのに濡れている」+タップで挿入できるヒントチップ3つ: 「深さがある」「通学路です」「広がってきた」)。
  3. 位置確認: ミニマップ(ドラッグでピン微調整可)+「この場所で報告する」ボタン。
- 送信→ `Store.addReport`(status:"解析中") → **AI解析演出**: 写真カードの上をスキャンラインが往復+レーダーリング、ローテーションするヒント文(「ひび割れの幅を推定しています…」「過去の報告と照合しています…」「雨天データと照合しています…」)。`DemoAI.analyze` resolve後:
  スコア数字が 0→N へカウントアップ、`UI.scoreRing` が描画され、カテゴリスタンプ(要確認/経過観察/低リスク)がドンと落ちる(score≥70は画面が一瞬赤くフラッシュ+振動風シェイク)。reason がタイプライタ表示。
  → 報酬ストリップ「+50 XP / +10 🎟」スライドイン、`Store.grantXP(50)`・`grantPoints(10)`、レベルアップ時は `UI.confettiBurst("levelup")`+全画面「LEVEL UP!」。バッジ判定(profile参照)。
  → 「地図で見る」ボタンで閉じ、`MapView.focus(新ID)`+ピン出現アニメ。
- 投稿で `user.totalReports++`、typesPosted 更新。

### Detail (js/detail.js) — P2作成、P3拡張
- `Detail.open(id)` → ボトムシート: 写真(タップで拡大)、スコアリング+カテゴリ、AI reason、typeチップ、報告者(自分なら「あなたの報告」金バッジ)、`UI.timeAgo`、ステータスタイムライン(未対応→現場確認→修繕指示→修繕完了 の4ステップ縦ステッパー、statusHistoryの時刻付き)、「なおして! 👊」応援ボタン(cheers++、連打で数字ぽんぽん跳ねる)。
- P3拡張: 技術者モード時のみステータス変更UI(次の状態へ進めるボタン)を同シート内に表示。

### Profile (js/profile.js) — P2
- ヘッダのアバタータップで全画面パネル: アバター+ニックネーム+ランク章(ランク名のメダル風)、Lv/XPバー、統計3つ(報告数・修繕につながった数・所持🎟)、バッジグリッド(下記8種、未獲得はシルエット+条件文)、「カプセルトイをまわす(100🎟)」→ ガチャ演出(ハンドル回転→カプセル落下バウンド→パカッ→景品カード)。景品はモック6種(地元野菜セット応募券/商店街ギフト券500円分/ご当地キャラステッカー/コーヒー無料券/防災グッズ/ハズレ→「また挑戦!」)。
- バッジ: first_post(はじめての報告)/types3(3種類みつけた)/posts5(5件報告)/posts10(10件報告)/first_repair(初・修繕完了)/hunter(要確認を3件発見)/gacha1(カプセルデビュー)/cheer10(応援10回)。判定ヘルパ `Profile.checkBadges(trigger)` を post/detail/notify から呼ぶ。獲得時トースト+通知追加。

### Onboarding (js/onboarding.js) — P2
- 初回のみ3枚スライド(スワイプ/ボタン): ①「まちの異常を、ゲーム感覚でパトロール」②「撮って送るとAIが危険度を判定」③「あなたの報告でまちが直る(デモ版の注記をここに明記)」→ ニックネーム入力+アバター絵文字選択(12個から)→「位置情報を使う」(geolocation許可トリガー)→開始。

### Notify (js/notify.js) — P3
- ベル🔔(ヘッダ右上、未読バッジ)→ ボトムシートの通知センター。kind別アイコン、タップで `MapView.focus`+`Detail.open`。「すべて既読」。
- `Notify.push(kind, title, body, reportId)` = Store.addNotif + トースト + (許可済みなら) `new Notification()`。
- **修繕完了通知**: dashboard で自分(`reporterId==="me"`)の報告が 修繕完了 になった時、`「あなたの報告で陥没前に補修されました!」`(typeに応じ文言変化)+`grantXP(200)`+`grantPoints(30)`+`repairedCount++`+`UI.confettiBurst("repair")`。市民モードに戻った際にも未読が目立つこと。

### Dashboard (js/dashboard.js) — P3
- 技術者モード時のフルスクリーン画面(地図UIと入れ替え)。ヘッダ「🛠 技術者ダッシュボード」+市民モードへ戻るボタン。
- KPIカード4枚: 未対応 / 要確認(高) / 今週の新規 / 修繕完了率。
- タブ: 「リスト」「マップ」「定点ウォッチ」。
  - リスト: AIスコア降順(デフォルト)。フィルタチップ(状態/種類)。行 = サムネ・スコアピル・type・timeAgo・状態バッジ・「▶次へ進める」ボタン(状態遷移、確認なしでテンポよく。修繕完了時は行が緑フラッシュ)。行タップで `Detail.open`。
  - マップ: 市民と同じ地図にヒートマップトグル(`MapView.setHeat`)。
  - 定点ウォッチ: 30m以内×2件以上のクラスタを抽出し、スコア推移のミニ折れ線(SVG sparkline)+悪化トレンド矢印(↗赤)。タップで時系列カード(日付・スコア・写真サムネの縦並び)。
- 状態遷移は `Store.updateReport`(statusHistory追記、by:"技術者")→ reporterId==="me" && 新状態==="修繕完了" なら `Notify` の修繕完了フロー発火。

### Settings (js/settings.js) — P3
- ⚙️ボタン → シート: モード切替(市民⇔技術者、説明付き)/ Web通知の許可リクエスト / 「デモデータをリセット」(confirm→`Store.resetAll()`→reload) / このアプリについて(デモ版注記、元要件との対応、クレジット、バージョン)。

## 6. 画面レイアウト(市民モード・ホーム)

- 全画面 Leaflet マップ。
- 上部左: アバターチップ(絵文字+レベルリング+XPミニバー) → Profile。
- 上部中央: ロゴ「パとるロール」(「とる」だけアクセント色+📸)。小さめ。
- 上部右: 🔔(未読バッジ)。
- 右下縦並び: 📍現在地 / 🗒マイ報告(自分の報告だけのリストシート) / ⚙️設定。
- 下部中央: **巨大カメラFAB**(直径72px、ティール→ブルーのグラデ、白リング、ゆったりパルス、影)。「タップで報告」のラベルが最初の3回だけ下に表示。
- 左下: 凡例チップ(🔴要確認 🟠経過観察 🟢低リスク)。タップで折りたたみ。
- geolocation拒否時: 上部に細いバナー「現在地が取れないため東京駅周辺を表示中」。

## 7. ビジュアル言語(css/theme.css のトークン)

```css
:root {
  --c-primary:#18b9c4; --c-primary-2:#1a8fe3;          /* ティール→ブルー */
  --c-accent:#ff8a3d;                                   /* オレンジ(ロゴ「とる」・報酬) */
  --c-danger:#ff4d5e; --c-warn:#ffa726; --c-ok:#3ecf6e;
  --ink:#16384c; --ink-2:#5b7686; --paper:#ffffff; --chip:#eef6f9; --line:#dcebf1;
  --grad-hero:linear-gradient(135deg,#18b9c4,#1a8fe3);
  --r-lg:20px; --r-md:14px; --r-pill:999px;
  --shadow-1:0 2px 10px rgba(22,56,76,.10); --shadow-2:0 8px 28px rgba(22,56,76,.18);
  --font:"M PLUS Rounded 1c","Hiragino Maru Gothic ProN","BIZ UDGothic",sans-serif;
}
```
- ライトテーマ固定。文字は --ink、白カード+大きな角丸+柔らかい影。ボタンは太字・大きめ(タップ44px以上)。
- モーション: 出現は `transform: translateY(12px)→0 + opacity`(180–240ms, ease-out)。FABパルス2.4s。スコアカウントアップ900ms。過剰な常時アニメ禁止(バッテリー配慮)。
- `prefers-reduced-motion: reduce` でアニメ最小化。
- safe-area: `env(safe-area-inset-*)` をヘッダ/FABに反映(iPhoneノッチ)。

## 8. PWA / sw.js — P1

- manifest: name「パとるロール」, short_name「パとるロール」, display:standalone, theme_color:#18b9c4, background_color:#eef6f9, icons(192/512/maskable512)。apple-touch-icon を index.html で link。
- sw.js: バージョン定数 `const V="pr-v1"`。
  - 同一オリジン(HTML/CSS/JS): **network-first**, fallback cache(開発時の stale 防止)。
  - CDN(jsdelivr/フォント): cache-first。
  - タイル(basemap.cartocdn.com): cache-first + 上限150件(超えたら古い順に delete)。
- 登録は app.js 起動末尾(`'serviceWorker' in navigator` のみ)。file:// では登録しない。

## 9. アイコン(tools/make_icons.py) — P1

- Pillow で生成(なければ `python3 -m pip install --user pillow` を試し、それも不可なら純Pythonで単色角丸+シンプル図形のPNGを書くフォールバック)。
- 絵柄: ティール→ブルー縦グラデの角丸正方形、中央に白いマップピン、ピン頭にオレンジのカメラレンズ丸。maskable は中央80%セーフゾーン。

## 10. エッジケース(必ず処理)

- geolocation 拒否/タイムアウト → 東京駅フォールバック+バナー(設定 settings.geoDenied)。
- IndexedDB 不可 → メモリ動作+起動トースト「プライベートモードのためデータは保存されません」。
- カメラ拒否/非対応(PC) → ライブラリ選択と「デモ写真」が常に使える。
- localStorage quota: 写真は必ず IndexedDB。Report.thumb は320px JPEG q0.6 まで圧縮。
- オフライン: タイル未キャッシュ地帯はグレー表示になる旨を気にしない(デモ)。投稿等はオフラインでも全機能動作。
- 二重送信防止(送信ボタン disabled)。オブジェクトURLは close 時 revoke。

## 11. 受け入れ基準

- P1: `python3 -m http.server` で起動し `http://localhost:8000/?selftest=1` のコンソールに `[selftest] DONE pass=N fail=0`。manifest/sw/アイコンが 404 なし。エラー 0。
- P2: PC ブラウザで オンボーディング→デモ写真で投稿→AI演出→スコア表示→地図にピン→詳細シート→プロフィール/ガチャ が全てマウスだけで通る。コンソールエラー 0。見た目がポケGO風(明るい・丸い・楽しい)。
- P3: 技術者モードで スコア降順リスト→状態を修繕完了まで進める→市民モードに通知+報酬演出。ヒートマップ表示。定点ウォッチに悪化トレンド2件。コンソールエラー 0。
- 共通: スマホ幅(390px)で崩れない。日本語のみ。`DESIGN.md` 改変禁止。**git commit はエージェントは行わない**(レビュー担当が行う)。

## 12. 本番移行メモ(README に記載する)

- `js/ai.js` を Lambda + Anthropic API(Haiku 4.5, バッチ+プロンプトキャッシュ)呼び出しに差し替え。
- `js/store.js` を API Gateway + DynamoDB/PostGIS バックエンドに差し替え(インターフェースは互換を維持してある)。
- 通知を Web Push / SNS に、ニックネームを Cognito に置換。タイルは商用契約のプロバイダへ。
