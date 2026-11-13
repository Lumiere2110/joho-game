// 調査フェーズ：ヒアリングとデータ分析で「誰が何に困っているか」を見つける
import { caseById } from '../core/cases';
import type { Problem } from '../core/types';
import { T, TermList, useGame } from './common';

export function InvestigateView() {
  const { s, dispatch } = useGame();
  const p = s.project!;
  const c = caseById(p.caseId);
  const maxPlan = Math.max(...s.staff.map((m) => m.skills.plan));
  const speed = maxPlan >= 4 ? 0.75 : maxPlan >= 3 ? 1 : 1.25;
  const found = c.problems.filter((x) => p.foundProblems.includes(x.id));

  return (
    <div className="stack">
      <div className="card stack">
        <h2>調査：誰が、何に困っているのか</h2>
        <div className="bubble">
          <div className="who">{c.client}からの依頼</div>
          {c.request}
        </div>
        <p className="small">
          いろいろな立場の人に<T id="hearing">ヒアリング</T>し、<T id="business-data">業務データを分析</T>して、問題とその原因を見つけましょう。調査は5日で1週間たち、そのぶん人件費がかかります。
          チームの企画・調整スキル（最高 {maxPlan}）により、調査にかかる日数は ×{speed} です。今週は {p.days.toFixed(2).replace(/\.?0+$/, '')} 日使いました。
        </p>
      </div>

      <div className="card stack">
        <h3>調査の方法</h3>
        <div className="options">
          {c.stakeholders.map((inv) => {
            const done = p.done.includes(inv.id);
            const blocked = inv.needsNda && !p.nda;
            return (
              <button key={inv.id} className={`option ${done ? 'on' : ''}`} disabled={done || blocked} onClick={() => dispatch({ type: 'investigate', id: inv.id })}>
                <div className="title">
                  {inv.name}
                  <span className="badge">{Math.round(inv.days * speed * 4) / 4}日</span>
                  {inv.kind === 'analysis' && <span className="badge accent">データ分析</span>}
                  {done && <span className="badge good">済み</span>}
                  {blocked && <span className="badge warn">NDA が必要</span>}
                </div>
                <div className="tiny muted">{inv.role}</div>
              </button>
            );
          })}
        </div>
      </div>

      {p.done.length > 0 && (
        <div className="card stack">
          <h3>分かったこと</h3>
          {c.stakeholders
            .filter((inv) => p.done.includes(inv.id))
            .map((inv) => (
              <div key={inv.id} className="bubble">
                <div className="who">{inv.role}</div>
                {inv.lines.map((l, i) => (
                  <p key={i} style={{ margin: '2px 0' }}>
                    {l}
                  </p>
                ))}
                <TermList ids={inv.terms} />
              </div>
            ))}
        </div>
      )}

      <div className="card stack">
        <h3>見つかった問題（{found.length}）</h3>
        <p className="small muted">まだ見つかっていない問題があるかもしれません。問題によっては、原因を考えるクイズに答えられます（<T id="root-cause">根本原因分析</T>）。</p>
        {found.map((x) => (
          <ProblemCard key={x.id} prob={x} />
        ))}
        {p.facts.length > 0 && (
          <>
            <h3>判明した数値</h3>
            <ul className="small" style={{ margin: 0, paddingLeft: 20 }}>
              {p.facts.map((f) => (
                <li key={f}>{c.facts[f]}</li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="spread">
        <span className="small muted">調査を終えると要件定義に進みます（あとで戻ることもできます）。</span>
        <button className="btn primary big" onClick={() => dispatch({ type: 'finishInvestigation' })}>
          調査を終えて要件定義へ
        </button>
      </div>
    </div>
  );
}

function ProblemCard({ prob }: { prob: Problem }) {
  const { s, dispatch } = useGame();
  const p = s.project!;
  const ans = p.quizAnswers[prob.id];
  return (
    <div className="problem">
      <div className="row">
        <b>{prob.title}</b>
        <span className={`badge ${prob.severity === 3 ? 'bad' : prob.severity === 2 ? 'warn' : ''}`}>重要度 {'●'.repeat(prob.severity)}</span>
        <span className="tiny muted">困っている人：{prob.who}</span>
      </div>
      <div className="small">{prob.detail}</div>
      {prob.quiz && (
        <div className="hint stack" style={{ marginTop: 6 }}>
          <b>考えよう：{prob.quiz.question}</b>
          <div className="options">
            {prob.quiz.options.map((o, i) => {
              const picked = ans === i;
              const correct = ans !== undefined && i === prob.quiz!.answer;
              return (
                <button
                  key={i}
                  className={`option ${picked || correct ? 'on' : ''}`}
                  disabled={ans !== undefined}
                  style={ans !== undefined ? { opacity: 1, borderColor: correct ? 'var(--good)' : picked ? 'var(--bad)' : undefined } : undefined}
                  onClick={() => dispatch({ type: 'answerQuiz', problemId: prob.id, option: i })}
                >
                  {o} {correct && <span className="badge good">正解</span>} {picked && !correct && <span className="badge bad">不正解</span>}
                </button>
              );
            })}
          </div>
          {ans !== undefined && <div className="small">{prob.quiz.explanation}</div>}
          {ans !== undefined && <TermList ids={prob.terms} />}
        </div>
      )}
    </div>
  );
}
