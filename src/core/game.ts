// ============================================================
// ゲームの状態を変える「操作（アクション）」をすべてここで処理します。
// 画面（UI）は dispatch(action) を呼ぶだけで、計算はすべてここと sim.ts が行います。
// 新しい操作を足すときは Action 型と reduce() の switch に追加してください。
// ============================================================
import { MEASURES, measureById } from './catalog';
import { infraCost, measuresCost } from './calc';
import { caseById } from './cases';
import { COMPLEXITY_TEXT, blockDef, runProgram, type Block } from './program';
import { buildTasks, canRelease, deadlineWeek, initialSatisfaction, isSolved, newProject, taskDone } from './project';
import { Rng } from './rng';
import { devWeek, log, opsWeek, passWeek } from './sim';
import { drillById, judgeDrill } from './drills';
import { gainExp, initialStaff, makeCandidate } from './staff';
import type { Backup, Contract, GameState, Infra, Member, SkillKey, Task } from './types';

export type Action =
  | { type: 'newGame'; seed: number; companyName: string }
  | { type: 'load'; state: GameState }
  | { type: 'learnTerm'; id: string }
  | { type: 'startCase'; caseId: string }
  | { type: 'abandonCase' }
  | { type: 'investigate'; id: string }
  | { type: 'answerQuiz'; problemId: string; option: number }
  | { type: 'finishInvestigation' }
  | { type: 'backToInvestigation' }
  | { type: 'toggleFeature'; id: string }
  | { type: 'setContract'; contract: Contract }
  | { type: 'confirmRequirements' }
  | { type: 'setDataModel'; attr: string; table: string }
  | { type: 'setProcess'; proc: string; option: string }
  | { type: 'setProgram'; proc: string; blocks: Block[] }
  | { type: 'setInfra'; patch: Partial<Infra> }
  | { type: 'toggleMeasure'; id: string }
  | { type: 'setBackup'; patch: Partial<Backup> }
  | { type: 'confirmDesign' }
  | { type: 'assign'; memberId: string; taskId: string }
  | { type: 'autoAssign' }
  | { type: 'setOvertime'; on: boolean }
  | { type: 'resolveEvent'; choice: 'accept' | 'negotiate' | 'decline' }
  | { type: 'nextWeek' }
  | { type: 'release' }
  | { type: 'acceptRequest'; id: string }
  | { type: 'applyInfraChange'; infra: Infra }
  | { type: 'finishCase' }
  | { type: 'hire'; id: string }
  | { type: 'fire'; id: string }
  | { type: 'train'; id: string; skill: SkillKey }
  | { type: 'solveDrill'; id: string; blocks: Block[] };

export const TRAIN_COST = 30;

export function newGame(seed: number, companyName = 'ルミエール情報システム'): GameState {
  const s: GameState = {
    version: 1,
    companyName,
    rngState: seed,
    week: 1,
    money: 1500,
    reputation: 0,
    staff: initialStaff(),
    candidates: [],
    results: [],
    project: null,
    knownTerms: [],
    log: [],
    gameOver: false,
    nextId: 100,
    drills: [],
  };
  refreshCandidates(s, new Rng(seed));
  log(s, `${companyName} が設立されました。最初の依頼を選びましょう。`, 'good');
  return s;
}

function refreshCandidates(s: GameState, rng: Rng) {
  s.candidates = [0, 1, 2].map(() => makeCandidate(rng, `m${s.nextId++}`));
}

const learn = (s: GameState, ids: string[] | undefined) => {
  for (const id of ids ?? []) if (!s.knownTerms.includes(id)) s.knownTerms.push(id);
};

export function reduce(state: GameState, action: Action): GameState {
  if (action.type === 'newGame') return newGame(action.seed, action.companyName);
  if (action.type === 'load') return action.state;
  const s: GameState = structuredClone(state);
  const rng = new Rng(s.rngState);
  apply(s, action, rng);
  s.rngState = rng.state;
  return s;
}

function apply(s: GameState, a: Action, rng: Rng) {
  if (a.type === 'learnTerm') return learn(s, [a.id]);
  if (s.gameOver) return;
  const p = s.project;
  const c = p ? caseById(p.caseId) : null;

  switch (a.type) {
    // ---------------- オフィス ----------------
    case 'startCase': {
      if (p) return;
      const cd = caseById(a.caseId);
      if (s.reputation < cd.unlockRep) return;
      s.project = newProject(cd, s.week, s.reputation);
      log(s, `「${cd.client}」の依頼を引き受けました。まずは調査から始めましょう。`, 'info');
      return;
    }
    case 'hire': {
      const m = s.candidates.find((x) => x.id === a.id);
      if (!m) return;
      const fee = m.salary * 4;
      s.money -= fee;
      s.staff.push(m);
      s.candidates = s.candidates.filter((x) => x.id !== a.id);
      log(s, `${m.name}（${m.title}）を採用しました。採用費 ${fee}万円。`, 'good');
      return;
    }
    case 'fire': {
      if (s.staff.length <= 1) return;
      const m = s.staff.find((x) => x.id === a.id);
      if (!m) return;
      s.staff = s.staff.filter((x) => x.id !== a.id);
      if (p) delete p.assignments[a.id];
      s.money -= m.salary * 2;
      log(s, `${m.name} が退職しました（退職金 ${m.salary * 2}万円）。`, 'info');
      return;
    }
    case 'solveDrill': {
      // 社内勉強会（アルゴリズム道場）：プログラムをもう一度動かして確かめ、初めて合格したら全員に経験値
      // 時間（週）は進まない。案件中でも空き時間にできる
      const d = drillById(a.id);
      if (!d || (s.drills ?? []).includes(d.id) || !judgeDrill(d, a.blocks).pass) return;
      s.drills = [...(s.drills ?? []), d.id];
      learn(s, d.terms);
      const ups = s.staff.filter((m) => gainExp(m, 'dev', d.reward)).map((m) => m.name);
      log(s, `勉強会で「${d.title}」を解きました。全員の開発の経験 +${d.reward}${ups.length ? `（${ups.join('・')} の開発スキルが上がった！）` : ''}`, 'good');
      return;
    }
    case 'train': {
      if (p) return; // 研修は案件のない期間だけ
      const m = s.staff.find((x) => x.id === a.id);
      if (!m || m.skills[a.skill] >= 5) return;
      s.money -= TRAIN_COST;
      m.skills[a.skill] += 1;
      for (const o of s.staff) o.fatigue = Math.max(0, o.fatigue - 30);
      log(s, `${m.name} が研修を受け、スキルが上がりました（${TRAIN_COST}万円・1週間）。`, 'good');
      passWeek(s);
      refreshCandidates(s, rng);
      return;
    }
    case 'nextWeek': {
      if (!p) {
        for (const m of s.staff) m.fatigue = Math.max(0, m.fatigue - 30);
        passWeek(s);
        refreshCandidates(s, rng);
        log(s, '1週間、次の依頼を待ちました。', 'info');
        return;
      }
      if (p.phase === 'develop') {
        if (p.pendingEvent) return;
        devWeek(s, c!, rng);
        autoAssign(s, true);
        const dl = deadlineWeek(c!, p);
        if (s.week === dl) log(s, '今週が納期です！', 'bad');
        else if (s.week > dl) log(s, `納期を ${s.week - dl} 週過ぎています。`, 'bad');
        return;
      }
      if (p.phase === "operate") {
        opsWeek(s, c!, rng);
        if (p.phase === "operate") autoAssign(s, true);
        return;
      }
      if (p.phase === 'investigate' || p.phase === 'requirements' || p.phase === 'design') {
        p.days = 0;
        passWeek(s);
      }
      return;
    }
  }

  if (!p || !c) return;

  switch (a.type) {
    case 'abandonCase': {
      s.reputation -= 5;
      log(s, `「${c.client}」の案件を途中でやめました。評判 −5`, 'bad');
      s.project = null;
      return;
    }
    // ---------------- 調査 ----------------
    case 'investigate': {
      if (p.phase !== 'investigate' || p.done.includes(a.id)) return;
      const inv = c.stakeholders.find((x) => x.id === a.id);
      if (!inv) return;
      if (inv.needsNda && !p.nda) return;
      const maxPlan = Math.max(...s.staff.map((m) => m.skills.plan));
      const days = Math.round(inv.days * (maxPlan >= 4 ? 0.75 : maxPlan >= 3 ? 1 : 1.25) * 4) / 4;
      p.done.push(inv.id);
      if (inv.kind === 'nda') p.nda = true;
      for (const id of inv.reveals.problems ?? []) if (!p.foundProblems.includes(id)) p.foundProblems.push(id);
      for (const id of inv.reveals.facts ?? []) if (!p.facts.includes(id)) p.facts.push(id);
      learn(s, inv.terms);
      p.days += days;
      while (p.days >= 5) {
        p.days -= 5;
        passWeek(s);
      }
      log(s, `${inv.name}（${days}日）`, 'info');
      return;
    }
    case 'answerQuiz': {
      const prob = c.problems.find((x) => x.id === a.problemId);
      if (!prob?.quiz || p.quizAnswers[a.problemId] !== undefined) return;
      p.quizAnswers[a.problemId] = a.option;
      learn(s, prob.terms);
      log(s, a.option === prob.quiz.answer ? `「${prob.title}」の原因を正しく見抜きました！` : `「${prob.title}」の原因の見立てがはずれました。`, a.option === prob.quiz.answer ? 'good' : 'bad');
      return;
    }
    case 'finishInvestigation': {
      if (p.phase !== 'investigate') return;
      p.phase = 'requirements';
      learn(s, ['requirements']);
      return;
    }
    case 'backToInvestigation': {
      if (p.phase !== 'requirements') return;
      p.phase = 'investigate';
      return;
    }
    // ---------------- 要件定義 ----------------
    case 'toggleFeature': {
      if (p.phase !== 'requirements') return;
      const f = c.features.find((x) => x.id === a.id);
      if (!f || f.required) return;
      p.features = p.features.includes(a.id) ? p.features.filter((x) => x !== a.id) : [...p.features, a.id];
      learn(s, f.terms);
      return;
    }
    case 'setContract': {
      if (p.phase !== 'requirements') return;
      p.contract = a.contract;
      learn(s, [a.contract]);
      return;
    }
    case 'confirmRequirements': {
      if (p.phase !== 'requirements' || !p.contract) return;
      p.phase = 'design';
      if (p.contract === 'ukeoi') {
        const pay = Math.round(p.budget * 0.3);
        s.money += pay;
        p.received += pay;
        log(s, `請負契約を結びました。着手金 ${pay}万円を受け取りました（残りは納品時）。`, 'good');
      } else log(s, '準委任契約を結びました。作業した週ごとに報酬を受け取ります。', 'good');
      return;
    }
    // ---------------- 設計 ----------------
    case 'setDataModel': {
      if (p.phase !== 'design') return;
      p.design.dataModel[a.attr] = a.table;
      learn(s, ['normalization']);
      return;
    }
    case 'setProcess': {
      if (p.phase !== 'design') return;
      p.design.processes[a.proc] = a.option;
      const o = c.processes.find((x) => x.id === a.proc)?.options.find((x) => x.id === a.option);
      learn(s, o?.terms);
      learn(s, ['big-o']);
      return;
    }
    case 'setProgram': {
      // ブロックで作ったプログラムを実行・テストし、合格したら設計に使う
      if (p.phase !== 'design') return;
      const proc = c.processes.find((x) => x.id === a.proc);
      if (!proc?.program) return;
      const result = runProgram(proc, a.blocks);
      p.design.programs = { ...(p.design.programs ?? {}), [a.proc]: { blocks: structuredClone(a.blocks), result } };
      if (result.ok) {
        p.design.processes[a.proc] = result.optionId ?? 'custom';
        const o = proc.options.find((x) => x.id === result.optionId);
        learn(s, o?.terms);
        learn(s, ['big-o', ...result.uses.map((u) => blockDef(u).term).filter((x): x is string => !!x)]);
        log(s, `プログラム「${proc.name}」がテストに合格しました（${COMPLEXITY_TEXT[result.complexity!]}${o ? `・「${o.name}」と同じ方式` : '・自作の方式'}）。`, 'good');
      }
      return;
    }
    case 'setInfra': {
      if (p.phase !== 'design') return;
      Object.assign(p.design.infra, a.patch);
      normalizeInfra(p.design.infra);
      return;
    }
    case 'toggleMeasure': {
      if (p.phase !== 'design' && p.phase !== 'operate') return;
      const m = measureById(a.id);
      const has = p.design.measures.includes(a.id);
      if (p.phase === 'operate') {
        if (has) return; // 運用中は追加だけ
        s.money -= m.initialCost;
        p.spent += m.initialCost;
        log(s, `運用中に対策「${m.name}」を追加しました（導入費 ${m.initialCost}万円）。`, 'info');
      }
      p.design.measures = has ? p.design.measures.filter((x) => x !== a.id) : [...p.design.measures, a.id];
      learn(s, [m.term]);
      return;
    }
    case 'setBackup': {
      if (p.phase !== 'design' && p.phase !== 'operate') return;
      Object.assign(p.design.backup, a.patch);
      learn(s, ['backup', 'rpo-rto']);
      return;
    }
    case 'confirmDesign': {
      if (p.phase !== 'design') return;
      p.designConfirmed = true;
      p.phase = 'develop';
      p.tasks = buildTasks(c, p);
      p.assignments = {};
      autoAssign(s);
      const ic = infraCost(p.design.infra).initial + measuresCost(p.design.measures).initial;
      s.money -= ic;
      p.spent += ic;
      if (p.contract === 'junin') {
        s.money += ic;
        p.received += ic;
      }
      log(s, `設計レビューが終わりました（1週間）。機器・サービスの初期費用 ${Math.round(ic)}万円${p.contract === 'junin' ? '（準委任のため依頼主が負担）' : ''}。開発を始めます。`, 'info');
      learn(s, ['man-week', 'wbs']);
      passWeek(s);
      return;
    }
    // ---------------- 開発 ----------------
    case 'assign': {
      if (!s.staff.some((m) => m.id === a.memberId)) return;
      p.assignments[a.memberId] = a.taskId;
      return;
    }
    case 'autoAssign':
      return autoAssign(s);
    case 'setOvertime': {
      p.overtime = a.on;
      learn(s, ['overtime']);
      return;
    }
    case 'resolveEvent': {
      const ev = p.pendingEvent;
      if (!ev) return;
      p.pendingEvent = null;
      learn(s, ['spec-change']);
      const cr = c.changeRequest;
      const addTask = () => {
        p.tasks.splice(p.tasks.length - 1, 0, { id: 't-change', name: `仕様変更：${cr.name}`, kind: 'change', skill: cr.skill, effort: cr.effort, progress: 0 });
        p.changeAccepted = true;
      };
      if (a.choice === 'accept') {
        addTask();
        if (p.contract === 'junin') {
          p.deadlineExtension += 1;
          log(s, `仕様変更を受けました。準委任なので作業分の報酬が出て、納期も1週延びました。`, 'good');
        } else log(s, '仕様変更を無償で受けました。依頼主は喜んでいますが、作業が増えます。', 'info');
      } else if (a.choice === 'negotiate') {
        const plan = Math.max(...s.staff.map((m) => m.skills.plan));
        if (rng.chance(0.35 + plan * 0.1)) {
          addTask();
          const pay = Math.round(cr.effort * 30);
          s.money += pay;
          p.received += pay;
          p.deadlineExtension += 1;
          log(s, `交渉が成立！ 追加費用 ${pay}万円と納期1週延長で仕様変更を受けました。`, 'good');
        } else {
          p.satisfaction -= 2;
          log(s, '追加費用の交渉がまとまらず、今回の変更は見送りになりました。', 'bad');
        }
      } else {
        p.satisfaction -= 4;
        log(s, '仕様変更をお断りしました。依頼主は少し残念そうです。', 'bad');
      }
      return;
    }
    case 'release': {
      if (p.phase !== 'develop' || !canRelease(p) || p.pendingEvent) return;
      const late = Math.max(0, s.week - deadlineWeek(c, p));
      p.delivered = p.features.filter((fid) => {
        const t = p.tasks.find((x) => x.refId === fid);
        return t && taskDone(t);
      });
      const init = initialSatisfaction(c, p, late);
      p.satisfaction = Math.max(0, Math.min(100, init.value + (p.satisfaction - 50)));
      p.notes = init.notes;
      if (p.contract === 'ukeoi') {
        const penalty = Math.round(p.budget * 0.015 * late);
        const pay = Math.round(p.budget * 0.7) - penalty;
        s.money += pay;
        p.received += pay;
        log(s, `納品・検収が完了！ 残りの代金 ${pay}万円を受け取りました${penalty ? `（遅延損害金 −${penalty}万円）` : ''}。`, 'good');
      } else log(s, '納品が完了しました！', 'good');
      learn(s, ['testing', 'bug', 'nonconformity']);
      p.releaseWeek = s.week;
      p.phase = 'operate';
      p.ops = {
        week: 0,
        data: {},
        dataGB: c.dataGB,
        history: [],
        arrivedRequests: [],
        acceptedRequests: [],
        doneRequests: [],
        pendingInfra: null,
        auditDone: false,
      };
      // 運用中のタスク：監視とバグ修正（終わりのない仕事）
      p.tasks = [
        { id: 't-monitor', name: '運用監視（障害の早期発見・復旧）', kind: 'monitor', skill: 'ops', effort: 0, progress: 0, continuous: true },
        { id: 't-bugfix', name: 'バグ修正', kind: 'bugfix', skill: 'dev', effort: 0, progress: 0, continuous: true },
      ];
      p.overtime = false;
      p.assignments = {};
      for (const m of s.staff) {
        p.assignments[m.id] = m.skills.ops >= m.skills.dev ? 't-monitor' : 't-bugfix';
      }
      learn(s, ['mtbf-mttr', 'pdca']);
      return;
    }
    // ---------------- 運用 ----------------
    case 'acceptRequest': {
      const ops = p.ops;
      if (!ops || !ops.arrivedRequests.includes(a.id) || ops.acceptedRequests.includes(a.id)) return;
      const r = c.opsRequests.find((x) => x.id === a.id)!;
      ops.acceptedRequests.push(r.id);
      p.tasks.push({ id: `t-${r.id}`, name: `改善：${r.name}`, kind: 'request', skill: r.skill, effort: r.effort, progress: 0, refId: r.id });
      learn(s, r.terms);
      log(s, `要望「${r.name}」に対応することにしました。メンバーを割り当てましょう。`, 'info');
      return;
    }
    case 'applyInfraChange': {
      const ops = p.ops;
      if (!ops || p.phase !== 'operate') return;
      const next = structuredClone(a.infra);
      normalizeInfra(next);
      const cur = p.design.infra;
      if (next.hosting !== cur.hosting) return; // 運用中のオンプレ⇔クラウド移行は未対応
      // 追加で買う機器の費用（オンプレミスのみ）
      const add = Math.max(0, infraCost(next).initial - infraCost(cur).initial);
      if (cur.hosting === 'onprem') {
        s.money -= add;
        p.spent += add;
        ops.pendingInfra = { infra: next, applyWeek: ops.week + 2 };
        log(s, `構成変更を申し込みました。機器の調達と設置に2週間かかります（追加費用 ${Math.round(add)}万円）。`, 'info');
      } else {
        p.design.infra = next;
        log(s, '構成を変更しました（クラウドなので次の週からすぐ反映されます）。', 'info');
      }
      learn(s, ['scale-up', 'scale-out', cur.hosting]);
      return;
    }
    case 'finishCase': {
      if (p.phase !== 'done') return;
      finish(s);
      refreshCandidates(s, rng);
      return;
    }
  }
}

/** 構成の矛盾を直す（複数台ならロードバランサ必須、オートスケールはクラウドのみ） */
function normalizeInfra(i: Infra) {
  i.webCount = Math.max(1, Math.min(8, Math.round(i.webCount)));
  if (i.webCount > 1) i.lb = true;
  if (i.hosting === 'onprem') i.autoscale = false;
  if (i.autoscale) i.lb = true;
}

/** できるだけ得意なタスクに人を割り当てる。onlyIdle なら、担当タスクが終わった人だけ割り当て直す */
export function autoAssign(s: GameState, onlyIdle = false) {
  const p = s.project;
  if (!p) return;
  const open = (t: Task) => (t.continuous ? true : !taskDone(t));
  const isOps = p.phase === 'operate';
  const tasks = p.tasks.filter(open);
  const remain = new Map<string, number>();
  for (const t of tasks) remain.set(t.id, t.continuous ? 1.2 : t.effort - t.progress);
  const nonTestLeft = tasks.some((t) => t.kind !== 'test' && !t.continuous);
  const busy = (id: string) => {
    const a = p.assignments[id];
    if (a === "rest") return true;
    const t = p.tasks.find((x) => x.id === a);
    return !!t && open(t);
  };
  if (onlyIdle) {
    for (const m of s.staff) {
      const t = p.tasks.find((x) => x.id === p.assignments[m.id]);
      if (busy(m.id) && t) remain.set(t.id, (remain.get(t.id) ?? 0) - (0.3 + m.skills[t.skill] * 0.25));
    }
  }
  const members = [...s.staff].sort((a, b) => Math.max(...Object.values(b.skills)) - Math.max(...Object.values(a.skills)));
  for (const m of members) {
    if (onlyIdle && busy(m.id)) continue;
    if (m.fatigue >= 75) {
      p.assignments[m.id] = 'rest';
      continue;
    }
    let best: Task | null = null;
    let bestScore = -Infinity;
    for (const t of tasks) {
      const r = remain.get(t.id) ?? 0;
      if (r <= 0) continue;
      let score = m.skills[t.skill] * 2 + Math.min(r, 3) * 0.5;
      if (t.kind === 'test' && nonTestLeft) score -= 4; // テストは作ったあとに
      if (isOps && t.kind === 'bugfix' && p.bugs < 0.5) score -= 10;
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    if (!best) {
      p.assignments[m.id] = 'rest';
      continue;
    }
    p.assignments[m.id] = best.id;
    remain.set(best.id, (remain.get(best.id) ?? 0) - (0.3 + m.skills[best.skill] * 0.25));
  }
}

/** 案件の終了。評判とお金を精算する */
function finish(s: GameState) {
  const p = s.project!;
  const c = caseById(p.caseId);
  const sat = p.satisfaction;
  let bonus = 0;
  if (sat >= 80) {
    bonus = Math.round(p.budget * 0.1);
    s.money += bonus;
    p.received += bonus;
    log(s, `依頼主がとても満足し、感謝の追加報酬 ${bonus}万円をもらいました！`, 'good');
  }
  const late = Math.max(0, (p.releaseWeek ?? s.week) - deadlineWeek(c, p));
  let rep = Math.round((sat - 50) / 5) - p.repPenalty - Math.ceil(late / 2);
  if (sat < 30) rep -= 2;
  s.reputation += rep;
  const solved = c.problems.filter((x) => isSolved(c, p, x, 'delivered')).length;
  s.results.push({
    caseId: c.id,
    week: s.week,
    satisfaction: Math.round(sat),
    profit: Math.round(p.received - p.spent),
    repDelta: rep,
    late,
    solved,
    totalProblems: c.problems.length,
  });
  log(s, `「${c.client}」の案件が終了。満足度 ${Math.round(sat)}、評判 ${rep >= 0 ? '+' : ''}${rep}`, rep >= 0 ? 'good' : 'bad');
  s.project = null;
}

export const measuresByCategory = (cat: 'security' | 'legal') => MEASURES.filter((m) => m.category === cat);

export function memberTask(s: GameState, m: Member): Task | undefined {
  return s.project?.tasks.find((t) => t.id === s.project!.assignments[m.id]);
}
