// 要件定義フェーズ：作る機能と契約の形を決める
import { caseById } from '../core/cases';
import { describeCond, isSolved, totalEffort } from '../core/project';
import { workRate } from '../core/staff';
import { T, TermList, man, useGame } from './common';

export function RequirementsView() {
  const { s, dispatch } = useGame();
  const p = s.project!;
  const c = caseById(p.caseId);
  const effort = totalEffort(c, p);
  const teamRate = s.staff.reduce((a, m) => a + workRate(m, 'dev', false), 0);
  const weeks = effort / Math.max(0.1, teamRate);
  const left = p.startWeek + c.deadlineWeeks - s.week - 1; // 設計に1週
  const found = c.problems.filter((x) => p.foundProblems.includes(x.id));
  const featEffort = c.features.filter((f) => p.features.includes(f.id)).reduce((a, f) => a + f.effort, 0);

  return (
    <div className="stack">
      <div className="card stack">
        <h2>
          <T id="requirements">要件定義</T>：何を作るか決める
        </h2>
        <p className="small">
          見つけた問題を解決する機能を選びましょう。機能を増やすほど依頼主は喜びますが、<T id="man-week">工数</T>が増えて納期が苦しくなります。
          速さや安定性、セキュリティなどの<T id="nonfunctional">非機能要件</T>は、次の設計フェーズで決めます。
        </p>
      </div>

      <div className="card stack">
        <h3>見つかった問題と解決方法</h3>
        {found.map((x) => {
          const ok = isSolved(c, p, x, 'plan');
          const viaFeature = x.solvedBy.some((cond) => 'feature' in cond);
          return (
            <div key={x.id} className={`problem ${ok ? 'solved' : 'unsolved'}`}>
              <div className="row">
                <b>{x.title}</b>
                <span className={`badge ${x.severity === 3 ? 'bad' : x.severity === 2 ? 'warn' : ''}`}>重要度 {'●'.repeat(x.severity)}</span>
                {ok ? <span className="badge good">解決の見込み</span> : <span className="badge warn">{viaFeature ? '未対応' : '設計で対応'}</span>}
              </div>
              <div className="tiny muted">解決方法：{x.solvedBy.map((cond) => describeCond(c, cond)).join(' または ')}</div>
            </div>
          );
        })}
        {found.length < c.problems.length && <div className="warnbox">調査で見つけていない問題がまだあるかもしれません。</div>}
      </div>

      <div className="card stack">
        <h3>作る機能</h3>
        <div className="options">
          {c.features.map((f) => {
            const on = p.features.includes(f.id);
            const solves = c.problems.filter((x) => x.solvedBy.some((cond) => 'feature' in cond && cond.feature === f.id));
            return (
              <button key={f.id} className={`option ${on ? 'on' : ''}`} disabled={f.required} style={f.required ? { opacity: 1 } : undefined} onClick={() => dispatch({ type: 'toggleFeature', id: f.id })}>
                <div className="title">
                  <input type="checkbox" checked={on} readOnly />
                  {f.name}
                  <span className="badge">{f.effort}人週</span>
                  {f.required && <span className="badge accent">必須</span>}
                  {solves
                    .filter((x) => p.foundProblems.includes(x.id))
                    .map((x) => (
                      <span key={x.id} className="badge good">
                        →「{x.title}」
                      </span>
                    ))}
                  {f.satisfaction ? <span className="badge">あると便利</span> : null}
                </div>
                <div className="small">{f.desc}</div>
              </button>
            );
          })}
        </div>
        <div className="row small">
          <span className="badge">機能の工数 合計 {featEffort.toFixed(1)}人週</span>
          <span className="badge">開発全体の見込み 約{effort.toFixed(1)}人週</span>
          <span className={`badge ${weeks > left ? 'bad' : weeks > left - 2 ? 'warn' : 'good'}`}>
            チームで約 {weeks.toFixed(1)} 週（納期まで残り約 {left} 週）
          </span>
        </div>
        <TermList ids={['wbs', 'qcd']} />
      </div>

      <div className="card stack">
        <h3>契約の形</h3>
        <div className="cols">
          <button className={`option ${p.contract === 'ukeoi' ? 'on' : ''}`} onClick={() => dispatch({ type: 'setContract', contract: 'ukeoi' })}>
            <div className="title">
              <T id="ukeoi">請負契約</T>
            </div>
            <div className="small">
              完成させて納品したら代金を受け取る。着手時に30%（{man(p.budget * 0.3)}）、納品時に70%。予算内で早く作れば利益が大きいが、遅れたり費用がかさんだりすると自社の負担。仕様変更は交渉が必要。
            </div>
          </button>
          <button className={`option ${p.contract === 'junin' ? 'on' : ''}`} onClick={() => dispatch({ type: 'setContract', contract: 'junin' })}>
            <div className="title">
              <T id="junin">準委任契約</T>
            </div>
            <div className="small">
              作業した週ごとに人件費の1.25倍を受け取る（上限は予算の1.2倍）。機器の初期費用も依頼主が負担。損をしにくいが、大きくもうけにくい。仕様変更を受けると納期も延びる。
            </div>
          </button>
        </div>
      </div>

      <div className="spread">
        <button className="btn" onClick={() => dispatch({ type: 'backToInvestigation' })}>
          ← 調査に戻る
        </button>
        <button className="btn primary big" disabled={!p.contract} onClick={() => dispatch({ type: 'confirmRequirements' })}>
          要件を確定して設計へ
        </button>
      </div>
    </div>
  );
}
