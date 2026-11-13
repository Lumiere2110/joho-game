import { CASES } from '../src/core/cases';
import { newGame, reduce, type Action } from '../src/core/game';
import { canRelease } from '../src/core/project';
// バランス確認用：npx vitest run tools --silent=false で各案件の結果を表示する
it('balance report', () => {
  for (const c of CASES) for (const smart of [true, false]) for (const seed of [1, 2, 3]) {
    let s = newGame(seed);
    const d = (a: Action) => (s = reduce(s, a));
    s.reputation = 99;
    d({ type: 'startCase', caseId: c.id });
    if (smart) { for (const inv of c.stakeholders) d({ type: 'investigate', id: inv.id }); for (const pr of c.problems) if (pr.quiz) d({ type: 'answerQuiz', problemId: pr.id, option: pr.quiz.answer }); }
    d({ type: 'finishInvestigation' });
    if (smart) for (const f of c.features) if (!f.satisfaction) d({ type: 'toggleFeature', id: f.id });
    d({ type: 'setContract', contract: 'ukeoi' }); d({ type: 'confirmRequirements' });
    if (smart) {
      for (const a of c.dataModel.attributes) d({ type: 'setDataModel', attr: a.id, table: a.answer[0] });
      for (const pr of c.processes) d({ type: 'setProcess', proc: pr.id, option: pr.options[1].id });
      d({ type: 'setInfra', patch: { hosting: 'cloud', webTier: 'M', webCount: 2, dbReplica: true, network: '1G', cdn: true, autoscale: true } });
      for (const m of ['tls', 'prepared', 'escape', 'patch', 'encrypt', 'leastpriv', 'purpose', 'breach', 'outsource', 'consent', 'minimize']) d({ type: 'toggleMeasure', id: m });
      d({ type: 'setBackup', patch: { type: 'incr', interval: 'daily', offsite: true } });
    }
    d({ type: 'confirmDesign' });
    const devStart = s.week;
    const effort = s.project!.tasks.reduce((a, t) => a + t.effort, 0);
    for (let i = 0; i < 40 && s.project?.phase === 'develop'; i++) {
      if (s.project.pendingEvent) d({ type: 'resolveEvent', choice: 'accept' });
      const test = s.project!.tasks.find((t) => t.kind === 'test')!;
      if (canRelease(s.project!) && (!smart || test.progress >= test.effort)) { d({ type: 'release' }); break; }
      d({ type: 'autoAssign' }); d({ type: 'nextWeek' });
    }
    const rel = s.week; const bugs = s.project!.bugs; const sat0 = s.project!.satisfaction;
    for (let i = 0; i < 20 && s.project?.phase === 'operate'; i++) { for (const id of s.project.ops!.arrivedRequests) d({ type: 'acceptRequest', id }); d({ type: 'autoAssign' }); d({ type: 'nextWeek' }); }
    const h = s.project!.ops!.history;
    const bad = h.flatMap((x) => x.events.filter((e) => e.kind === 'bad').map((e) => e.text.slice(0, 30)));
    d({ type: 'finishCase' });
    const r = s.results[0];
    console.log(`${c.id} smart=${smart} seed=${seed} effort=${effort.toFixed(1)} dev=${devStart}->${rel} deadline=${1 + c.deadlineWeeks} bugs=${bugs.toFixed(1)} sat0=${sat0.toFixed(0)} final=${r.satisfaction} profit=${r.profit} rep=${r.repDelta} money=${Math.round(s.money)} maxResp=${Math.max(...h.map(x=>x.response)).toFixed(2)} lost=${Math.max(...h.map(x=>x.lostRate)).toFixed(2)}\n   bad: ${bad.join(' | ')}`);
  }
});
