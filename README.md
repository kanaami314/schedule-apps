# schedule-apps — タイムスケジューラ

勉強・研究・学校・就活・アルバイト・趣味・生活・健康・交友など、複数種類の予定を統合管理するタイムスケジューラです。負荷スコアに基づく自動スケジューリングと休憩の自動配置を行います。

機能要件の詳細は [`time_scheduler_requirements.md`](./time_scheduler_requirements.md) を参照してください。

## 技術スタック

| 項目 | 採用技術 |
|---|---|
| 言語 | TypeScript |
| フレームワーク | React + Vite |
| スタイリング | Tailwind CSS (v4) |
| 状態管理 | Zustand |
| データ保存 | IndexedDB (Dexie.js) |
| PWA | vite-plugin-pwa |
| テスト | Vitest + Testing Library |
| Lint / Format | ESLint + Prettier |
| CI/CD | GitHub Actions → GitHub Pages |

> **前提**: 現在はサーバーを持たない構成のため、データはブラウザ内（IndexedDB）に保存されます。将来的にバックエンドへ差し替えられるよう、データアクセス層とスケジューリングロジックは UI から独立させて設計します。

## 必要環境

- Node.js **v24 LTS 以上**（v20.19+ でも動作しますが v24 を推奨）

## セットアップ

```bash
npm install
```

## 開発

```bash
npm run dev
```

## 主なスクリプト

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバーを起動 |
| `npm run build` | 型チェック + 本番ビルド |
| `npm run preview` | ビルド結果をローカルで確認 |
| `npm run test` | テストを実行 |
| `npm run test:watch` | テストをウォッチモードで実行 |
| `npm run lint` | ESLint |
| `npm run format` | Prettier で整形 |

## ディレクトリ構成

```
src/
  domain/    純粋なドメインロジック（負荷計算・スケジューリング等。UI非依存）
  data/      データアクセス層（Dexie/IndexedDB を抽象化）
  store/     Zustand ストア
  features/  画面・機能単位のコンポーネント
  test/      テスト共通セットアップ
```

## デプロイ

`main` ブランチへ push すると GitHub Actions が自動でビルドし、GitHub Pages へデプロイします。
公開 URL: `https://kanaami314.github.io/schedule-apps/`
