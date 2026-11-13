// ============================================================
// 案件（プロジェクト）の進め方に関する計算
// 問題が解決したかの判定、開発タスクの作成、満足度の計算など。
// ============================================================
import { AUTOSCALE_MAX, MEASURES, measureById } from './catalog';
import {
  backupMetrics,
  chosenOption,
  dataAt,
  dataModelScore,
  evaluateLoad,
  peakLambda,
  systemAvailability,
} from './calc';
import type { CaseDef, Design, Problem, Project, SolveCond, Task } from './types';

export function defaultDesign(c: CaseDef): Design {
  const processes: Record<string, string> = {};
  for (const p of c.processes) processes[p.id] = p.options[0].id;
  return {
    dataModel: {},
    processes,
    infra: {
      hosting: 'onprem',
      webTier: 'S',
      webCount: 1,
      lb: false,
      dbTier: 'S',
      dbReplica: false,
      network: '100M',
      cdn: false,
      autoscale: false,
    },
    measures: [],
    backup: { type: 'none', interval: 'daily', generations: 7, offsite: false },
  };
}

/** 評判が高いほど、大きな予算で受注できる（0.8〜1.5倍） */
export function budgetFor(c: CaseDef, reputation: number): number {
  const m = Math.max(0.8, Math.min(1.5, 1 + reputation * 0.015));
  return Math.round((c.budget * m) / 10) * 10;
}

export function newProject(c: CaseDef, week: number, reputation = 0): Project {
  return {
    caseId: c.id,
    budget: budgetFor(c, reputation),
    lowSatWeeks: 0,
    phase: 'investigate',
    startWeek: week,
    days: 0,
    contract: null,
    nda: false,
    spent: 0,
    received: 0,
    done: [],
    facts: [],
    foundProblems: c.problems.filter((p) => p.visible).map((p) => p.id),
    quizAnswers: {},
    features: c.features.filter((f) => f.required).map((f) => f.id),
    design: defaultDesign(c),
    designConfirmed: false,
    tasks: [],
    assignments: {},
    devWeeks: 0,
    bugs: 0,
    overtime: false,
    changeOffered: false,
    changeAccepted: false,
    deadlineExtension: 0,
    pendingEvent: null,
    releaseWeek: null,
    delivered: [],
    satisfaction: 50,
    repPenalty: 0,
    ops: null,
    notes: [],
  };
}

export type SolveMode = 'plan' | 'delivered';

/** ピーク時のアクセスをさばけるか（理論値） */
export function canHandlePeak(c: CaseDef, d: Design): boolean {
  const data = dataAt(c, c.deadlineWeeks + c.opsWeeks);
  const count = d.infra.hosting === 'cloud' && d.infra.autoscale ? AUTOSCALE_MAX : d.infra.webCount;
  const r = evaluateLoad(c, d, data, peakLambda(c), count);
  return r.lostRate === 0 && r.response <= c.responseTarget * 2;
}

export function condMet(c: CaseDef, p: Project, cond: SolveCond, mode: SolveMode): boolean {
  const d = p.design;
  if ('feature' in cond) return (mode === 'plan' ? p.features : p.delivered).includes(cond.feature);
  if ('option' in cond) return Object.values(d.processes).includes(cond.option);
  if ('measures' in cond) return cond.measures.every((m) => d.measures.includes(m));
  if ('minAvailability' in cond) return systemAvailability(d.infra) >= cond.minAvailability;
  if ('peakCapacity' in cond) return canHandlePeak(c, d);
  if ('backupOffsite' in cond) return d.backup.type !== 'none' && d.backup.offsite;
  return false;
}

export function isSolved(c: CaseDef, p: Project, prob: Problem, mode: SolveMode): boolean {
  return prob.solvedBy.some((cond) => condMet(c, p, cond, mode));
}

/** 解決できた問題の重要度の割合（0〜1） */
export function coverage(c: CaseDef, p: Project, mode: SolveMode): number {
  const total = c.problems.reduce((a, x) => a + x.severity, 0);
  const ok = c.problems.filter((x) => isSolved(c, p, x, mode)).reduce((a, x) => a + x.severity, 0);
  return total === 0 ? 1 : ok / total;
}

/** 条件を日本語で説明する（設計のヒント表示用） */
export function describeCond(c: CaseDef, cond: SolveCond): string {
  if ('feature' in cond) return `機能「${c.features.find((f) => f.id === cond.feature)?.name}」`;
  if ('option' in cond) {
    for (const pr of c.processes) {
      const o = pr.options.find((x) => x.id === cond.option);
      if (o) return `${pr.name}を「${o.name}」にする`;
    }
    return cond.option;
  }
  if ('measures' in cond) return `対策「${cond.measures.map((m) => measureById(m).name).join('」「')}」`;
  if ('minAvailability' in cond) return `理論稼働率 ${(cond.minAvailability * 100).toFixed(1)}% 以上`;
  if ('peakCapacity' in cond) return 'ピーク時のアクセスをさばける構成';
  if ('backupOffsite' in cond) return '遠隔地へのバックアップ';
  return '';
}

export function quizCorrect(c: CaseDef, p: Project): number {
  return c.problems.filter((x) => x.quiz && p.quizAnswers[x.id] === x.quiz.answer).length;
}

// ------------------------------------------------------------
// 開発タスク
// ------------------------------------------------------------
export const DEV_KINDS = new Set(['feature', 'db', 'logic', 'change', 'request', 'measure']);

export function infraEffort(d: Design): number {
  const i = d.infra;
  let e = i.hosting === 'onprem' ? 1.5 + 0.4 * i.webCount : 0.6 + 0.2 * i.webCount;
  if (i.lb) e += 0.4;
  if (i.dbReplica) e += 0.6;
  if (i.cdn) e += 0.2;
  if (i.autoscale) e += 0.3;
  return Math.round(e * 10) / 10;
}

export function buildTasks(c: CaseDef, p: Project): Task[] {
  const tasks: Task[] = [];
  const d = p.design;
  tasks.push({ id: 't-db', name: 'データベースの構築', kind: 'db', skill: 'dev', effort: 1 + c.dataModel.attributes.length * 0.05, progress: 0 });
  for (const fid of p.features) {
    const f = c.features.find((x) => x.id === fid)!;
    tasks.push({ id: `t-${f.id}`, name: `機能：${f.name}`, kind: 'feature', skill: f.skill, effort: f.effort, progress: 0, refId: f.id, optional: !f.required });
  }
  for (const pr of c.processes) {
    const o = chosenOption(c, d, pr.id);
    if (o.effort > 0) tasks.push({ id: `t-${o.id}`, name: `処理：${pr.name}（${o.name}）`, kind: 'logic', skill: 'dev', effort: o.effort, progress: 0, refId: o.id });
  }
  tasks.push({ id: 't-infra', name: `サーバー・ネットワークの構築（${d.infra.hosting === 'onprem' ? 'オンプレミス' : 'クラウド'}）`, kind: 'infra', skill: 'infra', effort: infraEffort(d), progress: 0 });
  for (const mid of d.measures) {
    const m = MEASURES.find((x) => x.id === mid)!;
    if (m.effort > 0) tasks.push({ id: `t-${m.id}`, name: `対策：${m.name}`, kind: 'measure', skill: m.skill, effort: m.effort, progress: 0, refId: m.id });
  }
  if (d.backup.type !== 'none') tasks.push({ id: 't-backup', name: 'バックアップの仕組みづくり', kind: 'backup', skill: 'infra', effort: 0.5, progress: 0 });
  tasks.push({ id: 't-test', name: 'テスト', kind: 'test', skill: 'dev', effort: testEffort(tasks), progress: 0, optional: true });
  return tasks;
}

export function testEffort(tasks: Task[]): number {
  const devTotal = tasks.filter((t) => DEV_KINDS.has(t.kind)).reduce((a, t) => a + t.effort, 0);
  return Math.max(1, Math.round(devTotal * 0.25 * 2) / 2);
}

export const taskDone = (t: Task) => !t.continuous && t.progress >= t.effort - 1e-9;

export function canRelease(p: Project): boolean {
  return p.tasks.every((t) => t.optional || t.continuous || taskDone(t));
}

/** 全体の予定工数（人週） */
export function totalEffort(c: CaseDef, p: Project): number {
  return buildTasks(c, p).reduce((a, t) => a + t.effort, 0);
}

/** 期限（週） */
export function deadlineWeek(c: CaseDef, p: Project): number {
  return p.startWeek + c.deadlineWeeks + p.deadlineExtension;
}

/** リリース時点の満足度 */
export function initialSatisfaction(c: CaseDef, p: Project, lateWeeks: number): { value: number; notes: string[] } {
  const notes: string[] = [];
  const cov = coverage(c, p, 'delivered');
  let s = 25 + 50 * cov;
  notes.push(`問題の解決度 ${(cov * 100).toFixed(0)}% → +${(50 * cov).toFixed(0)}`);
  let bonus = 0;
  for (const fid of p.delivered) bonus += c.features.find((f) => f.id === fid)?.satisfaction ?? 0;
  for (const pr of c.processes) bonus += chosenOption(c, p.design, pr.id).satisfaction ?? 0;
  if (p.changeAccepted) bonus += c.changeRequest.satisfaction;
  if (bonus) notes.push(`便利な機能・追加対応 +${bonus}`);
  s += bonus;
  const dm = dataModelScore(c, p.design);
  s += dm * 8;
  notes.push(`データベース設計の正しさ ${(dm * 100).toFixed(0)}% → +${(dm * 8).toFixed(1)}`);
  const q = quizCorrect(c, p);
  if (q) {
    s += q * 2;
    notes.push(`原因を正しく見抜いた（${q}問） +${q * 2}`);
  }
  if (lateWeeks > 0) {
    s -= lateWeeks * 4;
    notes.push(`納期遅れ ${lateWeeks}週 → −${lateWeeks * 4}`);
  }
  return { value: Math.max(0, Math.min(100, s)), notes };
}

/** 設計の気になる点（警告）を集める */
export function designWarnings(c: CaseDef, p: Project): string[] {
  const d = p.design;
  const w: string[] = [];
  const unassigned = c.dataModel.attributes.filter((a) => !d.dataModel[a.id]).length;
  if (unassigned) w.push(`データベース設計で、まだ表に入れていない項目が ${unassigned} 個あります。`);
  if (d.backup.type === 'none') w.push('バックアップがありません。故障や誤操作でデータを失うと取り返しがつきません。');
  else if (!backupMetrics(d.backup, c.dataGB).feasible) w.push('バックアップが次の回までに終わりません（間隔が短すぎるか、方式が重すぎます）。');
  if (d.infra.webCount > 1 && !d.infra.lb) w.push('Webサーバーが複数ありますが、ロードバランサがないので振り分けられません。');
  if (c.personalData !== 'none' && !d.measures.includes('tls')) w.push('個人情報を扱うのに、通信が暗号化（TLS）されていません。');
  const knowPeak = !c.traffic.peakFact || p.facts.includes(c.traffic.peakFact);
  if (knowPeak && !canHandlePeak(c, d)) w.push('今の構成では、ピーク時のアクセスをさばけない見込みです。');
  if (!knowPeak) w.push('ピーク時のアクセス量を調べていないので、構成が足りるか分かりません。');
  return w;
}
