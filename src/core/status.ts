// ============================================================
// 画面下部の「状態」：満足度・安定性・処理速度・安全性・開発の進み具合・運用コスト
// ひとつの点数にまとめず、項目ごとに「数値」と「言葉」で表す。
// ============================================================
import { MEASURES, THREATS } from './catalog';
import { dataAt, evaluateLoad, fmt, fmtTime, systemAvailability, weeklyRunningCost } from './calc';
import { caseById } from './cases';
import { coverage, taskDone } from './project';
import type { CaseDef, GameState } from './types';

export type Tone = 'good' | 'warn' | 'bad' | 'none';

export interface StatusItem {
  id: 'satisfaction' | 'stability' | 'speed' | 'security' | 'progress' | 'cost';
  label: string;
  value: number | null; // 0〜100 のメーター用（なければ null）
  display: string; // 詳細表示の数値
  word: string; // かんたん表示の言葉
  tone: Tone;
  detail: string; // 何を表しているか
  delta?: string; // 先週からの変化
  deltaGood?: boolean;
  term?: string;
}

/** 1週間のうちに何かの攻撃・事故が起きる確率 */
export function weeklyRisk(c: CaseDef, measures: string[]): number {
  let none = 1;
  for (const th of THREATS) {
    let prob = th.basePerWeek * (c.threats[th.id] ?? 0);
    for (const m of MEASURES) if (measures.includes(m.id)) prob *= 1 - (m.mitigates[th.id] ?? 0);
    none *= 1 - prob;
  }
  return 1 - none;
}

export function computeStatus(s: GameState): StatusItem[] {
  const p = s.project;
  if (!p) {
    return [
      { id: 'satisfaction', label: '満足度', value: null, display: '—', word: '案件なし', tone: 'none', detail: '依頼主がどれだけ満足しているか' },
      { id: 'stability', label: '安定性', value: null, display: '—', word: '—', tone: 'none', detail: 'システムが止まらずに動くか（稼働率）' },
      { id: 'speed', label: '処理速度', value: null, display: '—', word: '—', tone: 'none', detail: '利用者を待たせずに応答できるか' },
      { id: 'security', label: '安全性', value: null, display: '—', word: '—', tone: 'none', detail: '攻撃や事故への備え' },
      { id: 'progress', label: '開発の進み具合', value: null, display: '—', word: '—', tone: 'none', detail: '作業がどこまで進んだか' },
      { id: 'cost', label: '運用コスト', value: null, display: '—', word: '—', tone: 'none', detail: '機器やサービスに毎週かかる費用' },
    ];
  }
  const c = caseById(p.caseId);
  const d = p.design;
  const h = p.ops?.history ?? [];
  const last = h[h.length - 1];
  const prev = h[h.length - 2];
  const before = p.phase === 'investigate' || p.phase === 'requirements';
  const items: StatusItem[] = [];

  // 満足度
  if (p.phase === 'operate' || p.phase === 'done') {
    const v = p.satisfaction;
    const dlt = last && prev ? last.satisfaction - prev.satisfaction : last ? 0 : undefined;
    items.push({
      id: 'satisfaction',
      label: '満足度',
      value: v,
      display: fmt(v),
      word: v >= 70 ? '満足' : v >= 40 ? 'ふつう' : '不満',
      tone: v >= 70 ? 'good' : v >= 40 ? 'warn' : 'bad',
      detail: '依頼主・利用者がどれだけ満足しているか（20未満が3週続くと契約打ち切り）',
      delta: dlt === undefined ? undefined : `${dlt >= 0 ? '+' : ''}${fmt(dlt, 1)}`,
      deltaGood: dlt === undefined ? undefined : dlt >= 0,
    });
  } else {
    const v = 25 + 50 * coverage(c, p, 'plan');
    items.push({
      id: 'satisfaction',
      label: '満足度（見込み）',
      value: v,
      display: fmt(v),
      word: v >= 70 ? '期待できる' : v >= 50 ? 'まずまず' : '物足りない',
      tone: v >= 70 ? 'good' : v >= 50 ? 'warn' : 'bad',
      detail: '今の計画で問題がどれだけ解決するかから見積もった満足度',
    });
  }

  // 安定性（稼働率）
  if (last) {
    const recent = h.slice(-4);
    const a = 1 - recent.reduce((x, r) => x + r.outageHours, 0) / (recent.length * 168);
    const pa = prev ? 1 - prev.outageHours / 168 : undefined;
    const la = 1 - last.outageHours / 168;
    items.push({
      id: 'stability',
      label: '安定性',
      value: Math.max(0, (a - 0.95) / 0.05) * 100,
      display: `稼働率 ${(a * 100).toFixed(2)}%`,
      word: a >= 0.999 ? 'とても安定' : a >= 0.995 ? '安定' : a >= 0.98 ? 'ときどき止まる' : '不安定',
      tone: a >= 0.995 ? 'good' : a >= 0.98 ? 'warn' : 'bad',
      detail: '最近4週間で、システムが動いていた時間の割合',
      delta: pa === undefined ? undefined : `${la - pa >= 0 ? '+' : ''}${((la - pa) * 100).toFixed(2)}pt`,
      deltaGood: pa === undefined ? undefined : la >= pa,
      term: 'availability',
    });
  } else if (before) {
    items.push({ id: 'stability', label: '安定性', value: null, display: '設計前', word: '未設計', tone: 'none', detail: 'システムが止まらずに動くか（稼働率）', term: 'availability' });
  } else {
    const a = systemAvailability(d.infra);
    items.push({
      id: 'stability',
      label: '安定性（理論値）',
      value: Math.max(0, (a - 0.95) / 0.05) * 100,
      display: `稼働率 ${(a * 100).toFixed(2)}%`,
      word: a >= 0.999 ? 'とても安定' : a >= 0.995 ? '安定' : a >= 0.99 ? 'やや不安' : '不安定',
      tone: a >= 0.995 ? 'good' : a >= 0.99 ? 'warn' : 'bad',
      detail: `構成から計算した理論上の稼働率（年間 約${fmt((1 - a) * 8760)}時間停止）`,
      term: 'availability',
    });
  }

  // 処理速度
  const target = c.responseTarget;
  const speedItem = (resp: number, lost: number, label: string, detail: string, dlt?: number): StatusItem => ({
    id: 'speed',
    label,
    value: lost > 0 ? 0 : Math.max(0, Math.min(100, (1 - resp / (target * 2)) * 100)),
    display: lost > 0 ? `エラー ${(lost * 100).toFixed(0)}%` : `応答 ${fmtTime(resp)}`,
    word: lost > 0 ? 'さばけない' : resp <= target * 0.5 ? '余裕あり' : resp <= target ? '十分' : resp <= target * 2 ? '遅い' : 'とても遅い',
    tone: lost > 0 ? 'bad' : resp <= target ? 'good' : resp <= target * 2 ? 'warn' : 'bad',
    detail,
    delta: dlt === undefined ? undefined : `${dlt > 0 ? '+' : dlt < 0 ? '−' : '±'}${fmtTime(Math.abs(dlt))}`,
    deltaGood: dlt === undefined ? undefined : dlt <= 0,
    term: 'response-time',
  });
  if (last) items.push(speedItem(last.response, last.lostRate, '処理速度', `先週のピーク時の平均応答時間（目標 ${fmtTime(target)}）`, prev ? last.response - prev.response : undefined));
  else if (!before) {
    const knowBase = !c.traffic.peakFact || p.facts.includes('traffic-base');
    const knowData = c.data.every((x) => !x.fact || p.facts.includes(x.fact));
    if (knowBase && knowData) {
      const e = evaluateLoad(c, d, dataAt(c, c.deadlineWeeks), c.traffic.base, d.infra.webCount);
      items.push(speedItem(e.response, e.lostRate, '処理速度（見込み）', `平常時の見積もり（目標 ${fmtTime(target)}）`));
    } else items.push({ id: 'speed', label: '処理速度', value: null, display: '見積もれない', word: '未調査', tone: 'none', detail: 'アクセス量やデータ量を調査すると見積もれる', term: 'response-time' });
  } else items.push({ id: 'speed', label: '処理速度', value: null, display: '設計前', word: '未設計', tone: 'none', detail: '利用者を待たせずに応答できるか', term: 'response-time' });

  // 安全性
  const risk = weeklyRisk(c, d.measures);
  const base = weeklyRisk(c, []);
  const sv = base > 0 ? (1 - risk / base) * 100 : 100;
  items.push({
    id: 'security',
    label: '安全性',
    value: before ? null : sv,
    display: before ? '設計前' : `事故の確率 ${(risk * 100).toFixed(1)}%/週`,
    word: before ? '未設計' : risk < 0.05 ? '堅い' : risk < 0.12 ? 'ふつう' : risk < 0.2 ? '弱い' : '危険',
    tone: before ? 'none' : risk < 0.05 ? 'good' : risk < 0.12 ? 'warn' : 'bad',
    detail: '攻撃・事故が1週間のうちに1つでも起きる確率（対策で下がる）',
    term: 'cia',
  });

  // 開発の進み具合
  const phaseIdx = ['investigate', 'requirements', 'design', 'develop', 'operate', 'done'].indexOf(p.phase);
  if (p.phase === 'develop') {
    const total = p.tasks.reduce((a, t) => a + t.effort, 0);
    const done = p.tasks.reduce((a, t) => a + Math.min(t.effort, t.progress), 0);
    const v = (done / Math.max(1e-9, total)) * 100;
    const left = p.startWeek + c.deadlineWeeks + p.deadlineExtension - s.week;
    const remain = total - done;
    const rate = s.staff.length * 0.9;
    const ok = remain / rate <= left;
    items.push({
      id: 'progress',
      label: '開発の進み具合',
      value: v,
      display: `${fmt(v)}%（残り ${fmt(remain, 1)}人週）`,
      word: p.tasks.filter((t) => !t.optional).every(taskDone) ? 'リリースできる' : ok ? '順調' : '遅れぎみ',
      tone: ok ? 'good' : 'warn',
      detail: `タスクの完了率。納期まであと${left}週`,
      term: 'wbs',
    });
  } else {
    items.push({
      id: 'progress',
      label: '開発の進み具合',
      value: phaseIdx >= 4 ? 100 : (phaseIdx / 4) * 30,
      display: phaseIdx >= 4 ? '完成・運用中' : ['調査中', '要件定義中', '設計中'][phaseIdx],
      word: phaseIdx >= 4 ? '完成' : ['調査中', '要件定義中', '設計中'][phaseIdx],
      tone: phaseIdx >= 4 ? 'good' : 'none',
      detail: 'プロジェクトの段階',
      term: 'wbs',
    });
  }

  // 運用コスト
  if (before) items.push({ id: 'cost', label: '運用コスト', value: null, display: '設計前', word: '未設計', tone: 'none', detail: '機器やサービスに毎週かかる費用' });
  else {
    const cost = last ? last.cost : weeklyRunningCost(c, d, c.dataGB);
    const ratio = cost / c.maintenanceFee;
    items.push({
      id: 'cost',
      label: '運用コスト',
      value: Math.min(100, ratio * 100),
      display: `${fmt(cost, 1)}万円/週`,
      word: ratio < 0.4 ? '安い' : ratio < 0.8 ? '保守費の範囲内' : ratio < 1 ? 'ぎりぎり' : '赤字',
      tone: ratio < 0.8 ? 'good' : ratio < 1 ? 'warn' : 'bad',
      detail: `機器・サービス・バックアップの費用（人件費を除く）。保守費は ${c.maintenanceFee}万円/週`,
      delta: last && prev ? `${last.cost - prev.cost >= 0 ? '+' : ''}${fmt(last.cost - prev.cost, 1)}万円` : undefined,
      deltaGood: last && prev ? last.cost <= prev.cost : undefined,
    });
  }
  // 変化がなかった項目は、矢印（良くなった・悪くなった）を出さない
  for (const it of items) {
    if (it.delta && /^[+±−-]?0(\.0+)?\D*$/.test(it.delta.replace(/\s/g, ''))) {
      it.delta = undefined;
      it.deltaGood = undefined;
    }
  }
  return items;
}
