// ボット（自動プレイ）で案件を最初から最後まで進め、ゲームが壊れないかを確かめるテスト
import { CASES } from './cases';
import { newGame, reduce, type Action } from './game';
import { canHandlePeak, canRelease } from './project';
import type { GameState } from './types';

function play(caseId: string, smart: boolean, seed = 1): GameState {
  let s = newGame(seed);
  const d = (a: Action) => (s = reduce(s, a));
  s.reputation = 99;
  d({ type: 'startCase', caseId });
  const c = CASES.find((x) => x.id === caseId)!;
  if (smart) {
    for (const inv of c.stakeholders) d({ type: 'investigate', id: inv.id });
    for (const pr of c.problems) if (pr.quiz) d({ type: 'answerQuiz', problemId: pr.id, option: pr.quiz.answer });
  }
  d({ type: 'finishInvestigation' });
  if (smart) for (const f of c.features) if (!f.satisfaction) d({ type: 'toggleFeature', id: f.id });
  d({ type: 'setContract', contract: 'ukeoi' });
  d({ type: 'confirmRequirements' });
  if (smart) {
    for (const a of c.dataModel.attributes) d({ type: 'setDataModel', attr: a.id, table: a.answer[0] });
    for (const pr of c.processes) d({ type: 'setProcess', proc: pr.id, option: pr.options[pr.options.length - 1].id });
    d({ type: 'setInfra', patch: { hosting: 'cloud', webTier: 'M', webCount: 2, dbReplica: true, network: '1G', cdn: true, autoscale: true } });
    for (const m of ['tls', 'prepared', 'escape', 'mfa', 'patch', 'encrypt', 'leastpriv', 'purpose', 'breach', 'outsource', 'consent', 'minimize']) d({ type: 'toggleMeasure', id: m });
    d({ type: 'setBackup', patch: { type: 'incr', interval: 'daily', offsite: true } });
  }
  d({ type: 'confirmDesign' });
  for (let i = 0; i < 40 && s.project?.phase === 'develop'; i++) {
    if (s.project.pendingEvent) d({ type: 'resolveEvent', choice: 'negotiate' });
    if (canRelease(s.project!)) {
      const test = s.project!.tasks.find((t) => t.kind === 'test')!;
      if (!smart || test.progress >= test.effort) {
        d({ type: 'release' });
        break;
      }
    }
    d({ type: 'autoAssign' });
    d({ type: 'nextWeek' });
  }
  for (let i = 0; i < 20 && s.project?.phase === 'operate'; i++) {
    for (const id of s.project.ops!.arrivedRequests) d({ type: 'acceptRequest', id });
    d({ type: 'autoAssign' });
    d({ type: 'nextWeek' });
  }
  if (s.project?.phase === 'done') d({ type: 'finishCase' });
  return s;
}

describe('ゲーム全体', () => {
  for (const c of CASES) {
    it(`${c.client}：しっかり設計すると高評価で終わる`, () => {
      const s = play(c.id, true);
      expect(s.project).toBeNull();
      expect(s.results).toHaveLength(1);
      expect(s.results[0].satisfaction).toBeGreaterThan(60);
      expect(Number.isFinite(s.money)).toBe(true);
    });
    it(`${c.client}：何も考えないと満足度が低い`, () => {
      const smart = play(c.id, true, 7);
      const lazy = play(c.id, false, 7);
      expect(lazy.results[0].satisfaction).toBeLessThan(smart.results[0].satisfaction);
    });
  }

  it('同じシードなら同じ結果（再現性）', () => {
    const a = play('harukaze', true, 42);
    const b = play('harukaze', true, 42);
    expect(a.money).toBe(b.money);
  });

  it('しっかりした構成ならピークをさばける', () => {
    const s = newGame(3);
    const c = CASES.find((x) => x.id === 'harukaze')!;
    let st = reduce({ ...s, reputation: 99 }, { type: 'startCase', caseId: c.id });
    st.project!.design.processes.search = 'search-index';
    st.project!.design.infra = { hosting: 'cloud', webTier: 'M', webCount: 2, lb: true, dbTier: 'M', dbReplica: true, network: '1G', cdn: true, autoscale: true };
    expect(canHandlePeak(c, st.project!.design)).toBe(true);
  });
});

describe('運用中の改善', () => {
  function toOps(hosting: 'onprem' | 'cloud') {
    let s = newGame(5);
    const d = (a: Action) => (s = reduce(s, a));
    d({ type: 'startCase', caseId: 'midori-library' });
    d({ type: 'finishInvestigation' });
    d({ type: 'setContract', contract: 'junin' });
    d({ type: 'confirmRequirements' });
    d({ type: 'setInfra', patch: { hosting } });
    d({ type: 'confirmDesign' });
    for (let i = 0; i < 30 && s.project!.phase === 'develop'; i++) {
      if (s.project!.pendingEvent) d({ type: 'resolveEvent', choice: 'decline' });
      if (canRelease(s.project!)) d({ type: 'release' });
      else d({ type: 'nextWeek' });
    }
    return { get: () => s, d };
  }

  it('オンプレミスの増設は2週間後に反映され、費用がかかる', () => {
    const g = toOps('onprem');
    expect(g.get().project!.phase).toBe('operate');
    const money = g.get().money;
    const infra = { ...g.get().project!.design.infra, webCount: 2 };
    g.d({ type: 'applyInfraChange', infra });
    expect(g.get().money).toBeLessThan(money);
    expect(g.get().project!.design.infra.webCount).toBe(1);
    g.d({ type: 'nextWeek' });
    g.d({ type: 'nextWeek' });
    expect(g.get().project!.design.infra.webCount).toBe(2);
    expect(g.get().project!.design.infra.lb).toBe(true);
  });

  it('クラウドの変更はすぐ反映される', () => {
    const g = toOps('cloud');
    g.d({ type: 'applyInfraChange', infra: { ...g.get().project!.design.infra, webTier: 'L' } });
    expect(g.get().project!.design.infra.webTier).toBe('L');
  });

  it('運用中は対策を追加できるが外せない', () => {
    const g = toOps('cloud');
    g.d({ type: 'toggleMeasure', id: 'waf' });
    expect(g.get().project!.design.measures).toContain('waf');
    g.d({ type: 'toggleMeasure', id: 'waf' });
    expect(g.get().project!.design.measures).toContain('waf');
  });
});
