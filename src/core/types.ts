// ============================================================
// 情報ゲーム — 型定義
// ゲームの「データの形」をすべてここにまとめています。
// 新しい要素を足すときは、まずここに型を追加してください。
// ============================================================
import type { Block, BlockKind, Goal, ProgramResult, SortAlgo, SortKey } from './program';

/** スキルの種類（メンバーの得意分野） */
export type SkillKey = 'plan' | 'dev' | 'infra' | 'sec' | 'ops';

export const SKILL_NAMES: Record<SkillKey, string> = {
  plan: '企画・調整',
  dev: '開発',
  infra: 'インフラ',
  sec: 'セキュリティ',
  ops: '運用',
};

export const SKILL_KEYS: SkillKey[] = ['plan', 'dev', 'infra', 'sec', 'ops'];

/** チームメンバー */
export interface Member {
  id: string;
  name: string;
  title: string; // 肩書き（PM、エンジニアなど）
  skills: Record<SkillKey, number>; // 1〜5
  exp: Record<SkillKey, number>; // 経験値。たまるとスキルが上がる
  salary: number; // 週あたりの人件費（万円）
  fatigue: number; // 疲労 0〜100
}

/** 計算量（オーダー） */
export type Complexity = '1' | 'logn' | 'n' | 'nlogn' | 'n2';

/** 処理方式の選択肢（アルゴリズムやデータ構造） */
export interface ProcessOption {
  id: string;
  name: string;
  desc: string;
  complexity: Complexity;
  mode: 'online' | 'batch'; // online = 利用者のリクエストごと / batch = 1日1回まとめて
  costPerOp: number; // 1回の基本操作にかかる秒数
  effort: number; // 実装に必要な追加工数（人週）
  weeklyCost?: number; // 運用費（万円/週）
  satisfaction?: number; // 満足度ボーナス
  terms?: string[]; // 関係する用語ID
  /** ブロックで作ったプログラムがこの方式とみなされる条件（使うブロック・並べ替えの方法と順番。計算量も一致が必要） */
  recipe?: { uses: BlockKind[]; algo?: SortAlgo; key?: SortKey };
}

/** 業務の中の「処理」。どの方式で実装するか選ぶ */
export interface ProcessDef {
  id: string;
  name: string;
  desc: string;
  dataKey: string; // 処理するデータ（CaseDef.data の key）
  callsPerRequest?: number; // online のとき、1リクエストあたり何回呼ばれるか（平均）
  options: ProcessOption[];
  /** ブロックでプログラムを作るときの目的（find=探す update=探して更新 next=次の順番 order=並べ替え） */
  program?: { goal: Goal; keys?: SortKey[]; target: string; presorted?: boolean /* テストのデータが最初から番号順に並んでいる */ };
}

/** ブロックで作ったプログラム（設計に保存する） */
export interface SavedProgram {
  blocks: Block[];
  result: ProgramResult;
}

/** 問題が「解決した」とみなす条件 */
export type SolveCond =
  | { feature: string }
  | { option: string }
  | { measures: string[] } // すべて導入していれば解決
  | { minAvailability: number } // 理論稼働率がこの値以上
  | { peakCapacity: true } // ピーク時のアクセスをさばける
  | { backupOffsite: true }; // 遠隔地にバックアップがある

/** 原因を考えるクイズ */
export interface Quiz {
  question: string;
  options: string[];
  answer: number;
  explanation: string;
}

/** 依頼主が抱えている問題 */
export interface Problem {
  id: string;
  title: string;
  who: string; // 誰が困っているか
  detail: string;
  severity: 1 | 2 | 3; // 重要度
  visible?: boolean; // 最初の依頼文から分かっている問題
  solvedBy: SolveCond[];
  quiz?: Quiz;
  terms?: string[];
}

/** 調査（ヒアリング・データ分析） */
export interface Investigation {
  id: string;
  kind: 'interview' | 'analysis' | 'nda';
  name: string;
  role: string;
  days: number;
  needsNda?: boolean;
  lines: string[]; // 調査で分かったこと（会話）
  reveals: { problems?: string[]; facts?: string[] };
  terms?: string[];
}

/** 機能 */
export interface Feature {
  id: string;
  name: string;
  desc: string;
  effort: number; // 工数（人週）
  skill: SkillKey;
  satisfaction?: number; // 問題を解決しなくても少し喜ばれる量
  required?: boolean; // 必須機能
  terms?: string[];
}

/** データベース設計パズル */
export interface DataPuzzle {
  intro: string;
  tables: { id: string; name: string; desc: string }[];
  attributes: { id: string; name: string; answer: string[]; note: string }[];
}

/** 運用中に届く利用者の要望 */
export interface OpsRequest {
  id: string;
  week: number; // 何週目に届くか
  from: string;
  text: string;
  name: string;
  effort: number;
  skill: SkillKey;
  satisfaction: number;
  terms?: string[];
}

/** 業務データ（量が週ごとに増える） */
export interface DataItem {
  key: string;
  label: string;
  unit: string;
  initial: number;
  growthPerWeek: number; // 0.02 = 毎週2%増
  scalesWithTraffic?: boolean; // セール時などに一緒に増える（1日あたりの件数など）
  fact?: string; // この事実を調査で知るまで値が「？」になる
}

export type ThreatId =
  | 'sqli'
  | 'xss'
  | 'credential'
  | 'ddos'
  | 'ransomware'
  | 'insider'
  | 'operror'
  | 'eavesdrop';

/** 案件（依頼）の定義 */
export interface CaseDef {
  id: string;
  title: string;
  client: string;
  industry: string;
  difficulty: 1 | 2 | 3;
  unlockRep: number; // この評判以上で受注できる
  request: string; // 依頼文
  budget: number; // 予算（万円）
  deadlineWeeks: number; // 案件開始から納品までの期限（週）
  opsWeeks: number; // 運用保守の契約期間（週）
  maintenanceFee: number; // 運用保守費（万円/週）
  personalData: 'none' | 'personal' | 'sensitive';
  responseTarget: number; // 目標応答時間（秒）
  batchWindow: number; // 夜間バッチに使える時間（秒）
  dataGB: number; // 最初のデータ量（GB）
  stakeholders: Investigation[];
  facts: Record<string, string>; // 事実ID → 説明
  problems: Problem[];
  features: Feature[];
  processes: ProcessDef[];
  dataModel: DataPuzzle;
  workflow: Workflow;
  traffic: {
    base: number; // 平常時のリクエスト数（件/秒）
    growthPerWeek: number;
    bytesPerRequest: number; // 1リクエストの平均データ量（バイト）
    dbRatio: number; // DBにアクセスするリクエストの割合
    peakFact?: string;
    events: { week: number; name: string; multiplier: number }[]; // 運用週ごとのイベント
  };
  data: DataItem[];
  threats: Partial<Record<ThreatId, number>>; // 狙われやすさの倍率
  changeRequest: { name: string; text: string; effort: number; skill: SkillKey; satisfaction: number };
  opsRequests: OpsRequest[];
}

// ------------------------------------------------------------
// 設計
// ------------------------------------------------------------
export type Tier = 'S' | 'M' | 'L';

export interface Infra {
  hosting: 'onprem' | 'cloud';
  webTier: Tier;
  webCount: number;
  lb: boolean;
  dbTier: Tier;
  dbReplica: boolean;
  network: '100M' | '1G' | '10G';
  cdn: boolean;
  autoscale: boolean;
}

export interface Backup {
  type: 'none' | 'full' | 'diff' | 'incr';
  interval: 'weekly' | 'daily' | 'hourly';
  generations: number;
  offsite: boolean;
}

export interface Design {
  dataModel: Record<string, string>; // 属性ID → テーブルID
  processes: Record<string, string>; // 処理ID → 選択肢ID（'custom' = ブロックで作った自作プログラム）
  programs?: Record<string, SavedProgram>; // 処理ID → ブロックで作ったプログラム
  infra: Infra;
  measures: string[]; // 導入する対策ID
  backup: Backup;
}

// ------------------------------------------------------------
// 開発
// ------------------------------------------------------------
export type TaskKind =
  | 'feature'
  | 'db'
  | 'logic'
  | 'infra'
  | 'measure'
  | 'backup'
  | 'test'
  | 'change'
  | 'request'
  | 'bugfix'
  | 'monitor';

export interface Task {
  id: string;
  name: string;
  kind: TaskKind;
  skill: SkillKey;
  effort: number; // 必要工数（人週）。continuous なタスクは 0
  progress: number;
  refId?: string;
  optional?: boolean; // リリースに必須でない
  continuous?: boolean; // 終わりのない仕事（監視・バグ修正）
}

export type Phase = 'investigate' | 'requirements' | 'design' | 'develop' | 'operate' | 'done';

export const PHASE_NAMES: Record<Phase, string> = {
  investigate: '調査',
  requirements: '要件定義',
  design: '設計',
  develop: '開発',
  operate: '運用',
  done: '完了',
};

export type Contract = 'ukeoi' | 'junin';

/** 開発中・運用中に起きる「選択を迫られる出来事」 */
export interface PendingEvent {
  kind: 'change';
  title: string;
  text: string;
}

export interface OpsWeekResult {
  week: number;
  lambda: number; // リクエスト数（件/秒）
  capacity: number; // 処理能力（件/秒）
  rho: number; // 利用率
  response: number; // 平均応答時間（秒）
  lostRate: number; // さばけなかったリクエストの割合
  outageHours: number;
  batchTime: number;
  servers: number;
  satisfaction: number;
  cost: number;
  revenue: number;
  events: { text: string; kind: 'info' | 'good' | 'bad' }[];
  dbRho?: number;
  netRho?: number;
  incidents?: Incident[];
}

export interface OpsState {
  week: number; // 何週目まで終わったか
  data: Record<string, number>;
  dataGB: number;
  history: OpsWeekResult[];
  arrivedRequests: string[];
  acceptedRequests: string[];
  doneRequests: string[];
  pendingInfra: { infra: Infra; applyWeek: number } | null;
  auditDone: boolean;
}

export interface Project {
  caseId: string;
  budget: number; // 受注額（評判で上下する）
  lowSatWeeks: number; // 満足度が低い週が続いた数（続くと保守契約を打ち切られる）
  phase: Phase;
  startWeek: number;
  days: number; // 今週使った日数（調査）
  contract: Contract | null;
  nda: boolean;
  spent: number;
  received: number;
  done: string[]; // 実施した調査ID
  facts: string[];
  foundProblems: string[];
  quizAnswers: Record<string, number>;
  features: string[]; // 作る機能
  design: Design;
  designConfirmed: boolean;
  tasks: Task[];
  assignments: Record<string, string>; // メンバーID → タスクID または 'rest'
  devWeeks: number;
  bugs: number;
  overtime: boolean;
  changeOffered: boolean;
  changeAccepted: boolean;
  deadlineExtension: number;
  pendingEvent: PendingEvent | null;
  releaseWeek: number | null;
  delivered: string[]; // 完成した機能
  satisfaction: number;
  repPenalty: number; // 事故などで失った評判（案件終了時に反映）
  ops: OpsState | null;
  notes: string[]; // フェーズ移行時の評価メモ
}

export interface CaseResult {
  caseId: string;
  week: number;
  satisfaction: number;
  profit: number;
  repDelta: number;
  late: number;
  solved: number;
  totalProblems: number;
}

export interface LogEntry {
  week: number;
  text: string;
  kind: 'info' | 'good' | 'bad';
}

export interface GameState {
  version: 1;
  companyName: string;
  rngState: number;
  week: number;
  money: number;
  reputation: number;
  staff: Member[];
  candidates: Member[];
  results: CaseResult[];
  project: Project | null;
  knownTerms: string[];
  log: LogEntry[];
  gameOver: boolean;
  nextId: number;
  drills?: string[]; // 解いた練習問題（アルゴリズム道場）のID。古いセーブには無いので省略可
}

/** 構成図に表示する障害・攻撃の記録 */
export interface Incident {
  node: string; // 構成図のどこで起きたか（web / db / lb / internet / edge / batch）
  kind: 'failure' | 'degraded' | 'attack' | 'overload' | 'warning';
  title: string;
  steps: string[]; // 復旧・対応の手順
  threat?: ThreatId; // 攻撃・事故のとき、どの脅威だったか
}

/** 業務の流れ（業務画面） */
export interface WorkflowStep {
  id: string;
  name: string;
  actor: string; // 担当
  work: number; // 1件あたりの作業時間（分）
  wait: number; // 次の工程に進むまでの待ち時間（時間）
  manual?: boolean; // 手作業
  duplicate?: boolean; // 同じ内容をもう一度入力するなどの重複作業
  system?: boolean; // システムが自動で行う
  note?: string;
  reveal?: string; // この調査をするまで詳細が分からない
  after?: { problem: string; work: number; wait: number; note: string }; // この問題が解決すると改善される
}

export interface Workflow {
  unit: string; // 「注文1件」など
  perDay: number; // 1日の件数
  steps: WorkflowStep[];
}
