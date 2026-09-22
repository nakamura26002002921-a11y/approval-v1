# Server Approval (Pyodide + PWA版)

`orchestrator_server-v1`（Flask REST API）を操作するための、GitHub Pagesで動くPyodide + PWAクライアントです。

## 直っていた問題

旧バージョンがGitHub Pagesで動かなかった原因は3つでした。

1. `app.js` の `API_BASE = "/api/requests"` が絶対パスで、Flaskと同一オリジン配信を前提にしていた。
   GitHub Pages上では自分自身（存在しないパス）を叩いてしまい、APIサーバーに届かなかった。
2. `sw.js` のキャッシュ対象が `/index.html` など絶対パスで、`/approval-v1/` というサブパス配信に対応しておらず、
   `cache.addAll` が404で失敗 → Service Worker登録自体が失敗していた。
3. `manifest.json` の `start_url` / `icons` も同様に絶対パスだった。

今回はすべて相対パス化し、さらにAPIサーバーのURL（cloudflaredで公開する毎回変わるURL）を
**アプリ内の「API設定」画面からlocalStorageに保存**する形にしました。

## 使い方

### 1. サーバー側 (`orchestrator_server-v1`) を起動

READMEの通り:

```bash
cd server-approval
source .venv/bin/activate
python3 server.py
```

別ターミナルで:

```bash
cloudflared tunnel --url http://127.0.0.1:5000
```

表示された `https://xxxxx.trycloudflare.com` を控えます。

### 2. このリポジトリをGitHub Pagesに配置

このフォルダの中身（`index.html` が直下に来るように）をリポジトリのルート、
または `docs/` フォルダに置いて、GitHub Pagesの公開設定をそのフォルダに向けてください。

例: リポジトリルート直下にこのフォルダの中身をそのまま置く場合

```
approval-v1/
├── index.html
├── app.js
├── orchestrator_api.py
├── style.css
├── sw.js
├── manifest.json
├── icon-192.png
└── icon-512.png
```

### 3. アプリにアクセスしてAPI URLを設定

`https://<あなたのユーザー名>.github.io/approval-v1/` を開くと、
起動時にPyodide（ブラウザ内Python実行環境）がロードされます（初回は数秒〜十数秒かかります）。

ロード完了後、自動で「API設定」モーダルが開くので、控えておいた
`https://xxxxx.trycloudflare.com` を入力し、「接続テスト」→「保存」します。

以降はlocalStorageに保存されるため、次回アクセス時は自動で再接続を試みます。
cloudflaredのURLは毎回変わるので、変わるたびに画面右上の「API設定」ボタンから再設定してください。

## 技術構成

- **Pyodide**: ブラウザ内でPythonを実行し、`orchestrator_api.py` に定義したAPIクライアント関数
  （一覧取得・登録・更新・削除・承認・疎通確認）を呼び出します。HTTP通信は `pyodide-http` が
  `requests` の呼び出しをブラウザの `fetch` にブリッジすることで実現しています。
- **PWA**: `manifest.json` と `sw.js`（Service Worker）により、ホーム画面への追加・オフライン時の
  静的ファイルキャッシュに対応しています。すべて相対パスで記述しているため、GitHub Pagesの
  サブパス配信（`https://xxx.github.io/approval-v1/`）でも正しく動作します。
- **CORS**: `orchestrator_server-v1` 側は `flask-cors` の `CORS(app)` により全オリジンからの
  アクセスを許可しているため、異なるオリジン（GitHub Pages）からの `fetch` はそのまま許可されます。

## 注意点

- cloudflaredの無料トンネル（trycloudflare.com）はサーバーを再起動するたびにURLが変わります。
  固定運用したい場合は、Cloudflareの named tunnel やご自身のドメインの利用をおすすめします。
- HTTPS同士（GitHub Pages ↔ trycloudflare.com）の通信なので、Mixed Content（HTTPSページから
  HTTPへの通信禁止）の問題も発生しません。
