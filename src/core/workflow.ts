// 業務の流れ（業務画面）の計算：改善前と改善後の作業時間・待ち時間・費用
import { isSolved } from './project';
import type { CaseDef, Project, WorkflowStep } from './types';

export const LABOR_PER_HOUR = 0.3; // 社員1時間あたりの人件費（万円 = 3,000円）

export interface StepView {
  step: WorkflowStep;
  known: boolean; // 調査で詳細が分かっているか
  improved: boolean; // 今の計画で改善されるか
  work: number; // 改善後の値（改善されないなら元の値）
  wait: number;
}

export interface WorkflowView {
  steps: StepView[];
  before: { work: number; wait: number; manual: number; monthlyHours: number; monthlyCost: number };
  after: { work: number; wait: number; manual: number; monthlyHours: number; monthlyCost: number };
  bottleneck: string | null; // いちばん時間がかかっている工程
}

export function evalWorkflow(c: CaseDef, p: Project): WorkflowView {
  const mode = p.phase === 'operate' || p.phase === 'done' ? 'delivered' : 'plan';
  const steps: StepView[] = c.workflow.steps.map((st) => {
    const prob = st.after ? c.problems.find((x) => x.id === st.after!.problem) : undefined;
    const improved = !!prob && isSolved(c, p, prob, mode);
    return {
      step: st,
      known: !st.reveal || p.done.includes(st.reveal),
      improved,
      work: improved ? st.after!.work : st.work,
      wait: improved ? st.after!.wait : st.wait,
    };
  });
  const sum = (key: 'work' | 'wait', after: boolean) => steps.reduce((a, s) => a + (after ? s[key] : s.step[key]), 0);
  const manual = (after: boolean) => steps.filter((s) => s.step.manual && (!after || !s.improved || s.work > 0)).length;
  const total = (after: boolean) => {
    const work = sum('work', after);
    const monthlyHours = (work * c.workflow.perDay * 30) / 60;
    return { work, wait: sum('wait', after), manual: manual(after), monthlyHours, monthlyCost: monthlyHours * LABOR_PER_HOUR };
  };
  let bottleneck: string | null = null;
  let worst = 0;
  for (const s of steps) {
    const t = s.wait + s.work / 60;
    if (t > worst) {
      worst = t;
      bottleneck = s.step.id;
    }
  }
  return { steps, before: total(false), after: total(true), bottleneck };
}
