// 勉強会（アルゴリズム道場）の画面
// 左の問題一覧から選び、ブロックでプログラムを作って条件を満たせば合格。
// 初めて合格すると、チーム全員の「開発」の経験値が増える（時間は進まない）。
import { useState } from 'react';
import { DRILLS, drillConditions, drillProc, judgeDrill, type DrillJudge } from '../core/drills';
import { GOAL_TEXT, blockDef } from '../core/program';
import { TermList, useGame } from './common';
import { Workbench } from './Program';

const LEVEL = ['', '★', '★★', '★★★'];

export function StudyScreen() {
  const { s, dispatch } = useGame();
  const solved = s.drills ?? [];
  const [id, setId] = useState(() => DRILLS.find((d) => !solved.includes(d.id))?.id ?? DRILLS[0].id);
  const [judge, setJudge] = useState<DrillJudge | null>(null);
  const d = DRILLS.find((x) => x.id === id)!;
  const done = solved.includes(d.id);
  const proc = drillProc(d);
  const nextDrill = DRILLS.find((x) => !solved.includes(x.id) && x.id !== d.id);

  return (
    <div className="study">
      <div className="card stack tight">
        <h3>🧩 アルゴリズム道場</h3>
        <div className="tiny muted">
          社内勉強会の練習問題です。ブロックでプログラムを作り、条件を満たすと合格。初めて合格すると、チーム全員の<b>開発</b>の経験値が増えます（時間は進みません）。
        </div>
        <div className="small">
          解いた問題 {solved.length} / {DRILLS.length}
        </div>
        <div className="drill-list" role="list">
          {DRILLS.map((x) => (
            <button
              key={x.id}
              role="listitem"
              className={`drill-item ${x.id === id ? 'on' : ''}`}
              onClick={() => {
                setId(x.id);
                setJudge(null);
              }}
              aria-current={x.id === id ? 'true' : undefined}
            >
              <span className={solved.includes(x.id) ? 'ok' : 'muted'} aria-label={solved.includes(x.id) ? '解いた' : 'まだ'}>
                {solved.includes(x.id) ? '✓' : '○'}
              </span>
              <span>{x.title}</span>
              <span className="lv" aria-label={`難しさ${x.level}`}>
                {LEVEL[x.level]}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="card stack">
        <div className="spread">
          <h3>
            {d.title} <span className="tiny muted">{LEVEL[d.level]}</span>
          </h3>
          {done && <span className="badge good">✓ 解いた</span>}
        </div>
        <div>{d.story}</div>
        <div className="hint small stack tight">
          <div>
            <b>合格の条件</b>（テストで確かめること：{GOAL_TEXT[d.goal]}）
          </div>
          <ul className="checks">
            {drillConditions(d).map((c) => (
              <li key={c}>・{c}</li>
            ))}
          </ul>
          {d.limit.banned?.length ? <div className="tiny muted">使えないブロック：{d.limit.banned.map((k) => blockDef(k).name).join('／')}</div> : null}
          <div className="tiny muted">ごほうび：全員の開発の経験 +{d.reward}</div>
        </div>
        <details className="small">
          <summary>ヒントを見る</summary>
          <p>{d.hint}</p>
        </details>

        <Workbench
          key={d.id}
          proc={proc}
          initial={d.starter ?? []}
          starter={d.starter}
          banned={d.limit.banned}
          onRun={(blocks) => {
            const j = judgeDrill(d, blocks);
            setJudge(j);
            return j.result;
          }}
          actions={(blocks, result) =>
            !done && (
              <button className="btn" disabled={!result || !judge?.pass} onClick={() => dispatch({ type: 'solveDrill', id: d.id, blocks })}>
                🎓 合格を報告する
              </button>
            )
          }
          extra={(_b, result) =>
            result &&
            judge && (
              <div className={judge.pass ? 'goodbox small stack tight' : 'card soft small stack tight'}>
                <b>{judge.pass ? (done ? '合格です！' : '合格です！「合格を報告する」でごほうびを受け取りましょう') : 'まだ条件を満たしていません'}</b>
                <ul className="checks">
                  {judge.checks.map((c) => (
                    <li key={c.label} className={c.ok ? 'ok' : 'ng'}>
                      {c.ok ? '✓' : '✕'} {c.label}
                    </li>
                  ))}
                </ul>
                {!judge.pass && judge.result.ok && <div className="tiny muted">「👣 1手ずつ動きを見る」で、どこに手間がかかっているか確かめてみましょう。</div>}
              </div>
            )
          }
        />

        {done && (
          <div className="goodbox small stack tight">
            <b>解説</b>
            <div>{d.explain}</div>
            <TermList ids={d.terms} />
            {nextDrill && (
              <button
                className="btn small"
                onClick={() => {
                  setId(nextDrill.id);
                  setJudge(null);
                }}
              >
                次の問題「{nextDrill.title}」へ →
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
