// 司令室の表示用データ（構成図・状態・対応一覧・業務の流れ）が、どの段階でも壊れずに作れるかを確かめる
import { CASES } from './cases';
import { newGame, reduce, type Action } from './game';
import { buildIssues } from './issues';
import { canRelease } from './project';
import { computeStatus } from './status';
import { buildTopology } from './topology';
import type { GameState } from './types';
import { evalWorkflow } from './workflow';

function check(s: GameState) {
  const issues = buildIssues(s);
  const topo = buildTopology(s);
  const st = computeStatus(s);
  expect(st).toHaveLength(6);
  for (const x of st) if (x.value !== null) expect(Number.isFinite(x.value)).toBe(true);
  const ids = new Set(topo.nodes.map((n) => n.id));
  for (const e of topo.edges) expect(ids.has(e.from) && ids.has(e.to)).toBe(true);
  for (const i of issues) {
    expect(i.title.length).toBeGreaterThan(0);
    // 対応候補のアクションを実行しても壊れない
    for (const a of i.actions) if (a.action && !a.disabled) expect(() => reduce(s, a.action!)).not.toThrow();
  }
  if (s.project) {
    const c = CASES.find((x) => x.id === s.project!.caseId)!;
    const w = evalWorkflow(c, s.project);
    expect(w.after.work).toBeLessThanOrEqual(w.before.work);
  }
  return issues;
}

describe('司令室の表示データ', () => {
  for (const c of CASES) {
    it(`${c.client}：最初から最後まで作れる`, () => {
      let s = newGame(5);
      s.reputation = 99;
      const d = (a: Action) => {
        s = reduce(s, a);
        check(s);
      };
      expect(check(s).some((i) => i.kind === 'case')).toBe(true);
      d({ type: 'startCase', caseId: c.id });
      for (const inv of c.stakeholders) d({ type: 'investigate', id: inv.id });
      d({ type: 'finishInvestigation' });
      d({ type: 'setContract', contract: 'ukeoi' });
      d({ type: 'confirmRequirements' });
      expect(buildIssues(s).some((i) => i.id === 'task-design')).toBe(true);
      d({ type: 'confirmDesign' });
      for (let i = 0; i < 40 && s.project?.phase === 'develop'; i++) {
        if (s.project.pendingEvent) d({ type: 'resolveEvent', choice: 'accept' });
        if (canRelease(s.project!)) {
          d({ type: 'release' });
          break;
        }
        d({ type: 'nextWeek' });
      }
      let sawIncident = false;
      for (let i = 0; i < 20 && s.project?.phase === 'operate'; i++) {
        d({ type: 'nextWeek' });
        if (buildIssues(s).some((x) => x.id.startsWith('inc-'))) sawIncident = true;
      }
      // 何も対策していないので、運用中に何かしらの障害・混雑が起きるはず
      expect(sawIncident).toBe(true);
    });
  }
});
