// ============================================================
// 「対応が必要なこと」の一覧（司令室の左側）
// ゲームの状態から、依頼・警告・要望・やるべき作業を作り、
// それぞれに「何が起きているか・影響・期限・放置したら・関係する機器・対応候補」をつける。
// ============================================================
import { BACKUP_INTERVALS, MEASURES, THREATS, requiredLegal } from './catalog';
import { backupMetrics, chosenOption, dataAt, evaluateLoad, fmt, fmtTime, infraCost, singlePoints, systemAvailability } from './calc';
import { CASES, caseById } from './cases';
import type { Action } from './game';
import { budgetFor, canRelease, deadlineWeek, describeCond, designWarnings, isSolved, taskDone } from './project';
import { weeklyRisk } from './status';
import { fmtDate } from './time';
import type { CaseDef, GameState, Infra, Project, SolveCond, ThreatId, Tier } from './types';

export type Screen = 'main' | 'system' | 'business' | 'dev' | 'ops' | 'admin';

export interface IssueAction {
  label: string;
  desc: string;
  cost?: string;
  time?: string;
  effect?: string;
  risk?: string;
  recommended?: string; // おすすめの理由（かんたん表示で強調）
  action?: Action;
  screen?: Screen;
  disabled?: string;
}

export interface Issue {
  id: string;
  kind: 'case' | 'task' | 'alert' | 'request' | 'news';
  tone: 'info' | 'warn' | 'bad' | 'security' | 'good';
  title: string;
  what: string;
  affected: string;
  deadline?: string;
  ifIgnored?: string;
  related: string[]; // 構成図で強調するノード
  dept: string; // 関係する部門
  causes?: string[];
  steps?: string[]; // 復旧の手順など
  actions: IssueAction[];
  terms?: string[];
}

const TIER_NEXT: Record<Tier, Tier | null> = { S: 'M', M: 'L', L: null };
const TIER_NAME: Record<Tier, string> = { S: '小型', M: '中型', L: '大型' };

/** 構成変更をアクションにする（設計中はすぐ反映、運用中は申し込み） */
export function infraAction(p: Project, patch: Partial<Infra>): { action?: Action; disabled?: string; time: string } {
  const merged = { ...p.design.infra, ...patch };
  if (merged.webCount > 1 || merged.autoscale) merged.lb = true;
  if (p.phase === 'design') return { action: { type: 'setInfra', patch }, time: '設計に反映' };
  if (p.phase === 'operate') {
    if (p.ops?.pendingInfra) return { disabled: '構成変更の申し込み中', time: '' };
    return { action: { type: 'applyInfraChange', infra: merged }, time: p.design.infra.hosting === 'onprem' ? '2週間後に完了（機器の調達）' : 'すぐ反映（クラウド）' };
  }
  return { disabled: '設計フェーズか運用フェーズで変更できます', time: '' };
}

/** 処理能力・安定性を上げる構成変更の候補 */
export function infraCandidates(_s: GameState, c: CaseDef, p: Project, lambda: number): IssueAction[] {
  const cur = p.design.infra;
  const data = p.ops?.data && Object.keys(p.ops.data).length ? p.ops.data : dataAt(c, c.deadlineWeeks + c.opsWeeks);
  const count = (i: Infra) => (i.hosting === 'cloud' && i.autoscale ? 10 : i.webCount);
  const before = evaluateLoad(c, p.design, data, lambda, count(cur), cur);
  const cands: { label: string; desc: string; patch: Partial<Infra>; risk?: string }[] = [];
  if (cur.webCount < 8) cands.push({ label: `Webサーバーを1台増やす（${cur.webCount}→${cur.webCount + 1}台）`, desc: 'スケールアウト。台数を増やして処理を分担し、故障にも強くなる。', patch: { webCount: cur.webCount + 1 } });
  const nt = TIER_NEXT[cur.webTier];
  if (nt) cands.push({ label: `Webサーバーを${TIER_NAME[nt]}に替える`, desc: 'スケールアップ。1台の性能を上げる。構成は変わらないが、1台なので故障には弱いまま。', patch: { webTier: nt } });
  if (!cur.cdn) cands.push({ label: 'CDN を使う', desc: '画像などを CDN から配信し、回線とサーバーの負担を減らす。', patch: { cdn: true } });
  if (cur.hosting === 'cloud' && !cur.autoscale) cands.push({ label: 'オートスケールを使う', desc: '負荷に合わせて自動でサーバーを増やす（最大10台）。増えた分だけ費用がかかる。', patch: { autoscale: true }, risk: 'アクセスが多い週は費用が増える' });
  if (before.netRho > 0.6 && cur.network !== '10G') cands.push({ label: `回線を ${cur.network === '100M' ? '1Gbps' : '10Gbps'} にする`, desc: '帯域幅を広げて、通信の混雑を解消する。', patch: { network: cur.network === '100M' ? '1G' : '10G' } });
  const dnt = TIER_NEXT[cur.dbTier];
  if (before.dbRho > 0.6 && dnt) cands.push({ label: `DBサーバーを${TIER_NAME[dnt]}に替える`, desc: 'データベースの処理能力を上げる。', patch: { dbTier: dnt } });
  const c0 = infraCost(cur);
  const out: IssueAction[] = [];
  let best: { i: number; cost: number } | null = null;
  cands.forEach((cd, idx) => {
    const next = { ...cur, ...cd.patch };
    if (next.webCount > 1 || next.autoscale) next.lb = true;
    const r = evaluateLoad(c, { ...p.design, infra: next }, data, lambda, count(next), next);
    const c1 = infraCost(next);
    const addInit = Math.max(0, c1.initial - c0.initial);
    const addWeekly = c1.weekly - c0.weekly;
    const ia = infraAction(p, cd.patch);
    const okNow = r.lostRate === 0 && r.response <= c.responseTarget;
    if (okNow) {
      const score = addInit / 10 + addWeekly;
      if (!best || score < best.cost) best = { i: idx, cost: score };
    }
    out.push({
      label: cd.label,
      desc: cd.desc,
      cost: `${addInit ? `初期 +${fmt(addInit)}万円 / ` : ''}毎週 ${addWeekly >= 0 ? '+' : ''}${fmt(addWeekly, 1)}万円`,
      time: ia.time,
      effect:
        before.lostRate > 0 || r.lostRate > 0
          ? `処理能力 ${fmt(before.capacity)}→${fmt(r.capacity)}件/秒、エラー ${(before.lostRate * 100).toFixed(0)}%→${(r.lostRate * 100).toFixed(0)}%`
          : `応答 ${fmtTime(before.response)}→${fmtTime(r.response)}、稼働率 ${(systemAvailability(cur) * 100).toFixed(2)}→${(systemAvailability(next) * 100).toFixed(2)}%`,
      risk: cd.risk,
      action: ia.action,
      disabled: ia.disabled,
    });
  });
  if (best) out[(best as { i: number }).i].recommended = 'この中でいちばん費用をおさえて、目標の速さに届く';
  return out;
}

/** 安全性を上げる対策の候補（効果の大きい順） */
export function measureCandidates(c: CaseDef, p: Project, filter?: (id: string) => boolean, limit = 4, threat?: ThreatId): IssueAction[] {
  const cur = p.design.measures;
  const r0 = weeklyRisk(c, cur);
  // 実際に起きた脅威があるときは、その脅威に効く対策を先に並べる
  const hits = (id: string) => (threat ? (MEASURES.find((m) => m.id === id)?.mitigates[threat] ?? 0) : 0);
  const list = MEASURES.filter((m) => !cur.includes(m.id) && m.category === 'security' && (!filter || filter(m.id)))
    .map((m) => ({ m, r: weeklyRisk(c, [...cur, m.id]) }))
    .filter((x) => x.r < r0 - 1e-6 || x.m.leakImpact)
    .sort((a, b) => hits(b.m.id) - hits(a.m.id) || a.r - b.r)
    .slice(0, limit);
  const thName = threat ? THREATS.find((t) => t.id === threat)?.name : undefined;
  return list.map(({ m, r }, i) => ({
    label: `対策「${m.name}」を入れる`,
    desc: m.desc,
    cost: `${m.initialCost ? `導入 ${m.initialCost}万円 / ` : ''}毎週 ${m.weeklyCost}万円${m.effort && p.phase === 'design' ? ` / ${m.effort}人週` : ''}`,
    time: p.phase === 'design' ? '開発で実装' : '翌週から効果',
    effect: r < r0 ? `事故の確率 ${(r0 * 100).toFixed(1)}%→${(r * 100).toFixed(1)}%/週` : '漏えいしたときの被害を小さくする',
    recommended: i !== 0 ? undefined : thName && hits(m.id) > 0 ? `今回の「${thName}」を直接防げる` : 'いま一番リスクを下げられる',
    action: p.phase === 'design' || p.phase === 'operate' ? { type: 'toggleMeasure', id: m.id } : undefined,
    disabled: p.phase === 'design' || p.phase === 'operate' ? undefined : '設計フェーズか運用フェーズで追加できます',
  }));
}

function condNodes(c: CaseDef, cond: SolveCond): string[] {
  if ('feature' in cond) return ['web', 'staff'];
  if ('option' in cond) {
    const pr = c.processes.find((x) => x.options.some((o) => o.id === cond.option));
    const o = pr?.options.find((x) => x.id === cond.option);
    return o?.mode === 'batch' ? ['batch', 'db'] : ['web', 'db'];
  }
  if ('measures' in cond) return ['guard', 'db'];
  if ('minAvailability' in cond) return ['web', 'db'];
  if ('peakCapacity' in cond) return ['internet', 'web'];
  return ['backup', 'offsite'];
}

const weekLeft = (s: GameState, week: number) => {
  const left = week - s.week;
  return `${fmtDate(week)}（${left > 0 ? `あと${left}週` : left === 0 ? '今週' : `${-left}週超過`}）`;
};

export function buildIssues(s: GameState): Issue[] {
  const p = s.project;
  const out: Issue[] = [];
  if (!p) {
    for (const c of CASES) {
      const locked = s.reputation < c.unlockRep;
      out.push({
        id: `case-${c.id}`,
        kind: 'case',
        tone: locked ? 'info' : 'good',
        title: `依頼：${c.client}`,
        what: c.request,
        affected: c.industry,
        deadline: `受注から${c.deadlineWeeks}週間で納品、その後${c.opsWeeks}週間の運用`,
        ifIgnored: 'ほかの会社に依頼されてしまうかもしれません（今は待ってくれます）',
        related: [],
        dept: '営業',
        actions: [
          {
            label: 'この依頼を受ける',
            desc: c.title,
            time: `開発 ${c.deadlineWeeks}週＋運用 ${c.opsWeeks}週`,
            effect: `受注額 ${fmt(budgetFor(c, s.reputation))}万円・難易度 ${'★'.repeat(c.difficulty)}${c.personalData !== 'none' ? '・個人情報あり' : ''}`,
            action: { type: 'startCase', caseId: c.id },
            disabled: locked ? `評判 ${c.unlockRep} 以上で受注できます` : undefined,
            recommended: c.difficulty === 1 ? '入門向け。最初の1件におすすめ' : undefined,
          },
        ],
      });
    }
    out.push({
      id: 'news-hire',
      kind: 'news',
      tone: 'info',
      title: 'ニュース：採用候補が来ています',
      what: `${s.candidates.length}人の候補がいます。得意分野の違う人を入れると、チームの弱点を補えます。`,
      affected: '自社のチーム',
      related: [],
      dept: '人事',
      actions: [{ label: '管理画面でチームを見る', desc: '採用・研修ができます', screen: 'admin' }],
    });
    return out;
  }
  const c = caseById(p.caseId);
  const d = p.design;
  const dl = deadlineWeek(c, p);

  // ---------------- 調査 ----------------
  if (p.phase === 'investigate') {
    const rest = c.stakeholders.filter((x) => !p.done.includes(x.id));
    out.push({
      id: 'task-investigate',
      kind: 'task',
      tone: 'warn',
      title: '依頼主が何に困っているか調べる',
      what: `${c.client}から相談を受けました。関係者へのヒアリングや業務データの分析で、問題と原因を見つけましょう。`,
      affected: c.client,
      deadline: weekLeft(s, dl) + ' が納期',
      ifIgnored: '問題を見落とすと、作ったシステムが役に立たず満足度が下がります',
      related: ['users', 'staff'],
      dept: '企画',
      actions: [
        ...rest.map((inv) => ({
          label: inv.name,
          desc: inv.role,
          time: `${inv.days}日（チームのスキルで変わる）`,
          action: { type: 'investigate', id: inv.id } as Action,
          disabled: inv.needsNda && !p.nda ? '先に秘密保持契約（NDA）が必要' : undefined,
          recommended: inv.kind === 'nda' ? 'データを見るために最初に必要' : undefined,
        })),
        { label: '調査を終えて要件定義へ', desc: '開発画面で、作る機能と契約を決めます', action: { type: 'finishInvestigation' }, screen: 'dev' },
      ],
      terms: ['hearing', 'root-cause'],
    });
  }
  // 見つかった問題（運用前）
  if (p.phase === 'investigate' || p.phase === 'requirements' || p.phase === 'design') {
    for (const pr of c.problems.filter((x) => p.foundProblems.includes(x.id))) {
      const solved = isSolved(c, p, pr, 'plan');
      const acts: IssueAction[] = [];
      if (pr.quiz && p.quizAnswers[pr.id] === undefined) acts.push({ label: '原因を考える（クイズ）', desc: pr.quiz.question, screen: 'dev', recommended: '正解すると依頼主の信頼が上がる' });
      if (!solved && p.phase === 'design') {
        for (const cond of pr.solvedBy) {
          if ('option' in cond) {
            const proc = c.processes.find((x) => x.options.some((o) => o.id === cond.option))!;
            const o = proc.options.find((x) => x.id === cond.option)!;
            acts.push({ label: `${proc.name}を「${o.name}」にする`, desc: o.desc, cost: o.effort ? `+${o.effort}人週` : undefined, action: { type: 'setProcess', proc: proc.id, option: o.id } });
          } else if ('measures' in cond) {
            for (const m of cond.measures.filter((x) => !d.measures.includes(x))) acts.push({ label: `対策「${MEASURES.find((x) => x.id === m)!.name}」を入れる`, desc: MEASURES.find((x) => x.id === m)!.desc, action: { type: 'toggleMeasure', id: m } });
          } else if ('backupOffsite' in cond) {
            acts.push({ label: '遠隔地にもバックアップを置く', desc: '災害で建物ごと使えなくなってもデータを守る', action: { type: 'setBackup', patch: { type: d.backup.type === 'none' ? 'incr' : d.backup.type, offsite: true } } });
          } else if ('peakCapacity' in cond) {
            const known = !c.traffic.peakFact || p.facts.includes(c.traffic.peakFact);
            if (known) acts.push(...infraCandidates(s, c, p, c.traffic.base * Math.pow(1 + c.traffic.growthPerWeek, c.opsWeeks) * Math.max(...c.traffic.events.map((e) => e.multiplier))));
            else acts.push({ label: 'アクセスログを調べる', desc: 'ピーク時のアクセス量が分からないと、必要な台数を決められない', disabled: '調査フェーズで分析できます' });
          } else if ('minAvailability' in cond) {
            acts.push(...infraCandidates(s, c, p, c.traffic.base).filter((a) => a.label.includes('増やす')));
            if (!d.infra.dbReplica) {
              const ia = infraAction(p, { dbReplica: true });
              acts.push({ label: '予備のDB（レプリカ）を置く', desc: 'DBが故障しても予備に切り替えて動き続ける', action: ia.action, time: ia.time });
            }
          } else if ('feature' in cond) {
            acts.push({ label: `機能「${c.features.find((f) => f.id === cond.feature)?.name}」`, desc: '要件定義で選ばなかったため、今回は作れません', disabled: '要件定義で選ぶ機能です' });
          }
        }
      }
      out.push({
        id: `prob-${pr.id}`,
        kind: 'alert',
        tone: solved ? 'good' : pr.severity === 3 ? 'bad' : 'warn',
        title: `${solved ? '解決の見込み' : '問題'}：${pr.title}`,
        what: pr.detail,
        affected: pr.who,
        deadline: `${fmtDate(dl)}の納品までに`,
        ifIgnored: `重要度${'●'.repeat(pr.severity)}。解決しないと満足度が上がりません`,
        related: [...new Set(pr.solvedBy.flatMap((x) => condNodes(c, x)))],
        dept: pr.who,
        causes: pr.solvedBy.map((x) => `解決方法：${describeCond(c, x)}`),
        actions: acts,
        terms: pr.terms,
      });
    }
  }
  if (p.phase === 'requirements') {
    out.unshift({
      id: 'task-req',
      kind: 'task',
      tone: 'warn',
      title: '作る機能と契約を決める',
      what: '見つけた問題を解決する機能を選び、請負か準委任かを決めます。',
      affected: c.client,
      deadline: weekLeft(s, dl) + ' が納期',
      ifIgnored: '決めないと設計に進めません',
      related: ['web'],
      dept: '企画',
      actions: [{ label: '開発画面で要件を決める', desc: '機能・契約の選択', screen: 'dev' }],
      terms: ['requirements'],
    });
  }
  // ---------------- 設計 ----------------
  if (p.phase === 'design') {
    for (const w of designWarnings(c, p)) {
      const backup = w.includes('バックアップ');
      const peak = w.includes('ピーク');
      const tls = w.includes('TLS');
      const lbw = w.includes('ロードバランサ');
      const dm = w.includes('データベース設計');
      out.push({
        id: `warn-${w.slice(0, 12)}`,
        kind: 'alert',
        tone: tls ? 'security' : 'warn',
        title: `設計の指摘：${w.split('。')[0]}`,
        what: w,
        affected: c.client,
        related: backup ? ['db', 'backup'] : peak ? ['internet', 'web'] : tls ? ['internet', 'guard'] : lbw ? ['web'] : ['db'],
        dept: '設計',
        actions: backup
          ? (['full', 'diff', 'incr'] as const).map((t) => ({
              label: `${t === 'full' ? 'フル' : t === 'diff' ? '差分' : '増分'}バックアップを毎日とる`,
              desc: t === 'full' ? '復元が簡単で速いが、容量と時間が一番かかる' : t === 'diff' ? '復元はフル＋差分1つ。容量は中くらい' : '容量が一番小さいが、復元は全部つなぐので遅い',
              effect: `RPO 24時間 / RTO ${fmt(backupMetrics({ ...d.backup, type: t, interval: 'daily' }, c.dataGB).rtoHours, 1)}時間`,
              cost: `毎週 ${fmt(backupMetrics({ ...d.backup, type: t, interval: 'daily' }, c.dataGB).weeklyCost, 1)}万円`,
              recommended: t === 'diff' ? '復元の速さと容量のバランスがよい' : undefined,
              action: { type: 'setBackup', patch: { type: t, interval: 'daily' } } as Action,
            }))
          : peak
            ? infraCandidates(s, c, p, c.traffic.base * Math.pow(1 + c.traffic.growthPerWeek, c.opsWeeks) * Math.max(...c.traffic.events.map((e) => e.multiplier)))
            : tls
              ? [{ label: '対策「通信の暗号化（TLS）」を入れる', desc: '通信を暗号化して盗聴を防ぐ', action: { type: 'toggleMeasure', id: 'tls' } }]
              : [{ label: 'システム画面で設計を見直す', desc: '', screen: 'system' }],
        terms: backup ? ['backup', 'rpo-rto'] : peak ? ['utilization', 'scale-out'] : tls ? ['tls'] : dm ? ['normalization'] : undefined,
      });
    }
    out.unshift({
      id: 'task-design',
      kind: 'task',
      tone: 'warn',
      title: 'システムの設計を決める',
      what: 'データベース、処理のアルゴリズム、サーバー構成、セキュリティ、バックアップを決めます。構成図の機器を選ぶと、右側で性能や費用を確かめられます。',
      affected: c.client,
      deadline: weekLeft(s, dl) + ' が納期',
      ifIgnored: '設計しないと開発を始められません',
      related: ['web', 'db', 'backup'],
      dept: '設計',
      actions: [
        { label: 'システム画面で設計する', desc: 'データベース・処理・構成・対策・バックアップ', screen: 'system' },
        { label: '設計を確定して開発へ', desc: '設計レビュー（1週間）のあと、初期費用を払って開発を始めます', action: { type: 'confirmDesign' }, risk: 'あとから構成を変えると運用中の費用や時間がかかる' },
      ],
    });
  }
  // ---------------- 開発 ----------------
  if (p.phase === 'develop') {
    if (p.pendingEvent) {
      const cr = c.changeRequest;
      out.push({
        id: 'req-change',
        kind: 'request',
        tone: 'bad',
        title: p.pendingEvent.title,
        what: p.pendingEvent.text,
        affected: c.client,
        deadline: '今すぐ（返事をするまで開発を進められません）',
        ifIgnored: '返事をしないと開発が止まります',
        related: ['web'],
        dept: '企画',
        actions: [
          { label: '受ける', desc: p.contract === 'ukeoi' ? '追加費用なしで受ける' : '準委任なので作業分の報酬が出る', cost: p.contract === 'ukeoi' ? '無償' : '依頼主が負担', time: `+${cr.effort}人週`, effect: `満足度 +${cr.satisfaction}`, risk: p.contract === 'ukeoi' ? '作業が増えて納期が苦しくなる' : undefined, action: { type: 'resolveEvent', choice: 'accept' } },
          ...(p.contract === 'ukeoi'
            ? [{ label: '追加費用と納期延長を交渉する', desc: '企画・調整スキルが高いほど成功しやすい', effect: `成功すれば +${Math.round(cr.effort * 30)}万円・納期+1週`, risk: '失敗すると変更は見送り（満足度−2）', recommended: '請負では、追加の作業は費用を相談するのが基本', action: { type: 'resolveEvent', choice: 'negotiate' } as Action }]
            : []),
          { label: '断る', desc: '作業は増えない', effect: '満足度 −4', action: { type: 'resolveEvent', choice: 'decline' } },
        ],
        terms: ['spec-change', p.contract ?? 'ukeoi'],
      });
    }
    const remain = p.tasks.filter((t) => !t.optional).reduce((a, t) => a + Math.max(0, t.effort - t.progress), 0);
    const left = dl - s.week;
    if (remain > Math.max(0, left) * s.staff.length * 0.9) {
      out.push({
        id: 'warn-deadline',
        kind: 'alert',
        tone: 'bad',
        title: '納期に間に合わないおそれ',
        what: `必須の作業が約${fmt(remain, 1)}人週残っています。今のチームでは納期までに終わらない見込みです。`,
        affected: c.client,
        deadline: weekLeft(s, dl),
        ifIgnored: '納期に遅れると満足度が週ごとに下がり、請負では遅延損害金がかかります',
        related: ['web', 'db'],
        dept: '開発',
        causes: ['作る機能が多い', 'スキルの合わないタスクに人が割り当てられている', '疲れて効率が落ちている'],
        actions: [
          { label: '残業する', desc: '作業量が1.3倍になる', effect: '進みが速くなる', risk: '疲労とバグが増える', action: { type: 'setOvertime', on: true } },
          { label: '得意なタスクに割り当て直す', desc: 'おまかせ割り当て', action: { type: 'autoAssign' } },
          { label: '人を採用する', desc: '管理画面で採用できる（採用費がかかる）', screen: 'admin' },
        ],
        terms: ['man-week', 'overtime'],
      });
    }
    const tired = s.staff.filter((m) => m.fatigue >= 70);
    if (tired.length)
      out.push({
        id: 'warn-fatigue',
        kind: 'alert',
        tone: 'warn',
        title: `疲れているメンバーがいます（${tired.map((m) => m.name.split(' ')[0]).join('・')}）`,
        what: '疲労が70を超えると効率が落ち、バグも増えます。80を超えると体調を崩すことがあります。',
        affected: '自社のチーム',
        related: [],
        dept: '開発',
        ifIgnored: '体調を崩して1週間休むことがある',
        actions: [{ label: '残業をやめる', desc: '', action: { type: 'setOvertime', on: false } }, { label: '開発画面で休ませる', desc: '担当を「休む」にする', screen: 'dev' }],
        terms: ['overtime'],
      });
    const test = p.tasks.find((t) => t.kind === 'test');
    if (canRelease(p) && !p.pendingEvent) {
      const tested = test && taskDone(test);
      out.unshift({
        id: 'task-release',
        kind: 'task',
        tone: tested ? 'good' : 'warn',
        title: tested ? 'リリースの準備ができました' : '必須の作業は終わりました（テストはまだ）',
        what: tested ? 'テストも終わりました。納品して運用を始められます。' : `テストが ${test ? fmt((test.progress / test.effort) * 100) : 0}% です。バグが多いまま公開すると、運用中に不具合が起きます。`,
        affected: c.client,
        deadline: weekLeft(s, dl),
        related: ['web', 'db'],
        dept: '開発',
        actions: [
          { label: 'リリースする', desc: '納品して運用を始める', action: { type: 'release' }, recommended: tested ? 'テスト済みで品質も安心' : undefined, risk: tested ? undefined : 'バグが残ったまま公開する' },
          ...(!tested ? [{ label: 'テストを続ける', desc: '開発画面でテストに人を割り当てる', screen: 'dev' as Screen, recommended: '公開前にバグを減らすほうが、あとで直すより安い' }] : []),
        ],
        terms: ['testing', 'bug'],
      });
    }
  }
  // ---------------- 運用 ----------------
  if (p.phase === 'operate' && p.ops) {
    const ops = p.ops;
    const last = ops.history[ops.history.length - 1];
    for (const inc of last?.incidents ?? []) {
      const sec = inc.kind === 'attack';
      const node = inc.node === 'edge' ? 'guard' : inc.node;
      let actions: IssueAction[] = [];
      if (inc.kind === 'overload') actions = inc.node === 'batch' ? batchActions(c, p) : infraCandidates(s, c, p, last.lambda);
      else if (sec) actions = measureCandidates(c, p, undefined, 4, inc.threat);
      else if (inc.node === 'db' && !d.infra.dbReplica) {
        const ia = infraAction(p, { dbReplica: true });
        actions = [{ label: '予備のDB（レプリカ）を置く', desc: '次に故障しても、すぐ切り替えて動き続ける', action: ia.action, time: ia.time, disabled: ia.disabled, recommended: '同じ故障で止まらなくなる' }];
      } else if (inc.node === 'web' && d.infra.webCount === 1) actions = infraCandidates(s, c, p, last.lambda).filter((a) => a.label.includes('増やす'));
      if (inc.title.includes('バグ')) actions = [{ label: 'バグ修正に人を割り当てる', desc: '運用画面で担当を決める', screen: 'ops' }];
      if (inc.title.includes('削除') || inc.title.includes('ランサム')) {
        if (d.backup.type === 'none') actions.push({ label: '毎日の差分バックアップを始める', desc: '次に同じことが起きても元に戻せる', action: { type: 'setBackup', patch: { type: 'diff', interval: 'daily' } } });
        else if (!d.backup.offsite) actions.push({ label: '遠隔地にもバックアップを置く', desc: 'ランサムウェアにバックアップごと暗号化されるのを防ぐ', action: { type: 'setBackup', patch: { offsite: true } } });
      }
      out.push({
        id: `inc-${last.week}-${inc.node}-${inc.title.slice(0, 8)}`,
        kind: 'alert',
        tone: sec ? 'security' : inc.kind === 'degraded' ? 'good' : inc.kind === 'warning' ? 'warn' : 'bad',
        title: `${sec ? 'セキュリティ' : inc.kind === 'degraded' ? '障害（継続できた）' : inc.kind === 'overload' ? '混雑' : '障害'}：${inc.title}`,
        what: `運用${last.week}週目に発生。`,
        affected: c.client + 'の利用者',
        ifIgnored: inc.kind === 'degraded' ? '冗長化のおかげで止まらずに済みました' : '同じことがまた起きると、満足度と評判が下がります',
        related: [node],
        dept: sec ? 'セキュリティ' : '運用',
        steps: inc.steps,
        actions,
        terms: sec ? ['cia'] : inc.kind === 'overload' ? ['utilization', 'queueing'] : ['mtbf-mttr', 'redundancy'],
      });
    }
    // さばけていないのに混雑の記録がない場合（古いセーブなど）も、警告を出す
    if (last && (last.lostRate > 0 || last.response > c.responseTarget * 2) && !(last.incidents ?? []).some((x) => x.kind === 'overload')) {
      const nodeId = (last.dbRho ?? 0) >= last.rho && (last.dbRho ?? 0) >= (last.netRho ?? 0) ? 'db' : (last.netRho ?? 0) > last.rho ? 'internet' : 'web';
      out.push({
        id: `load-${last.week}`,
        kind: 'alert',
        tone: last.lostRate > 0 ? 'bad' : 'warn',
        title: last.lostRate > 0 ? `混雑：アクセスの約${(last.lostRate * 100).toFixed(0)}%がエラー` : `混雑：応答が遅い（${fmtTime(last.response)}）`,
        what: `ピーク時に約${fmt(last.lambda)}件/秒のアクセスがあり、処理能力（約${fmt(last.capacity)}件/秒）を超えています。`,
        affected: `${c.client}の利用者`,
        ifIgnored: 'つながらない・遅い状態が続き、満足度が下がり続けます',
        related: ['internet', nodeId],
        dept: '運用',
        causes: ['アクセスの増加に、サーバーの台数や性能が追いついていない', '処理の計算量が大きく、データが増えるほど遅くなっている'],
        actions: infraCandidates(s, c, p, last.lambda),
        terms: ['utilization', 'queueing'],
      });
    }
    // 来週のイベント
    const next = c.traffic.events.find((e) => e.week === ops.week + 1);
    if (next) {
      const known = !c.traffic.peakFact || p.facts.includes(c.traffic.peakFact);
      const lam = c.traffic.base * Math.pow(1 + c.traffic.growthPerWeek, ops.week + 1) * next.multiplier;
      const data = ops.data && Object.keys(ops.data).length ? ops.data : dataAt(c, s.week - p.startWeek);
      const count = d.infra.hosting === 'cloud' && d.infra.autoscale ? 10 : d.infra.webCount;
      const r = evaluateLoad(c, d, data, lam, count);
      out.unshift({
        id: `news-${next.week}`,
        kind: 'news',
        tone: r.lostRate > 0 ? 'bad' : r.response > c.responseTarget ? 'warn' : 'info',
        title: `ニュース：来週「${next.name}」`,
        what: known ? `アクセスが平常時の約${next.multiplier}倍（約${fmt(lam)}件/秒）になる見込みです。今の構成だと${r.lostRate > 0 ? `約${(r.lostRate * 100).toFixed(0)}%がエラーになります` : `応答は約${fmtTime(r.response)}です`}。` : 'アクセスが増えそうです（どれくらい増えるかは調査していません）。',
        affected: `${c.client}の利用者`,
        deadline: `${fmtDate(s.week + 1)}（来週）`,
        ifIgnored: r.lostRate > 0 ? 'サイトがつながりにくくなり、満足度が大きく下がります' : '今の構成で乗り切れそうです',
        related: ['internet', 'web', 'db'],
        dept: '運用',
        actions: known && (r.lostRate > 0 || r.response > c.responseTarget) ? infraCandidates(s, c, p, lam) : [],
        terms: ['utilization', 'scale-out'],
      });
    }
    // 要望
    for (const id of ops.arrivedRequests.filter((x) => !ops.acceptedRequests.includes(x))) {
      const r = c.opsRequests.find((x) => x.id === id)!;
      out.push({
        id: `req-${id}`,
        kind: 'request',
        tone: 'info',
        title: `要望：${r.name}`,
        what: r.text,
        affected: r.from,
        ifIgnored: '放っておくと毎週少しずつ満足度が下がります',
        related: ['web', 'users'],
        dept: '企画',
        actions: [{ label: '対応する', desc: '改善タスクを作り、メンバーを割り当てる', time: `${r.effort}人週`, effect: `完成すると満足度 +${r.satisfaction}`, action: { type: 'acceptRequest', id }, recommended: '利用者の声をもとに改善を続ける（PDCA）' }],
        terms: ['pdca'],
      });
    }
    // バグ
    if (p.bugs >= 3) {
      const fixing = s.staff.some((m) => p.assignments[m.id] === 't-bugfix');
      out.push({
        id: 'warn-bugs',
        kind: 'alert',
        tone: 'warn',
        title: `バグが約${Math.round(p.bugs)}件残っています`,
        what: '残ったバグは、毎週ある確率で不具合を起こします。',
        affected: `${c.client}の利用者`,
        ifIgnored: '不具合が起きるたびに満足度が下がる',
        related: ['web'],
        dept: '開発',
        actions: fixing ? [] : [{ label: 'バグ修正に人を割り当てる', desc: '運用画面で担当を決める', screen: 'ops' }],
        terms: ['bug'],
      });
    }
    // 監視なし
    if (!s.staff.some((m) => p.assignments[m.id] === 't-monitor'))
      out.push({
        id: 'warn-monitor',
        kind: 'alert',
        tone: 'warn',
        title: 'だれも運用監視をしていません',
        what: '監視していないと、障害に気づくのが遅れ、復旧まで丸1日かかります。',
        affected: c.client,
        related: ['web', 'db'],
        dept: '運用',
        ifIgnored: '障害のたびに長く止まる（MTTRが長い）',
        actions: [{ label: '運用画面で監視を割り当てる', desc: '運用スキルの高い人がおすすめ', screen: 'ops' }],
        terms: ['mtbf-mttr'],
      });
    // 監査
    const missing = requiredLegal(c.personalData, d.infra.hosting).filter((id) => !d.measures.includes(id));
    if (!ops.auditDone && missing.length) {
      const aw = s.week + Math.max(0, Math.ceil(c.opsWeeks / 2) - ops.week);
      out.push({
        id: 'task-audit',
        kind: 'task',
        tone: 'security',
        title: '個人情報の取扱いの点検があります',
        what: `${c.personalData === 'sensitive' ? '要配慮個人情報' : '個人情報'}を扱っているので、個人情報保護法に沿った対応ができているか点検されます。`,
        affected: `${c.client}・利用者`,
        deadline: weekLeft(s, aw),
        ifIgnored: '不十分な点が見つかると、満足度と評判が下がります',
        related: ['db', 'staff'],
        dept: '法務',
        actions: missing.map((id) => {
          const m = MEASURES.find((x) => x.id === id)!;
          return { label: `「${m.name}」を整える`, desc: m.desc, action: { type: 'toggleMeasure', id } as Action };
        }),
        terms: ['appi'],
      });
    }
    // 単一障害点
    const sp = singlePoints(d.infra);
    if (sp.length && !ops.pendingInfra)
      out.push({
        id: 'task-spof',
        kind: 'task',
        tone: 'info',
        title: `単一障害点があります（${sp.length}か所）`,
        what: `${sp.join('、')}が壊れると、システム全体が止まります。`,
        affected: c.client,
        related: sp.some((x) => x.includes('データベース')) ? ['db', 'web'] : ['web'],
        dept: '運用',
        ifIgnored: '故障したときに長く止まるおそれ',
        actions: [
          ...(d.infra.webCount === 1 ? infraCandidates(s, c, p, last?.lambda ?? c.traffic.base).filter((a) => a.label.includes('増やす')) : []),
          ...(!d.infra.dbReplica ? [{ label: '予備のDB（レプリカ）を置く', desc: 'DBの故障に備える', ...infraAction(p, { dbReplica: true }) }] : []),
        ],
        terms: ['spof', 'redundancy'],
      });
    // 安全性
    const risk = weeklyRisk(c, d.measures);
    if (risk >= 0.12)
      out.push({
        id: 'task-security',
        kind: 'task',
        tone: 'security',
        title: `攻撃・事故への備えが弱い（${(risk * 100).toFixed(0)}%/週）`,
        what: '1週間のうちに何かの攻撃や事故が起きる確率が高い状態です。',
        affected: `${c.client}の利用者`,
        related: ['guard', 'db'],
        dept: 'セキュリティ',
        ifIgnored: '情報漏えいなどが起きると満足度・評判が大きく下がります',
        actions: measureCandidates(c, p),
        terms: ['cia'],
      });
  }
  if (p.phase === 'done') {
    out.push({
      id: 'task-finish',
      kind: 'task',
      tone: 'good',
      title: '運用保守の期間が終わりました',
      what: '依頼主から評価を受けて、案件を完了しましょう。',
      affected: c.client,
      related: [],
      dept: '営業',
      actions: [{ label: '評価を受ける', desc: '開発画面で振り返りを見られます', screen: 'dev' }],
    });
  }
  // 調査で見つけたが、運用前のフェーズ以外では不要な情報は出さない
  const rank = { bad: 0, security: 1, warn: 2, info: 3, good: 4 } as const;
  const kindRank = { request: 0, task: 1, alert: 2, news: 3, case: 4 } as const;
  // 運用前は「やること」（いまの段階の作業）をいちばん上に。そのあとは緊急度の順
  const first = (x: Issue) => (x.kind === 'task' && p.phase !== 'operate' ? 0 : 1);
  return out.sort((a, b) => first(a) - first(b) || rank[a.tone] - rank[b.tone] || kindRank[a.kind] - kindRank[b.kind]);
}

export function batchActions(c: CaseDef, p: Project): IssueAction[] {
  const out: IssueAction[] = [];
  for (const pr of c.processes) {
    const cur = chosenOption(c, p.design, pr.id);
    if (cur?.mode !== 'batch') continue;
    out.push({
      label: `${pr.name}の方式を見直す`,
      desc: `今は「${cur.name}」（計算量が大きいと、データが増えたとき急に遅くなる）。運用中のプログラム変更は次の版で対応します。`,
      disabled: 'アルゴリズムの変更は設計フェーズで行います（次の版で運用中の改修に対応予定）',
    });
  }
  return out;
}

export { BACKUP_INTERVALS, THREATS };
