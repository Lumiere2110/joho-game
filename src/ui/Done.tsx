// 完了：案件の振り返り
import { fmt, pct } from '../core/calc';
import { caseById } from '../core/cases';
import { termById } from '../core/glossary';
import { isSolved } from '../core/project';
import { T, man, useGame } from './common';

export function DoneView() {
  const { s, dispatch } = useGame();
  const p = s.project!;
  const c = caseById(p.caseId);
  const h = p.ops?.history ?? [];
  const outage = h.reduce((a, x) => a + x.outageHours, 0);
  const avail = h.length ? 1 - outage / (h.length * 168) : 1;
  const bad = h.flatMap((x) => x.events.filter((e) => e.kind === 'bad'));
  const sat = Math.round(p.satisfaction);
  const comment =
    sat >= 80 ? '「本当に助かりました！ またぜひお願いしたいです」' : sat >= 60 ? '「おかげで仕事がかなり楽になりました」' : sat >= 40 ? '「まあ、前よりは良くなりましたね…」' : '「正直、期待していたものとは違いました」';
  const termsInCase = new Set<string>();
  for (const pr of c.problems) pr.terms?.forEach((t) => termsInCase.add(t));
  for (const inv of c.stakeholders) inv.terms?.forEach((t) => termsInCase.add(t));
  for (const pr of c.processes) pr.options.forEach((o) => o.terms?.forEach((t) => termsInCase.add(t)));
  const learned = [...termsInCase].filter((t) => s.knownTerms.includes(t));
  return (
    <div className="stack">
      <div className="card stack">
        <h2>案件完了：{c.client}</h2>
        <div className="bubble">
          <div className="who">{c.client}</div>
          {comment}
        </div>
        <div className="kpis">
          <div className="kpi">
            <div className="k">最終満足度</div>
            <div className="v">{sat}</div>
          </div>
          <div className="kpi">
            <div className="k">この案件の収支</div>
            <div className="v">{man(p.received - p.spent)}</div>
            <div className="s">満足度80以上なら追加報酬あり</div>
          </div>
          <div className="kpi">
            <div className="k">運用中の稼働率</div>
            <div className="v">{pct(avail, 2)}</div>
            <div className="s">停止 合計 {fmt(outage, 1)}時間</div>
          </div>
          <div className="kpi">
            <div className="k">トラブル</div>
            <div className="v">{bad.length}件</div>
          </div>
        </div>
      </div>
      <div className="card stack">
        <h3>問題は解決できた？</h3>
        {c.problems.map((x) => {
          const ok = isSolved(c, p, x, 'delivered');
          const found = p.foundProblems.includes(x.id);
          return (
            <div key={x.id} className={`problem ${ok ? 'solved' : 'unsolved'}`}>
              <div className="row">
                <b>{x.title}</b>
                {ok ? <span className="badge good">解決</span> : <span className="badge warn">未解決</span>}
                {!found && <span className="badge">調査で見つけられなかった</span>}
              </div>
            </div>
          );
        })}
      </div>
      {p.notes.length > 0 && (
        <div className="card stack">
          <h3>リリース時の評価</h3>
          <ul className="small" style={{ margin: 0, paddingLeft: 20 }}>
            {p.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="card stack">
        <h3>この案件に関わる用語</h3>
        <div className="row">
          {[...termsInCase].map((id) => (
            <span key={id} className={`badge ${s.knownTerms.includes(id) ? 'good' : ''}`}>
              <T id={id}>{termById(id)?.name}</T>
            </span>
          ))}
        </div>
        <div className="small muted">
          習得 {learned.length} / {termsInCase.size}。まだの用語もクリックして確認してみましょう。
        </div>
      </div>
      <div className="right">
        <button className="btn primary big" onClick={() => dispatch({ type: 'finishCase' })}>
          評価を受けてオフィスに戻る
        </button>
      </div>
    </div>
  );
}
