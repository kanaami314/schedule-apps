# バックエンド（Supabase）セットアップ手順

アカウント・認証・端末間データ共有のための Supabase 設定手順です。
**この作業はあなた（オーナー）の操作が必要**です（Claude はアカウント作成や鍵の入力ができないため）。
完了したら **Project URL** と **anon public key** を教えてください。フロント側の実装を進めます。

---

## 1. Supabase プロジェクト作成

1. https://supabase.com にサインイン（GitHub アカウントでOK）。
2. 「New project」→ 組織を選び、プロジェクト名（例: `kururhythm`）とデータベースパスワードを設定。
   - リージョンは日本近く（例: Northeast Asia (Tokyo)）推奨。
3. 作成完了まで数分待つ。

## 2. スキーマ・ポリシーを投入

1. 左メニュー「SQL Editor」→「New query」。
2. リポジトリの [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql) の中身を全部貼り付けて **Run**。
   - 8つのテーブル（categories/definitions/… ）＋ RLS ＋ `put_row`/`bulk_put` 関数が作成されます。
   - これで **アカウントごとのデータ分離（独立性）は DB 側で強制**されます。

## 3. Google ログイン（OAuth）を有効化

1. Google Cloud Console（https://console.cloud.google.com） で OAuth 2.0 クライアントIDを作成:
   - 「APIとサービス」→「認証情報」→「OAuth クライアント ID を作成」→ 種類「ウェブアプリケーション」。
   - **承認済みリダイレクト URI** に、Supabase が指定する次を追加:
     `https://<あなたのプロジェクトRef>.supabase.co/auth/v1/callback`
     （Ref は Supabase の Project Settings → API に表示）。
   - 発行された **クライアントID** と **クライアントシークレット** を控える。
2. Supabase ダッシュボード「Authentication」→「Providers」→「Google」を有効化し、上記のIDとシークレットを入力して保存。
3. 「Authentication」→「URL Configuration」→ **Redirect URLs** に以下を追加:
   - `http://localhost:5173`（開発）
   - `https://kanaami314.github.io/schedule-apps/`（本番）

## 4. フロントに渡す情報（← これを教えてください）

Supabase「Project Settings」→「API」に表示される:

- **Project URL**（例: `https://xxxxxxxx.supabase.co`）
- **anon public** key（`anon` `public` と書かれた方。※ `service_role` は絶対に渡さない・使わない）

> anon キーはフロントに埋め込んで問題ない公開鍵です（データ保護は RLS が担保）。
> `service_role` キーは全権限を持つ秘密鍵なので、フロントには絶対に置きません。

フロント側では `.env.local` に以下を設定します（この2つは私が実装時に組み込みます）:

```
VITE_SUPABASE_URL=＜Project URL＞
VITE_SUPABASE_ANON_KEY=＜anon public key＞
```

---

## トランザクション・独立性の設計（このバックエンドで担保される内容）

- **アカウント間の独立性**: RLS により、各ユーザーは自分の行しか読めない・書けない（DBが強制）。
- **書き込みの原子性・分離**: 書き込みは `put_row()` の単一 SQL 文 upsert。各リクエストは
  トランザクションで実行されるため、書き込み単位の分離は自明に担保。
- **端末間の更新競合（lost update）**: `version` 列による楽観的並行制御。期待バージョンと
  不一致なら `40001` を返し、クライアントは再取得してやり直す（＝更新の取りこぼしを防ぐ）。
- **将来の厳密な複数行トランザクション**: 必要になれば Edge Function で
  `BEGIN ISOLATION LEVEL SERIALIZABLE` ＋ 40001 リトライを実装する口を用意済み。
