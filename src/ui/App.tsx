// アプリ全体。状態を持ち、画面を切り替える
import { useEffect, useMemo, useReducer, useState } from 'react';
import { caseById } from '../core/cases';
import { reduce, type Action } from '../core/game';
import { TERMS, TERM_CATEGORIES, termById } from '../core/glossary';
import { deadlineWeek } from '../core/project';
import { clearSave, loadGame, saveGame } from '../core/save';
import { salaryTotal } from '../core/sim';
import type { GameState } from '../core/types';
import { PHASE_NAMES, type Phase } from '../core/types';
import { GameCtx, Meter, Modal, man, satTone, useGame } from './common';
import { DesignView } from './Design';
import { DevelopView } from './Develop';
import { DoneView } from './Done';
import { InvestigateView } from './Investigate';
import { Office } from './Office';
import { OperateView } from './Operate';
import { RequirementsView } from './Requirements';

type Root = GameState | null;

function rootReduce(s: Root, a: Action): Root {
  if (a.type === 'newGame') return reduce(null as unknown as GameState, a);
  if (!s) return s;
  return reduce(s, a);
}

export function App() {
  const [state, dispatch] = useReducer(rootReduce, null, () => loadGame());
  const [term, setTerm] = useState<string | null>(null);
  const [glossary, setGlossary] = useState(false);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    if (state) saveGame(state);
  }, [state]);

  const ctx = useMemo(
    () =>
      state
        ? {
            s: state,
            dispatch,
            openTerm: (id: string) => {
              setTerm(id);
              dispatch({ type: 'learnTerm', id });
            },
          }
        : null,
    [state],
  );

  if (!state || !ctx) return <Title onStart={(name) => dispatch({ type: 'newGame', seed: (Date.now() % 2147483647) | 0, companyName: name })} />;

  return (
    <GameCtx.Provider value={ctx}>
      <Header onGlossary={() => setGlossary(true)} onHelp={() => setHelp(true)} />
      <main className="main">{state.project ? <ProjectView /> : <Office />}</main>
      {state.gameOver && (
        <Modal>
          <h2>倒産…</h2>
          <p>資金が尽きてしまいました。会社をたたみ、もう一度挑戦しましょう。</p>
          <p className="muted small">
            完了した案件：{state.results.length} 件／習得した用語：{state.knownTerms.length} 語
          </p>
          <button
            className="btn primary"
            onClick={() => {
              clearSave();
              location.reload();
            }}
          >
            はじめからやり直す
          </button>
        </Modal>
      )}
      {term && <TermModal id={term} onClose={() => setTerm(null)} />}
      {glossary && <GlossaryModal onClose={() => setGlossary(false)} onPick={(id) => setTerm(id)} />}
      {help && <HelpModal onClose={() => setHelp(false)} />}
    </GameCtx.Provider>
  );
}

function Title({ onStart }: { onStart: (name: string) => void }) {
  const [name, setName] = useState('ルミエール情報システム');
  return (
    <div className="title-screen">
      <div className="card title-card stack">
        <div className="row">
          <div className="logo-mark" style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--accent)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700 }}>
            情
          </div>
          <div>
            <h1>情報ゲーム</h1>
            <div className="muted">情報システムを企画し、つくり、守り、改善するストラテジー</div>
          </div>
        </div>
        <p>
          あなたは、会社や街の情報システムをつくるチームのリーダーです。依頼主が「何に困っているのか」を調べ、限られた予算・人員・時間の中で、データベース・アルゴリズム・サーバー構成・セキュリティ・バックアップを選んでシステムを作り、運用していきます。
        </p>
        <label className="stack small">
          <span>会社の名前</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} />
        </label>
        <button className="btn primary big" disabled={!name.trim()} onClick={() => onStart(name.trim())}>
          会社を立ち上げる
        </button>
      </div>
    </div>
  );
}

function Header({ onGlossary, onHelp }: { onGlossary: () => void; onHelp: () => void }) {
  const { s } = useGame();
  return (
    <header className="header">
      <div className="logo">
        <span className="logo-mark">情</span>
        {s.companyName}
      </div>
      <div className="stats">
        <div className="stat">
          <span className="k">週</span>
          <span className="v">{s.week}週目</span>
        </div>
        <div className="stat">
          <span className="k">資金</span>
          <span className={`v ${s.money < 0 ? 'neg' : ''}`}>{man(s.money)}</span>
        </div>
        <div className="stat">
          <span className="k">人件費</span>
          <span className="v">{man(salaryTotal(s))}/週</span>
        </div>
        <div className="stat">
          <span className="k">評判</span>
          <span className="v">{s.reputation}</span>
        </div>
        <button className="btn" onClick={onGlossary}>
          用語集 {s.knownTerms.length}/{TERMS.length}
        </button>
        <button className="btn ghost" onClick={onHelp}>
          遊び方
        </button>
      </div>
    </header>
  );
}

const PHASES: Phase[] = ['investigate', 'requirements', 'design', 'develop', 'operate', 'done'];

function ProjectView() {
  const { s } = useGame();
  const p = s.project!;
  const idx = PHASES.indexOf(p.phase);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [p.phase]);
  return (
    <>
      <div className="stepper">
        {PHASES.map((ph, i) => (
          <div key={ph} className={`step ${i < idx ? 'done' : i === idx ? 'now' : ''}`}>
            {i + 1}. {PHASE_NAMES[ph]}
          </div>
        ))}
      </div>
      <div className="grid2">
        <div>
          {p.phase === 'investigate' && <InvestigateView />}
          {p.phase === 'requirements' && <RequirementsView />}
          {p.phase === 'design' && <DesignView />}
          {p.phase === 'develop' && <DevelopView />}
          {p.phase === 'operate' && <OperateView />}
          {p.phase === 'done' && <DoneView />}
        </div>
        <SidePanel />
      </div>
    </>
  );
}

function SidePanel() {
  const { s, dispatch } = useGame();
  const p = s.project!;
  const c = caseById(p.caseId);
  const dl = deadlineWeek(c, p);
  const left = dl - s.week;
  const [confirm, setConfirm] = useState(false);
  return (
    <aside className="stack">
      <div className="card stack">
        <div>
          <div className="tiny muted">{c.industry}</div>
          <h3 style={{ margin: 0 }}>{c.client}</h3>
          <div className="small">{c.title}</div>
        </div>
        <table className="small">
          <tbody>
            <tr>
              <th>受注額（予算）</th>
              <td className="right num">{man(p.budget)}</td>
            </tr>
            <tr>
              <th>契約</th>
              <td className="right">{p.contract === 'ukeoi' ? '請負' : p.contract === 'junin' ? '準委任' : '未定'}</td>
            </tr>
            <tr>
              <th>納期</th>
              <td className="right num">
                {dl}週目{p.phase !== 'operate' && p.phase !== 'done' && <span className={left < 0 ? 'badge bad' : left <= 2 ? 'badge warn' : 'badge'} style={{ marginLeft: 6 }}>{left >= 0 ? `あと${left}週` : `${-left}週遅れ`}</span>}
              </td>
            </tr>
            <tr>
              <th>この案件の支出</th>
              <td className="right num">{man(p.spent)}</td>
            </tr>
            <tr>
              <th>この案件の収入</th>
              <td className="right num">{man(p.received)}</td>
            </tr>
            <tr>
              <th>収支</th>
              <td className={`right num ${p.received - p.spent < 0 ? 'muted' : ''}`}>{man(p.received - p.spent)}</td>
            </tr>
          </tbody>
        </table>
        {(p.phase === 'operate' || p.phase === 'done') && (
          <div>
            <div className="spread small">
              <span>依頼主の満足度</span>
              <b className="num">{Math.round(p.satisfaction)}</b>
            </div>
            <Meter value={p.satisfaction} tone={satTone(p.satisfaction)} />
          </div>
        )}
        {p.phase !== 'done' && (
          <button className="btn danger ghost small" onClick={() => setConfirm(true)}>
            案件をやめる…
          </button>
        )}
      </div>
      <div className="card">
        <h3>できごと</h3>
        <ul className="log">
          {s.log.slice(0, 60).map((l, i) => (
            <li key={i}>
              <span className="w">{l.week}週</span>
              <span className={l.kind}>{l.text}</span>
            </li>
          ))}
        </ul>
      </div>
      {confirm && (
        <Modal onClose={() => setConfirm(false)}>
          <h3>案件を途中でやめますか？</h3>
          <p>依頼主に迷惑がかかるので、評判が 5 下がります。これまでの費用は戻りません。</p>
          <div className="row">
            <button className="btn danger" onClick={() => (setConfirm(false), dispatch({ type: 'abandonCase' }))}>
              やめる
            </button>
            <button className="btn" onClick={() => setConfirm(false)}>
              続ける
            </button>
          </div>
        </Modal>
      )}
    </aside>
  );
}

function TermModal({ id, onClose }: { id: string; onClose: () => void }) {
  const t = termById(id);
  if (!t) return null;
  return (
    <Modal onClose={onClose}>
      <div className="tiny muted">{t.category}</div>
      <h2>{t.name}</h2>
      <p>{t.text}</p>
      {t.example && <div className="hint">ゲームでは：{t.example}</div>}
      <div className="row" style={{ marginTop: 14 }}>
        <span className="badge good">用語集に登録しました</span>
        <button className="btn" style={{ marginLeft: 'auto' }} onClick={onClose}>
          閉じる
        </button>
      </div>
    </Modal>
  );
}

function GlossaryModal({ onClose, onPick }: { onClose: () => void; onPick: (id: string) => void }) {
  const { s } = useGame();
  const [cat, setCat] = useState<string>('all');
  const [q, setQ] = useState('');
  const list = TERMS.filter((t) => (cat === 'all' || t.category === cat) && (!q || t.name.includes(q) || t.text.includes(q)));
  return (
    <Modal onClose={onClose} wide>
      <div className="spread">
        <h2 style={{ margin: 0 }}>用語集</h2>
        <span className="muted small">
          習得 {s.knownTerms.length} / {TERMS.length}（ゲーム中に出てきた用語をクリックすると習得）
        </span>
      </div>
      <div className="row" style={{ margin: '12px 0' }}>
        <select value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="all">すべての分野</option>
          {TERM_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}（{TERMS.filter((t) => t.category === c && s.knownTerms.includes(t.id)).length}/{TERMS.filter((t) => t.category === c).length}）
            </option>
          ))}
        </select>
        <input type="text" placeholder="検索" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="cols3">
        {list.map((t) => {
          const known = s.knownTerms.includes(t.id);
          return (
            <button key={t.id} className="option" onClick={() => onPick(t.id)}>
              <div className="title">
                {known ? t.name : '？？？'}
                {known && <span className="badge good">習得</span>}
              </div>
              <div className="tiny muted">{t.category}</div>
              {known && <div className="small" style={{ marginTop: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{t.text}</div>}
            </button>
          );
        })}
      </div>
      <div className="right" style={{ marginTop: 14 }}>
        <button className="btn" onClick={onClose}>
          閉じる
        </button>
      </div>
    </Modal>
  );
}

function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal onClose={onClose} wide>
      <h2>遊び方</h2>
      <div className="stack">
        <p>依頼を受けたら、6つのフェーズで情報システムを作り、運用します。</p>
        <ol className="stack" style={{ paddingLeft: 20 }}>
          <li>
            <b>調査</b>：関係者へのヒアリングや業務データの分析で、「誰が何に困っているか」を見つけます。調査には日数がかかります（5日で1週間）。データを見るには先に秘密保持契約（NDA）が必要です。原因を考えるクイズに正解すると、依頼主の信頼が上がります。
          </li>
          <li>
            <b>要件定義</b>：作る機能と契約の形（請負・準委任）を決めます。機能を増やすほど便利になりますが、工数（人週）が増えます。
          </li>
          <li>
            <b>設計</b>：データベースの表の分け方、処理のアルゴリズム、サーバーやネットワークの構成、セキュリティ・法務の対策、バックアップを決めます。数値はすべて実際の考え方（計算量、待ち行列、稼働率、RPO/RTO）で計算されます。
          </li>
          <li>
            <b>開発</b>：メンバーをタスクに割り当てて、1週間ずつ進めます。得意なスキルのタスクほど速く、バグも少なくなります。残業すると速く進みますが、疲れてバグが増えます。テストでバグを減らしてからリリースしましょう。
          </li>
          <li>
            <b>運用</b>：アクセスの集中、機器の故障、攻撃、利用者の要望が毎週起こります。監視やバグ修正にメンバーを割り当て、必要なら構成を変更して改善します。
          </li>
          <li>
            <b>完了</b>：依頼主の満足度で評判が決まります。評判が上がると、大きな予算の案件や難しい案件を受けられます。
          </li>
        </ol>
        <p className="muted small">青い点線の言葉は用語です。クリックすると説明が出て、用語集に登録されます。進行は自動でブラウザに保存されます。</p>
        <div className="row">
          <button
            className="btn danger"
            onClick={() => {
              if (confirm('セーブデータを消して、最初からやり直しますか？')) {
                clearSave();
                location.reload();
              }
            }}
          >
            セーブデータを消して最初から
          </button>
          <button className="btn primary" style={{ marginLeft: 'auto' }} onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
    </Modal>
  );
}
