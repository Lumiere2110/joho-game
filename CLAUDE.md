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
  - `guide.ts` チュートリアルの「次にやること」（段階ごとの手順と完了判定）。フェーズや作業を足したら、ここの手順も足す
  - `program.ts` ブロックのプログラム（ブロックの種類 `BLOCKS`、実行・操作回数の計測 `runProgram`、計算量の判定、コード⇔ブロック変換）。案件の処理に `program`（目的・テストの種類）と各方式に `recipe`（使うブロック）を書くと、プレイヤーのプログラムがその方式に対応づけられる。どれとも違えば `custom`（`calc.ts` の `chosenOption`）
  - 司令室の表示用データ（純粋関数・`view.test.ts` でテスト）
    - `issues.ts` 左の「対応が必要なこと」（何が・影響・期限・放置したら・関係する機器・対応候補 Action）。新しい問題・イベントはここに項目を足す
    - `topology.ts` 構成図のノード・エッジ・状態（ok/busy/down/attack/off）と `NODE_ROLE` の説明
    - `status.ts` 下の6つの状態（満足度・安定性・処理速度・安全性・進み具合・運用コスト）
    - `workflow.ts` 業務画面（案件の `workflow` から改善前後の時間・費用）
    - `time.ts` 週 → 日付
  - 運用中の障害・攻撃は `sim.ts` の `hit()` で `Incident`（どの機器・種類・復旧手順・脅威）として記録する
- `src/ui/` … 画面
  - `App.tsx` 上部バー（日付・資金・再生/一時停止/早送り・かんたん/詳細）、画面タブ、自動一時停止、変化の通知
  - `CommandCenter.tsx` 司令室（左 IssueList／中央 Diagram／右 IssueDetail・NodeDetail／下 StatusBar）
  - `Diagram.tsx`・`Icons.tsx` 構成図とアイコン（形で役割、色＋記号＋文字で状態）
  - `Screens.tsx` システム／業務／開発／運用・セキュリティ／管理 画面。フェーズ別の部品（Investigate・Design・Develop・Operate など）を組み合わせる
  - `Tutorial.tsx` 画面の案内（`TOUR` の各手順は CSS セレクタで場所を指す。画面の部品のクラス名を変えたら合わせる）と「次にやること」パネル
  - `Program.tsx` ブロックでプログラムを作る画面（設計の処理タブ。詳細表示ではコードでも書ける）
  - `common.tsx` 用語リンク `<T id>`・`TermNote`（用語＋短い説明）・グラフ・画面の共通状態（mode/screen/sel）
- 色の意味：青=データ・通信、緑=正常、黄=高負荷・要確認、赤=障害・緊急、紫=セキュリティ、灰=停止。色だけに頼らず記号か文字を必ず添える。
- `tools/balance.test.ts` … バランス確認（`npx vitest run tools --silent=false`）

## ルール

- ソースのコメントは初心者にも分かる日本語で書く。
- 用語の説明・案件の内容は正確に（法律・技術の説明は実際の制度・仕組みに沿う）。新しい知識要素を足したら用語集にも追加する。
- 数値は実際の考え方で計算する（雰囲気の乱数にしない）。乱数は `Rng`（シード付き）だけを使い、reducer は純粋に保つ。
- 状態を変える処理は `game.ts` の Action に追加し、`game.test.ts` にテストを足す。
- セーブ形式（`GameState`）を壊す変更をしたら `version` を上げて `save.ts` で移行する。
- 変更後は `npx tsc --noEmit` と `npm test` を通し、`npm run build` を確認してから push（GitHub Actions が Pages に公開）。
- 作業は Record（作業記録サイト）にも記録する。
