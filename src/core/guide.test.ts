// チュートリアルの「次にやること」が、各段階で正しく出るか
import { CASES } from './cases';
import { newGame, reduce } from './game';
import { buildGuide } from './guide';

describe('次にやること（ガイド）', () => {
  it('案件がないときは、依頼を受けることを案内する', () => {
    const g = buildGuide(newGame(1));
    expect(g.title).toBe('依頼を受ける');
    expect(g.current).toBe('start');
  });

  it('調査で作業をすると ✓ がつき、次の手順に進む', () => {
    const c = CASES.find((x) => x.id === 'midori-library')!;
    let s = reduce(newGame(1), { type: 'startCase', caseId: c.id });
    expect(buildGuide(s).current).toBe('interview');
    const iv = c.stakeholders.find((x) => x.kind === 'interview' && !x.needsNda)!;
    s = reduce(s, { type: 'investigate', id: iv.id });
    const g = buildGuide(s);
    expect(g.steps.find((x) => x.id === 'interview')!.done).toBe(true);
    expect(g.current).not.toBe('interview');
  });

  it('どの段階でも、目的と手順がある', () => {
    let s = reduce({ ...newGame(2), reputation: 99 }, { type: 'startCase', caseId: 'harukaze' });
    const seen: string[] = [];
    const check = () => {
      const g = buildGuide(s);
      expect(g.goal.length).toBeGreaterThan(0);
      expect(g.steps.length).toBeGreaterThan(0);
      seen.push(g.title);
    };
    check();
    s = reduce(s, { type: 'finishInvestigation' });
    check();
    s = reduce(s, { type: 'setContract', contract: 'ukeoi' });
    expect(buildGuide(s).steps.find((x) => x.id === 'contract')!.done).toBe(true);
    s = reduce(s, { type: 'confirmRequirements' });
    check();
    s = reduce(s, { type: 'confirmDesign' });
    check();
    expect(buildGuide(s).steps.find((x) => x.id === 'assign')!.done).toBe(true); // 自動で割り当て済み
    expect(seen).toEqual(['1. 調査', '2. 要件定義', '3. 設計', '4. 開発']);
  });
});
