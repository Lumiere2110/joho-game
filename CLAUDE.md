# 情報ゲーム — 開発メモ（Claude 向け）

情報系の知識を使って情報システムを企画・設計・開発・運用するストラテジーゲーム。目的は **情報系の知識・技術を深めること** と **楽しむこと**。今後も要素・分野を拡大していく。

## 構成

- `src/core/` … ゲームのロジック（React に依存しない）。ここだけでテスト・自動プレイできる。
  - `types.ts` 型定義（まずここに型を足す）
  - `catalog.ts` サーバー・回線・脅威・対策・バックアップの数値
  - `calc.ts` 計算式（計算量、M/M/1、稼働率、バックアップ、費用）
  - `glossary.ts` 用語集（`terms: ['id']` で各データから参照）
  - `cases/*.ts` 案件データ。新案件はファイルを作って `cases/index.ts` の `CASES` に追加
  - `project.ts` 問題の解決判定、開発タスク生成、満足度
  - `sim.ts` 1週間ごとの開発・運用シミュレーション
  - `game.ts` すべての操作（Action）と reducer。UI は dispatch するだけ
  - `staff.ts` メンバー、採用候補、作業量
- `src/ui/` … 画面（フェーズごとに1ファイル）。`common.tsx` に用語リンク `<T id>`・グラフなど。
- `tools/balance.test.ts` … バランス確認（`npx vitest run tools --silent=false`）

## ルール

- ソースのコメントは初心者にも分かる日本語で書く。
- 用語の説明・案件の内容は正確に（法律・技術の説明は実際の制度・仕組みに沿う）。新しい知識要素を足したら用語集にも追加する。
- 数値は実際の考え方で計算する（雰囲気の乱数にしない）。乱数は `Rng`（シード付き）だけを使い、reducer は純粋に保つ。
- 状態を変える処理は `game.ts` の Action に追加し、`game.test.ts` にテストを足す。
- セーブ形式（`GameState`）を壊す変更をしたら `version` を上げて `save.ts` で移行する。
- 変更後は `npx tsc --noEmit` と `npm test` を通し、`npm run build` を確認してから push（GitHub Actions が Pages に公開）。
- 作業は Record（作業記録サイト）にも記録する。
