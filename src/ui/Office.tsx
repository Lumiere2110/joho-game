// オフィス画面：依頼を選ぶ・チームを整える・実績を見る
import { useState } from 'react';
import { CASES, caseById } from '../core/cases';
import { TRAIN_COST } from '../core/game';
import { budgetFor } from '../core/project';
import type { Member, SkillKey } from '../core/types';
import { SKILL_KEYS, SKILL_NAMES } from '../core/types';
import { Meter, man, useGame } from './common';

export function Office() {
  const [tab, setTab] = useState<'cases' | 'team' | 'results'>('cases');
  const { s, dispatch } = useGame();
  return (
    <div className="grid2">
      <div>
        <div className="tabs">
          <button className={`tab ${tab === 'cases' ? 'on' : ''}`} onClick={() => setTab('cases')}>
            依頼一覧
          </button>
          <button className={`tab ${tab === 'team' ? 'on' : ''}`} onClick={() => setTab('team')}>
            チーム（{s.staff.length}人）
          </button>
          <button className={`tab ${tab === 'results' ? 'on' : ''}`} onClick={() => setTab('results')}>
            実績（{s.results.length}）
          </button>
        </div>
        {tab === 'cases' && <Cases />}
        {tab === 'team' && <Team />}
        {tab === 'results' && <Results />}
      </div>
      <aside className="stack">
        <div className="card stack">
          <h3>オフィス</h3>
          <p className="small">案件がない間も人件費はかかります。依頼を選ぶか、メンバーを研修・採用してチームを強くしましょう。</p>
          <button className="btn" onClick={() => dispatch({ type: 'nextWeek' })}>
            1週間待つ（採用候補が入れ替わる）
          </button>
        </div>
        <div className="card">
          <h3>できごと</h3>
          <ul className="log">
            {s.log.slice(0, 40).map((l, i) => (
              <li key={i}>
                <span className="w">{l.week}週</span>
                <span className={l.kind}>{l.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}

const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n);

export function Cases() {
  const { s, dispatch } = useGame();
  return (
    <div className="stack">
      {CASES.map((c) => {
        const locked = s.reputation < c.unlockRep;
        const done = s.results.filter((r) => r.caseId === c.id);
        return (
          <div key={c.id} className="card stack">
            <div className="spread">
              <div>
                <div className="tiny muted">{c.industry}</div>
                <h3 style={{ margin: 0 }}>
                  {c.client}：{c.title}
                </h3>
              </div>
              <span className="badge accent">難易度 {stars(c.difficulty)}</span>
            </div>
            <div className="bubble">
              <div className="who">{c.client}からの依頼</div>
              {c.request}
            </div>
            <div className="row small">
              <span className="badge">予算 {man(budgetFor(c, s.reputation))}</span>
              <span className="badge">納期 {c.deadlineWeeks}週間</span>
              <span className="badge">運用保守 {c.opsWeeks}週間</span>
              {c.personalData !== 'none' && <span className="badge warn">{c.personalData === 'sensitive' ? '要配慮個人情報あり' : '個人情報あり'}</span>}
              {done.length > 0 && <span className="badge good">クリア済み（最高満足度 {Math.max(...done.map((r) => r.satisfaction))}）</span>}
            </div>
            <div className="row">
              <button className="btn primary" disabled={locked} onClick={() => dispatch({ type: 'startCase', caseId: c.id })}>
                この依頼を受ける
              </button>
              {locked && <span className="small muted">評判 {c.unlockRep} 以上で受注できます（今 {s.reputation}）</span>}
            </div>
          </div>
        );
      })}
      <p className="muted small">評判が上がるほど、同じ依頼でも大きな予算で受注できます。案件は今後も増えていきます。</p>
    </div>
  );
}

export function SkillBars({ m }: { m: Member }) {
  return (
    <div className="stack" style={{ gap: 4 }}>
      {SKILL_KEYS.map((k) => (
        <div key={k} className="row small" style={{ gap: 8, marginTop: 2 }}>
          <span style={{ width: 82 }}>{SKILL_NAMES[k]}</span>
          <span style={{ flex: 1 }}>
            <Meter value={m.skills[k]} max={5} />
          </span>
          <b className="num" style={{ width: 14 }}>
            {m.skills[k]}
          </b>
        </div>
      ))}
    </div>
  );
}

export function Team() {
  const { s, dispatch } = useGame();
  const [train, setTrain] = useState<Record<string, SkillKey>>({});
  return (
    <div className="stack">
      <div className="cols">
        {s.staff.map((m) => (
          <div key={m.id} className="card stack">
            <div className="spread">
              <div>
                <b>{m.name}</b>
                <div className="tiny muted">{m.title}</div>
              </div>
              <span className="badge">{man(m.salary)}/週</span>
            </div>
            <SkillBars m={m} />
            <div className="small">疲労 {Math.round(m.fatigue)}</div>
            <div className="row">
              <select value={train[m.id] ?? 'dev'} onChange={(e) => setTrain({ ...train, [m.id]: e.target.value as SkillKey })}>
                {SKILL_KEYS.map((k) => (
                  <option key={k} value={k} disabled={m.skills[k] >= 5}>
                    {SKILL_NAMES[k]}
                  </option>
                ))}
              </select>
              <button className="btn" disabled={m.skills[train[m.id] ?? 'dev'] >= 5} onClick={() => dispatch({ type: 'train', id: m.id, skill: train[m.id] ?? 'dev' })}>
                研修（{TRAIN_COST}万円・1週）
              </button>
            </div>
            {s.staff.length > 1 && (
              <button className="btn ghost danger small" onClick={() => confirm(`${m.name} を退職させますか？（退職金 ${m.salary * 2}万円）`) && dispatch({ type: 'fire', id: m.id })}>
                退職させる
              </button>
            )}
          </div>
        ))}
      </div>
      <h3>採用候補</h3>
      <div className="cols">
        {s.candidates.map((m) => (
          <div key={m.id} className="card soft stack">
            <div className="spread">
              <div>
                <b>{m.name}</b>
                <div className="tiny muted">{m.title}</div>
              </div>
              <span className="badge">{man(m.salary)}/週</span>
            </div>
            <SkillBars m={m} />
            <button className="btn primary" onClick={() => dispatch({ type: 'hire', id: m.id })}>
              採用する（採用費 {man(m.salary * 4)}）
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Results() {
  const { s } = useGame();
  if (!s.results.length) return <p className="muted">まだ完了した案件はありません。</p>;
  return (
    <div className="card table-wrap">
      <table>
        <thead>
          <tr>
            <th>終了週</th>
            <th>依頼主</th>
            <th>満足度</th>
            <th>解決した問題</th>
            <th>収支</th>
            <th>評判</th>
          </tr>
        </thead>
        <tbody>
          {s.results.map((r, i) => (
            <tr key={i}>
              <td className="num">{r.week}</td>
              <td>{caseById(r.caseId).client}</td>
              <td className="num">{r.satisfaction}</td>
              <td className="num">
                {r.solved}/{r.totalProblems}
              </td>
              <td className="num">{man(r.profit)}</td>
              <td className="num">{r.repDelta >= 0 ? `+${r.repDelta}` : r.repDelta}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
