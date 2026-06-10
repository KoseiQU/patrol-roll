# パとるロール — デモ版

市民参加型インフラ点検プラットフォームのデモ用静的PWA。

> **デモ版注記**: AI判定はシミュレーションです（本番は Claude Haiku 4.5 を想定）。  
> データは端末内のIndexedDB/localStorageにのみ保存されます。サーバー・APIキー不要。

## 動かし方

```bash
cd patrol-roll
python3 -m http.server 8000
# → http://localhost:8000 をブラウザで開く
```

セルフテストを実行する場合:

```
http://localhost:8000/?selftest=1
```

ブラウザの開発者ツール → コンソールで `[selftest] DONE pass=N fail=0` を確認。

## 本番移行メモ

- `js/ai.js` → Lambda + Anthropic API (Haiku 4.5, バッチ+プロンプトキャッシュ) に差し替え
- `js/store.js` → API Gateway + DynamoDB/PostGIS バックエンドに差し替え（インターフェース互換）
- 通知を Web Push / SNS に、ニックネームを Cognito に置換
- 地図タイルは商用契約のプロバイダへ（現在 CARTO Voyager: デモ用途のみ）
