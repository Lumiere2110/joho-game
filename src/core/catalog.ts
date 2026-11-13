// ============================================================
// カタログ — 機器・サービス・セキュリティ対策・脅威の一覧
// 数値を変えるとゲームバランスが変わります。新しい機器や対策はここに足します。
// ============================================================
import type { SkillKey, ThreatId, Tier } from './types';

/** サーバーの性能と値段 */
export interface TierDef {
  name: string;
  cores: number; // 同時に処理できる数の目安
  onpremCost: number; // オンプレミス購入費（万円）
  onpremWeekly: number; // オンプレミス維持費（電気・保守、万円/週）
  cloudWeekly: number; // クラウド利用料（万円/週）
}

export const WEB_TIERS: Record<Tier, TierDef> = {
  S: { name: '小型（2コア）', cores: 2, onpremCost: 60, onpremWeekly: 1, cloudWeekly: 4 },
  M: { name: '中型（8コア）', cores: 8, onpremCost: 150, onpremWeekly: 2, cloudWeekly: 10 },
  L: { name: '大型（32コア）', cores: 32, onpremCost: 400, onpremWeekly: 4, cloudWeekly: 25 },
};

export const DB_TIERS: Record<Tier, TierDef> = {
  S: { name: '小型（2コア）', cores: 2, onpremCost: 80, onpremWeekly: 1.5, cloudWeekly: 5 },
  M: { name: '中型（8コア）', cores: 8, onpremCost: 200, onpremWeekly: 3, cloudWeekly: 12 },
  L: { name: '大型（32コア）', cores: 32, onpremCost: 500, onpremWeekly: 6, cloudWeekly: 30 },
};

export const NETWORKS = {
  '100M': { name: '100Mbps', mbps: 100, weekly: 1 },
  '1G': { name: '1Gbps', mbps: 1000, weekly: 4 },
  '10G': { name: '10Gbps', mbps: 10000, weekly: 15 },
} as const;

/** ロードバランサ・CDN */
export const LB = { onpremCost: 40, onpremWeekly: 0.5, cloudWeekly: 2, availability: 0.9995 };
export const CDN = { weekly: 3, byteOffload: 0.6, requestOffload: 0.3 };

/** 1台あたりの理論稼働率と、1週間に故障する確率 */
export const RELIABILITY = {
  onprem: { availability: 0.995, failPerWeek: 0.025 },
  cloud: { availability: 0.998, failPerWeek: 0.012 },
  network: 0.999,
};

/** 処理時間の基本値（秒） */
export const BASE_SERVICE = 0.04; // Webサーバーで1リクエストを処理する基本時間
export const DB_SERVICE = 0.012; // DBで1回処理する時間
export const NET_LATENCY = 0.05; // 通信の往復などの固定遅延

/** オートスケールで増やせる台数の上限 */
export const AUTOSCALE_MAX = 10;

// ------------------------------------------------------------
// 脅威
// ------------------------------------------------------------
export type ThreatEffect = 'leak' | 'tamper' | 'outage' | 'ransom' | 'dataloss';

export interface ThreatDef {
  id: ThreatId;
  name: string;
  desc: string;
  basePerWeek: number; // 対策なしで1週間に起きる確率
  effect: ThreatEffect;
  severity: number; // 被害の大きさの倍率
  term: string;
}

export const THREATS: ThreatDef[] = [
  { id: 'sqli', name: 'SQLインジェクション', desc: '入力欄に細工した文字列を入れ、データベースを不正に操作する攻撃。', basePerWeek: 0.05, effect: 'leak', severity: 1, term: 'sqli' },
  { id: 'xss', name: 'クロスサイトスクリプティング', desc: 'ページに不正なスクリプトを埋め込み、利用者のブラウザで実行させる攻撃。', basePerWeek: 0.04, effect: 'tamper', severity: 1, term: 'xss' },
  { id: 'credential', name: '不正ログイン（パスワードリスト攻撃）', desc: 'ほかのサービスから漏れたIDとパスワードの組で、ログインを試す攻撃。', basePerWeek: 0.05, effect: 'leak', severity: 0.5, term: 'credential-stuffing' },
  { id: 'ddos', name: 'DDoS攻撃', desc: '大量の通信を送りつけてサービスを止める攻撃。', basePerWeek: 0.03, effect: 'outage', severity: 1, term: 'ddos' },
  { id: 'ransomware', name: 'ランサムウェア', desc: 'データを暗号化して使えなくし、身代金を要求するマルウェア。', basePerWeek: 0.015, effect: 'ransom', severity: 1, term: 'ransomware' },
  { id: 'insider', name: '内部不正', desc: '権限を持つ人が、データを持ち出したり悪用したりすること。', basePerWeek: 0.01, effect: 'leak', severity: 1, term: 'least-privilege' },
  { id: 'operror', name: '誤操作によるデータ削除', desc: '運用担当者がまちがえて大事なデータを消してしまうこと。', basePerWeek: 0.02, effect: 'dataloss', severity: 1, term: 'backup' },
  { id: 'eavesdrop', name: '通信の盗聴', desc: '暗号化されていない通信を途中で盗み見られること。', basePerWeek: 0.03, effect: 'leak', severity: 0.4, term: 'tls' },
];

// ------------------------------------------------------------
// 対策（セキュリティ・法務）
// ------------------------------------------------------------
export interface MeasureDef {
  id: string;
  name: string;
  category: 'security' | 'legal';
  desc: string;
  initialCost: number; // 導入費（万円）
  weeklyCost: number; // 維持費（万円/週）
  effort: number; // 実装工数（人週）
  skill: SkillKey;
  mitigates: Partial<Record<ThreatId, number>>; // 起きる確率をどれだけ下げるか（0〜1）
  leakImpact?: number; // 漏えいしたときの被害をどれだけ減らすか（0〜1）
  term: string;
}

export const MEASURES: MeasureDef[] = [
  { id: 'fw', name: 'ファイアウォール', category: 'security', desc: '必要な通信だけを通し、それ以外を遮断する。', initialCost: 20, weeklyCost: 0.5, effort: 0.3, skill: 'infra', mitigates: { credential: 0.1, ddos: 0.1, ransomware: 0.15 }, term: 'firewall' },
  { id: 'waf', name: 'WAF', category: 'security', desc: 'Webアプリへの攻撃パターンを検知して止める。', initialCost: 0, weeklyCost: 3, effort: 0.3, skill: 'sec', mitigates: { sqli: 0.6, xss: 0.6 }, term: 'waf' },
  { id: 'prepared', name: 'プレースホルダ（プリペアドステートメント）', category: 'security', desc: 'SQL文と入力値を分けて扱い、入力がSQLとして実行されないようにする。', initialCost: 0, weeklyCost: 0, effort: 0.5, skill: 'dev', mitigates: { sqli: 0.9 }, term: 'placeholder' },
  { id: 'escape', name: '出力時のエスケープ処理', category: 'security', desc: '画面に表示する前に < や > などの記号を無害な文字に置き換える。', initialCost: 0, weeklyCost: 0, effort: 0.5, skill: 'dev', mitigates: { xss: 0.9 }, term: 'escape' },
  { id: 'tls', name: '通信の暗号化（HTTPS / TLS）', category: 'security', desc: 'ブラウザとサーバーの通信を暗号化する。', initialCost: 2, weeklyCost: 0.2, effort: 0.2, skill: 'infra', mitigates: { eavesdrop: 0.95 }, term: 'tls' },
  { id: 'encrypt', name: '保存データの暗号化', category: 'security', desc: 'データベースやバックアップを暗号化し、盗まれても読めないようにする。', initialCost: 0, weeklyCost: 0.5, effort: 0.8, skill: 'sec', mitigates: {}, leakImpact: 0.6, term: 'encryption' },
  { id: 'mfa', name: '多要素認証', category: 'security', desc: 'パスワードに加えて、スマホのコードなど別の要素でも本人確認する。', initialCost: 0, weeklyCost: 0.3, effort: 1, skill: 'dev', mitigates: { credential: 0.9, insider: 0.1 }, term: 'mfa' },
  { id: 'lockout', name: 'ログイン試行回数の制限', category: 'security', desc: '何度もパスワードを間違えたら一時的にログインできなくする。', initialCost: 0, weeklyCost: 0, effort: 0.3, skill: 'dev', mitigates: { credential: 0.5 }, term: 'credential-stuffing' },
  { id: 'leastpriv', name: 'アクセス権限の最小化', category: 'security', desc: '社員やプログラムには、仕事に必要な最小限の権限だけを与える。', initialCost: 0, weeklyCost: 0, effort: 0.5, skill: 'sec', mitigates: { insider: 0.6, operror: 0.3 }, leakImpact: 0.15, term: 'least-privilege' },
  { id: 'patch', name: '脆弱性パッチの定期適用', category: 'security', desc: 'OSやソフトウェアの修正プログラムを決まったタイミングで当てる。', initialCost: 0, weeklyCost: 1, effort: 0.3, skill: 'ops', mitigates: { ransomware: 0.5, credential: 0.1, sqli: 0.1 }, term: 'patch' },
  { id: 'logmon', name: 'ログ監視・不正検知', category: 'security', desc: 'アクセスログを監視し、怪しい動きを早く見つける。', initialCost: 0, weeklyCost: 2, effort: 0.5, skill: 'sec', mitigates: { insider: 0.4, credential: 0.2 }, leakImpact: 0.3, term: 'log-monitoring' },
  { id: 'edu', name: '従業員へのセキュリティ教育', category: 'security', desc: '不審なメールの見分け方や、データの扱い方を教える。', initialCost: 10, weeklyCost: 0, effort: 0.3, skill: 'plan', mitigates: { ransomware: 0.4, insider: 0.2, operror: 0.3 }, term: 'security-education' },
  { id: 'ddosprot', name: 'DDoS対策サービス', category: 'security', desc: '大量の攻撃通信を手前で吸収・遮断するサービス。', initialCost: 0, weeklyCost: 4, effort: 0.2, skill: 'infra', mitigates: { ddos: 0.85 }, term: 'ddos' },
  { id: 'purpose', name: '利用目的の通知・公表（プライバシーポリシー）', category: 'legal', desc: '個人情報を何のために使うかを決めて、本人に知らせる。', initialCost: 0, weeklyCost: 0, effort: 0.3, skill: 'plan', mitigates: {}, term: 'purpose' },
  { id: 'consent', name: '要配慮個人情報の取得同意', category: 'legal', desc: '病歴などの要配慮個人情報を取得するときに、本人の同意をとる仕組み。', initialCost: 0, weeklyCost: 0, effort: 0.3, skill: 'plan', mitigates: {}, term: 'sensitive-info' },
  { id: 'breach', name: '漏えい時の報告・対応手順', category: 'legal', desc: '漏えいが起きたときに、本人や個人情報保護委員会へ報告する手順を決めておく。', initialCost: 0, weeklyCost: 0, effort: 0.3, skill: 'plan', mitigates: {}, term: 'breach-report' },
  { id: 'outsource', name: '委託先の監督（クラウド事業者との契約確認）', category: 'legal', desc: 'データを預ける委託先が安全に扱うか、契約や体制を確認する。', initialCost: 0, weeklyCost: 0, effort: 0.2, skill: 'plan', mitigates: {}, term: 'outsourcing' },
  { id: 'minimize', name: '不要な個人データの削除（データ最小化）', category: 'legal', desc: '使い終わった個人データを決まった期間で消す。', initialCost: 0, weeklyCost: 0, effort: 0.5, skill: 'dev', mitigates: {}, leakImpact: 0.3, term: 'data-minimization' },
];

export const measureById = (id: string) => MEASURES.find((m) => m.id === id)!;

/** 個人情報の種類ごとに、運用中の監査でチェックされる対策 */
export function requiredLegal(personalData: 'none' | 'personal' | 'sensitive', hosting: 'onprem' | 'cloud'): string[] {
  if (personalData === 'none') return [];
  const list = ['purpose', 'breach'];
  if (personalData === 'sensitive') list.push('consent');
  if (hosting === 'cloud') list.push('outsource');
  return list;
}

// ------------------------------------------------------------
// バックアップ
// ------------------------------------------------------------
export const BACKUP_TYPES = {
  none: { name: 'なし', term: 'backup' },
  full: { name: 'フルバックアップ', term: 'backup-full' },
  diff: { name: '差分バックアップ', term: 'backup-diff' },
  incr: { name: '増分バックアップ', term: 'backup-incr' },
} as const;

export const BACKUP_INTERVALS = {
  weekly: { name: '毎週', hours: 168 },
  daily: { name: '毎日', hours: 24 },
  hourly: { name: '毎時', hours: 1 },
} as const;

export const BACKUP_STORAGE_COST = 0.002; // 万円 / GB / 週（= 20円）
export const BACKUP_SPEED_GBH = 100; // バックアップの書き込み速度（GB/時）
export const RESTORE_SPEED_GBH = 50; // 復元の速度（GB/時）

// ------------------------------------------------------------
// 計算量
// ------------------------------------------------------------
export const COMPLEXITY_LABEL: Record<string, string> = {
  '1': 'O(1)',
  logn: 'O(log n)',
  n: 'O(n)',
  nlogn: 'O(n log n)',
  n2: 'O(n²)',
};
