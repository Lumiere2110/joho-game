// ============================================================
// 計算 — 性能・稼働率・バックアップ・費用などの計算式
// ゲーム内で「なぜこの結果になったか」を説明できるよう、
// 実際の情報系の考え方（計算量、待ち行列、稼働率）に沿って計算します。
// ============================================================
import {
  BACKUP_INTERVALS,
  BACKUP_SPEED_GBH,
  BACKUP_STORAGE_COST,
  BASE_SERVICE,
  CDN,
  DB_SERVICE,
  DB_TIERS,
  LB,
  MEASURES,
  NET_LATENCY,
  NETWORKS,
  RELIABILITY,
  RESTORE_SPEED_GBH,
  WEB_TIERS,
} from './catalog';
import type { Backup, CaseDef, Complexity, Design, Infra, ProcessOption } from './types';

/** 計算量 → 基本操作の回数 */
export function opsCount(c: Complexity, n: number): number {
  const m = Math.max(1, n);
  switch (c) {
    case '1':
      return 1;
    case 'logn':
      return Math.log2(m) + 1;
    case 'n':
      return m;
    case 'nlogn':
      return m * (Math.log2(m) + 1);
    case 'n2':
      return m * m;
  }
}

export function chosenOption(c: CaseDef, d: Design, procId: string): ProcessOption {
  const p = c.processes.find((x) => x.id === procId)!;
  return p.options.find((o) => o.id === d.processes[procId]) ?? p.options[0];
}

/** Webサーバーが1リクエストを処理する時間（秒） */
export function serviceTime(c: CaseDef, d: Design, data: Record<string, number>): number {
  let s = BASE_SERVICE;
  for (const p of c.processes) {
    const o = chosenOption(c, d, p.id);
    if (o.mode !== 'online') continue;
    s += (p.callsPerRequest ?? 1) * o.costPerOp * opsCount(o.complexity, data[p.dataKey] ?? 0);
  }
  return s;
}

/** 夜間バッチの処理時間（秒） */
export function batchTime(c: CaseDef, d: Design, data: Record<string, number>): number {
  let t = 0;
  for (const p of c.processes) {
    const o = chosenOption(c, d, p.id);
    if (o.mode !== 'batch') continue;
    t += o.costPerOp * opsCount(o.complexity, data[p.dataKey] ?? 0);
  }
  return t;
}

export interface LoadResult {
  S: number; // 1リクエストの処理時間
  capacity: number; // Web層の処理能力（件/秒）
  rho: number; // Web層の利用率
  dbRho: number;
  netRho: number;
  response: number; // 平均応答時間（秒）
  lostRate: number; // さばけずエラーになった割合
  bottleneck: 'web' | 'db' | 'net' | null;
}

/**
 * 負荷の計算。
 * 待ち行列理論（M/M/1 モデル）の考え方で、利用率 ρ = λ / μ が 1 に近づくほど
 * 待ち時間が急に長くなる： 応答時間 R = S / (1 − ρ)
 */
export function evaluateLoad(
  c: CaseDef,
  d: Design,
  data: Record<string, number>,
  lambda: number,
  webCount: number,
  infra: Infra = d.infra,
): LoadResult {
  const S = serviceTime(c, d, data);
  const reqLambda = lambda * (infra.cdn ? 1 - CDN.requestOffload : 1);
  // ロードバランサがないと、複数台あっても1台にしか届かない
  const eff = infra.lb || webCount <= 1 ? webCount : 1;
  const capacity = (eff * WEB_TIERS[infra.webTier].cores) / S;
  const rho = reqLambda / capacity;

  const dbCap = DB_TIERS[infra.dbTier].cores / DB_SERVICE;
  const dbRho = (reqLambda * c.traffic.dbRatio) / dbCap;

  const bits = c.traffic.bytesPerRequest * 8 * (infra.cdn ? 1 - CDN.byteOffload : 1);
  const bw = NETWORKS[infra.network].mbps * 1e6;
  const netRho = (lambda * bits) / bw;

  const LIMIT = 0.97;
  const worst = Math.max(rho, dbRho, netRho);
  let lostRate = 0;
  if (worst > LIMIT) lostRate = 1 - LIMIT / worst;

  const q = (r: number) => 1 / (1 - Math.min(r, LIMIT));
  let response =
    S * q(rho) + c.traffic.dbRatio * DB_SERVICE * q(dbRho) + (bits / bw) * q(netRho) + NET_LATENCY;
  if (worst > LIMIT) response = Math.max(response, 8); // 処理しきれずタイムアウトが多発

  let bottleneck: LoadResult['bottleneck'] = null;
  if (worst > 0.7) bottleneck = worst === rho ? 'web' : worst === dbRho ? 'db' : 'net';

  return { S, capacity, rho, dbRho, netRho, response, lostRate, bottleneck };
}

/** 並列につないだ機器の稼働率： 1 − (1 − a)^n */
export function parallel(a: number, n: number): number {
  return 1 - Math.pow(1 - a, n);
}

/** システム全体の理論稼働率（直列：掛け算、並列：1−(1−a)^n） */
export function systemAvailability(infra: Infra): number {
  const a = RELIABILITY[infra.hosting].availability;
  const web = parallel(a, infra.webCount);
  const lb = infra.lb ? LB.availability : 1; // ロードバランサは直列につながる
  const db = infra.dbReplica ? parallel(a, 2) : a;
  return web * lb * db * RELIABILITY.network;
}

/** 単一障害点（そこが壊れると全体が止まる部分）のリスト */
export function singlePoints(infra: Infra): string[] {
  const list: string[] = [];
  if (infra.webCount === 1) list.push('Webサーバー（1台）');
  if (infra.webCount > 1 && infra.lb) list.push('ロードバランサ（1台）');
  if (!infra.dbReplica) list.push('データベース（1台）');
  return list;
}

export interface BackupMetrics {
  rpoHours: number; // どれだけ前のデータまで戻れるか（失うデータの最大時間）
  rtoHours: number; // 復旧にかかる時間
  storageGB: number;
  weeklyCost: number;
  backupHours: number; // 1回のバックアップにかかる時間
  feasible: boolean; // 次のバックアップまでに終わるか
}

export function backupMetrics(b: Backup, dataGB: number): BackupMetrics {
  if (b.type === 'none') {
    return { rpoHours: Infinity, rtoHours: Infinity, storageGB: 0, weeklyCost: 0, backupHours: 0, feasible: true };
  }
  const interval = BACKUP_INTERVALS[b.interval].hours;
  const gens = Math.max(1, b.generations);
  // 1回あたりの書き込み量（差分・増分は週1回のフルバックアップ＋日々の変更分）
  const changeRate = Math.min(1, 0.02 * (interval / 24)); // 1日に2%のデータが変わると仮定
  let perBackupGB: number;
  let storageGB: number;
  let restoreGB: number;
  let chain = 1;
  if (b.type === 'full') {
    perBackupGB = dataGB;
    storageGB = dataGB * gens;
    restoreGB = dataGB;
  } else if (b.type === 'diff') {
    // 差分 = 最後のフルからの変更すべて（日がたつほど大きくなる）
    const perWeek = Math.max(1, 168 / interval);
    perBackupGB = dataGB * changeRate * (perWeek / 2);
    storageGB = dataGB * Math.ceil(gens / perWeek) + perBackupGB * gens;
    restoreGB = dataGB + perBackupGB; // フル＋最新の差分1つ
  } else {
    // 増分 = 前回のバックアップからの変更だけ（小さいが、復元時はすべてつなぐ）
    const perWeek = Math.max(1, 168 / interval);
    perBackupGB = dataGB * changeRate;
    storageGB = dataGB * Math.ceil(gens / perWeek) + perBackupGB * gens;
    chain = Math.min(gens, perWeek) / 2 + 1;
    restoreGB = dataGB + perBackupGB * chain;
  }
  const backupHours = perBackupGB / BACKUP_SPEED_GBH;
  const rtoHours = restoreGB / RESTORE_SPEED_GBH + 1 + (b.type === 'incr' ? chain * 0.25 : 0) + (b.offsite ? 1 : 0);
  const weeklyCost = storageGB * BACKUP_STORAGE_COST * (b.offsite ? 1.5 : 1);
  return {
    rpoHours: interval,
    rtoHours,
    storageGB,
    weeklyCost,
    backupHours,
    feasible: backupHours <= interval,
  };
}

export interface CostBreakdown {
  initial: number; // 初期費用
  weekly: number; // 毎週の費用
  lines: { name: string; initial: number; weekly: number }[];
}

/** 構成から費用を計算する */
export function infraCost(infra: Infra, extraServers = 0): CostBreakdown {
  const lines: CostBreakdown['lines'] = [];
  const on = infra.hosting === 'onprem';
  const w = WEB_TIERS[infra.webTier];
  const dbt = DB_TIERS[infra.dbTier];
  lines.push({
    name: `Webサーバー ${w.name} ×${infra.webCount}${extraServers ? ` (+自動追加${extraServers})` : ''}`,
    initial: on ? w.onpremCost * infra.webCount : 0,
    weekly: (on ? w.onpremWeekly : w.cloudWeekly) * infra.webCount + (on ? 0 : w.cloudWeekly * extraServers),
  });
  const dbn = infra.dbReplica ? 2 : 1;
  lines.push({
    name: `DBサーバー ${dbt.name} ×${dbn}${infra.dbReplica ? '（レプリカあり）' : ''}`,
    initial: on ? dbt.onpremCost * dbn : 0,
    weekly: (on ? dbt.onpremWeekly : dbt.cloudWeekly) * dbn,
  });
  if (infra.lb) lines.push({ name: 'ロードバランサ', initial: on ? LB.onpremCost : 0, weekly: on ? LB.onpremWeekly : LB.cloudWeekly });
  lines.push({ name: `回線 ${NETWORKS[infra.network].name}`, initial: 0, weekly: NETWORKS[infra.network].weekly });
  if (infra.cdn) lines.push({ name: 'CDN', initial: 0, weekly: CDN.weekly });
  return {
    initial: lines.reduce((a, l) => a + l.initial, 0),
    weekly: lines.reduce((a, l) => a + l.weekly, 0),
    lines,
  };
}

export function measuresCost(ids: string[]): { initial: number; weekly: number } {
  let initial = 0;
  let weekly = 0;
  for (const m of MEASURES) {
    if (!ids.includes(m.id)) continue;
    initial += m.initialCost;
    weekly += m.weeklyCost;
  }
  return { initial, weekly };
}

export function processWeeklyCost(c: CaseDef, d: Design): number {
  return c.processes.reduce((a, p) => a + (chosenOption(c, d, p.id).weeklyCost ?? 0), 0);
}

/** 運用中に毎週かかる費用の合計（人件費は除く） */
export function weeklyRunningCost(c: CaseDef, d: Design, dataGB: number, extraServers = 0): number {
  return (
    infraCost(d.infra, extraServers).weekly +
    measuresCost(d.measures).weekly +
    backupMetrics(d.backup, dataGB).weeklyCost +
    processWeeklyCost(c, d)
  );
}

/** 週 w の時点のデータ量 */
export function dataAt(c: CaseDef, weeks: number): Record<string, number> {
  const r: Record<string, number> = {};
  for (const item of c.data) r[item.key] = Math.round(item.initial * Math.pow(1 + item.growthPerWeek, weeks));
  return r;
}

/** ピーク時（イベントの最大倍率）のリクエスト数 */
export function peakLambda(c: CaseDef): number {
  const m = Math.max(1, ...c.traffic.events.map((e) => e.multiplier));
  return c.traffic.base * Math.pow(1 + c.traffic.growthPerWeek, c.opsWeeks) * m;
}

/** データベース設計パズルの正解率（0〜1） */
export function dataModelScore(c: CaseDef, d: Design): number {
  const attrs = c.dataModel.attributes;
  if (attrs.length === 0) return 1;
  let ok = 0;
  for (const a of attrs) if (a.answer.includes(d.dataModel[a.id])) ok++;
  return ok / attrs.length;
}

export const fmt = (n: number, digits = 0) =>
  Number.isFinite(n) ? n.toLocaleString('ja-JP', { maximumFractionDigits: digits, minimumFractionDigits: digits }) : '∞';

export const fmtTime = (sec: number) => {
  if (!Number.isFinite(sec)) return '∞';
  if (sec < 1) return `${fmt(sec * 1000)} ms`;
  if (sec < 120) return `${fmt(sec, 2)} 秒`;
  if (sec < 7200) return `${fmt(sec / 60, 1)} 分`;
  return `${fmt(sec / 3600, 1)} 時間`;
};

export const pct = (x: number, digits = 1) => `${fmt(x * 100, digits)}%`;
