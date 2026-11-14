// アプリ全体。状態を持ち、上部の操作バーと画面の切り替え、時間の進行を受け持つ
import { StudyScreen } from './Study';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { caseById } from '../core/cases';
import { reduce, type Action } from '../core/game';
import { TERMS, TERM_CATEGORIES, termById } from '../core/glossary';
import { buildIssues } from '../core/issues';
import { canRelease, deadlineWeek } from '../core/project';
import { clearSave, loadGame, saveGame } from '../core/save';
import { computeStatus, type StatusItem } from '../core/status';
import { fmtDate } from '../core/time';
import type { GameState } from '../core/types';
import { PHASE_NAMES } from '../core/types';
import { CommandCenter } from './CommandCenter';
import { GameCtx, Modal, man, useGame, type Mode, type Screen, type Selection } from './common';
import { GUIDE_KEY, GuidePanel, TOUR_KEY, Tour, loadGuideView, type GuideView } from './Tutorial';
import { AdminScreen, BusinessScreen, DevScreen, OpsScreen, SystemScreen } from './Screens';

type Root = GameState | null;

function rootReduce(s: Root, a: Action): Root {
  if (a.type === 'newGame') return reduce(null as unknown as GameState, a);
  if (!s) return s;
  return reduce(s, a);
}

const MODE_KEY = 'joho-game-mode';
function loadMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === 'detail' ? 'detail' : 'easy';
  } catch {
    return 'easy';
  }
}

const SCREENS: { id: Screen; label: string }[] = [
  { id: 'main', label: '司令室' },
  { id: 'system', label: 'システム' },
  { id: 'business', label: '業務' },
  { id: 'dev', label: '開発' },
  { id: 'ops', label: '運用・セキュリティ' },
  { id: 'admin', label: '管理' },
  { id: 'study', label: '🧩 勉強会' },
];

interface Toast {
  key: number;
  title: string;
  items: { label: string; from: string; to: string; better: boolean | null }[];
}

/** 判断の前後で、状態がどう変わったかを並べる */
function diffStatus(before: StatusItem[], after: StatusItem[], mode: Mode): Toast['items'] {
  const out: Toast['items'] = [];
  for (const a of after) {
    const b = before.find((x) => x.id === a.id);
    if (!b || b.display === a.display) continue;
    let better: boolean | null = null;
    if (a.value !== null && b.value !== null && a.value !== b.value) better = a.id === 'cost' ? a.value < b.value : a.value > b.value;
    out.push({ label: a.label, from: mode === 'easy' && b.word !== a.word ? b.word : b.display, to: mode === 'easy' && b.word !== a.word ? a.word : a.display, better });
  }
  return out;
}

export function App() {
  const [state, rawDispatch] = useReducer(rootReduce, null, () => loadGame());
  const [term, setTerm] = useState<string | null>(null);
  const [glossary, setGlossary] = useState(false);
  const [help, setHelp] = useState(false);
  const [tour, setTour] = useState(() => {
    try {
      return !localStorage.getItem(TOUR_KEY);
    } catch {
      return false;
    }
  });
  const [guideView, setGuideViewRaw] = useState<GuideView>(loadGuideView);
  const setGuideView = (v: GuideView) => {
    setGuideViewRaw(v);
    try {
      localStorage.setItem(GUIDE_KEY, v);
    } catch {
      /* 保存できなくても動く */
    }
  };
  const [mode, setModeRaw] = useState<Mode>(loadMode);
  const [screen, setScreenRaw] = useState<Screen>('main');
  const [sel, setSel] = useState<Selection>(null);
  const [speed, setSpeed] = useState<0 | 1 | 2>(0);
  const [frozen, setFrozen] = useState(false);
  const [pauseNote, setPauseNote] = useState<{ text: string; issue?: string } | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const lastAct = useRef('');
  const prevState = useRef<Root>(state);
  const prevStatus = useRef<StatusItem[] | null>(state ? computeStatus(state) : null);

  const dispatch = useCallback((a: Action) => {
    lastAct.current = a.type;
    rawDispatch(a);
  }, []);
  const setMode = (m: Mode) => {
    setModeRaw(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* 保存できなくても動く */
    }
  };
  const setScreen = useCallback((x: Screen) => {
    setScreenRaw(x);
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (state) saveGame(state);
  }, [state]);

  const p = state?.project ?? null;
  const canAuto = !!state && !!p && (p.phase === 'develop' || p.phase === 'operate') && !p.pendingEvent && !state.gameOver;

  // 再生中は、一定の間隔で1週間ずつ進む
  useEffect(() => {
    if (!speed || !canAuto) return;
    const t = setTimeout(() => dispatch({ type: 'nextWeek' }), speed === 1 ? 3000 : 1200);
    return () => clearTimeout(t);
  }, [state, speed, canAuto, dispatch]);

  // 状態が変わったとき：自動一時停止の判定と、「何が変わったか」の表示
  useEffect(() => {
    const prev = prevState.current;
    prevState.current = state;
    if (!state) return;
    const now = computeStatus(state);
    const before = prevStatus.current;
    prevStatus.current = now;
    const a = lastAct.current;
    lastAct.current = '';
    if (before && a && !['learnTerm', 'load', 'newGame', 'startCase', 'finishCase', 'abandonCase'].includes(a)) {
      const items = diffStatus(before, now, mode);
      if (items.length) setToast({ key: Date.now(), title: a === 'nextWeek' ? `${fmtDate(state.week - 1)}の週の結果` : 'あなたの判断で変わったこと', items });
    }
    // 自動で一時停止する場面（失敗や攻撃を落ち着いて確認できるように）
    const pp = prev?.project;
    const cp = state.project;
    let reason: { text: string; issue?: string } | null = null;
    if (pp && (!cp || pp.phase !== cp.phase)) reason = { text: cp ? `「${PHASE_NAMES[cp.phase]}」の段階に進みました。` : '案件が終わりました。' };
    else if (cp?.pendingEvent && !pp?.pendingEvent) reason = { text: '依頼主から相談が来ました。返事をするまで開発は進みません。', issue: 'req-change' };
    else if (cp && pp && cp.phase === 'develop' && canRelease(cp) && !canRelease(pp)) reason = { text: '必須の作業が終わりました。リリースするか、テストを続けるか決めましょう。', issue: 'task-release' };
    else if (cp?.ops && (pp?.ops?.history.length ?? 0) < cp.ops.history.length) {
      const last = cp.ops.history[cp.ops.history.length - 1];
      const inc = (last.incidents ?? []).find((x) => x.kind === 'failure' || x.kind === 'attack' || x.kind === 'overload');
      if (inc) {
        const iss = buildIssues(state).find((x) => x.id.startsWith(`inc-${last.week}-${inc.node}`));
        reason = { text: `${inc.kind === 'attack' ? '攻撃を受けました' : inc.kind === 'overload' ? '処理が追いつかなくなりました' : '障害が起きました'}：${inc.title}`, issue: iss?.id };
      }
    }
    if (reason && (speed > 0 || reason.issue)) {
      if (speed > 0) {
        setSpeed(0);
        setFrozen(true);
      }
      setPauseNote(reason);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

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
            mode,
            screen,
            setScreen,
            sel,
            setSel,
            frozen,
          }
        : null,
    [state, dispatch, mode, screen, setScreen, sel, frozen],
  );

  if (!state || !ctx) return <Title onStart={(name) => dispatch({ type: 'newGame', seed: (Date.now() % 2147483647) | 0, companyName: name })} />;

  const time = {
    speed,
    canAuto,
    play: (v: 0 | 1 | 2) => {
      setSpeed(v);
      setFrozen(v === 0 && canAuto);
      if (v > 0) setPauseNote(null);
    },
    step: () => dispatch({ type: 'nextWeek' }),
  };

  return (
    <GameCtx.Provider value={ctx}>
      <TopBar time={time} setMode={setMode} onGlossary={() => setGlossary(true)} onHelp={() => setHelp(true)} />
      <nav className="screens" aria-label="画面の切り替え">
        {SCREENS.map((x) => (
          <button key={x.id} className={`scr ${screen === x.id ? 'on' : ''}`} onClick={() => setScreen(x.id)} aria-current={screen === x.id ? 'page' : undefined}>
            {x.label}
            {x.id === 'main' && <BadCount />}
          </button>
        ))}
      </nav>
      {pauseNote && (
        <div className="pausebar" role="status">
          <span>⏸ {pauseNote.text}</span>
          {pauseNote.issue && (
            <button
              className="btn small primary"
              onClick={() => {
                setScreen('main');
                setSel({ kind: 'issue', id: pauseNote.issue! });
                setPauseNote(null);
              }}
            >
              詳しく見る
            </button>
          )}
          <button className="btn ghost small" onClick={() => setPauseNote(null)} aria-label="閉じる">
            ✕
          </button>
        </div>
      )}
      <main className={screen === 'main' ? 'main wide' : 'main'}>
        {screen === 'main' && <CommandCenter />}
        {screen === 'system' && <SystemScreen />}
        {screen === 'business' && <BusinessScreen />}
        {screen === 'dev' && <DevScreen />}
        {screen === 'ops' && <OpsScreen />}
        {screen === 'admin' && <AdminScreen />}
        {screen === 'study' && <StudyScreen />}
      </main>
      {toast && (
        <div className="toast" key={toast.key} role="status">
          <div className="spread">
            <b>{toast.title}</b>
            <button className="btn ghost small" onClick={() => setToast(null)} aria-label="閉じる">
              ✕
            </button>
          </div>
          <ul className="plain small">
            {toast.items.map((x) => (
              <li key={x.label}>
                <span className="muted">{x.label}：</span>
                {x.from} → <b>{x.to}</b>
                {x.better !== null && <span className={`delta ${x.better ? 'up' : 'down'}`}>{x.better ? ' ▲ 良くなった' : ' ▼ 悪くなった'}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
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
      <GuidePanel view={guideView} setView={setGuideView} onTour={() => setTour(true)} />
      {tour && !state.gameOver && (
        <Tour
          onClose={() => {
            setTour(false);
            // 案内が終わったら、広い画面では「次にやること」を開いておく
            if (guideView === 'min' && window.innerWidth >= 700) setGuideView('open');
          }}
        />
      )}
      {help && (
        <HelpModal
          onClose={() => setHelp(false)}
          onTour={() => {
            setHelp(false);
            setTour(true);
          }}
          guideOn={guideView !== 'off'}
          onGuide={() => setGuideView(guideView === 'off' ? 'open' : 'off')}
        />
      )}
    </GameCtx.Provider>
  );
}

function BadCount() {
  const { s } = useGame();
  const n = useMemo(() => buildIssues(s).filter((i) => i.tone === 'bad' || i.tone === 'security').length, [s]);
  return n ? <span className="cnt" aria-label={`急ぎ ${n}件`}>{n}</span> : null;
}

function Title({ onStart }: { onStart: (name: string) => void }) {
  const [name, setName] = useState('ルミエール情報システム');
  return (
    <div className="title-screen">
      <div className="card title-card stack">
        <div className="row">
          <div className="logo-mark big">情</div>
          <div>
            <h1>情報ゲーム</h1>
            <div className="muted">情報システムの司令室 — 企画し、つくり、守り、改善するストラテジー</div>
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

interface TimeCtl {
  speed: 0 | 1 | 2;
  canAuto: boolean;
  play: (v: 0 | 1 | 2) => void;
  step: () => void;
}

function TopBar({ time, setMode, onGlossary, onHelp }: { time: TimeCtl; setMode: (m: Mode) => void; onGlossary: () => void; onHelp: () => void }) {
  const { s, mode } = useGame();
  const p = s.project;
  const c = p ? caseById(p.caseId) : null;
  let remain = '—';
  if (p && c) {
    if (p.phase === 'operate' && p.ops) remain = `運用 ${p.ops.week}/${c.opsWeeks}週`;
    else if (p.phase === 'done') remain = '運用終了';
    else {
      const left = deadlineWeek(c, p) - s.week;
      remain = left >= 0 ? `納期まで あと${left}週` : `納期を${-left}週超過`;
    }
  }
  const canStep = !p || ((p.phase === 'develop' || p.phase === 'operate') && !p.pendingEvent);
  return (
    <header className="topbar">
      <div className="tb-brand">
        <span className="logo-mark">情</span>
        <div>
          <div className="tb-company">{s.companyName}</div>
          <div className="tiny muted">{p && c ? `${c.client}｜${PHASE_NAMES[p.phase]}` : '案件なし（依頼を選びましょう）'}</div>
        </div>
      </div>
      <div className="tb-stats">
        <div className="stat">
          <span className="k">日付</span>
          <span className="v">
            {fmtDate(s.week)}
            <span className="muted small">（第{s.week}週）</span>
          </span>
        </div>
        <div className="stat">
          <span className="k">資金</span>
          <span className={`v ${s.money < 0 ? 'neg' : ''}`}>{man(s.money)}</span>
        </div>
        {p && (
          <div className="stat">
            <span className="k">予算の残り</span>
            <span className={`v ${p.budget - p.spent < 0 ? 'neg' : ''}`}>{man(p.budget - p.spent)}</span>
          </div>
        )}
        <div className="stat">
          <span className="k">残りの期間</span>
          <span className="v">{remain}</span>
        </div>
      </div>
      <div className="tb-time" role="group" aria-label="時間の進み方">
        <button className={`tbtn ${time.speed === 0 ? 'on' : ''}`} onClick={() => time.play(0)} disabled={!time.canAuto} title="一時停止" aria-label="一時停止">
          ⏸
        </button>
        <button className={`tbtn ${time.speed === 1 ? 'on' : ''}`} onClick={() => time.play(1)} disabled={!time.canAuto} title="再生（3秒で1週間）" aria-label="再生">
          ▶
        </button>
        <button className={`tbtn ${time.speed === 2 ? 'on' : ''}`} onClick={() => time.play(2)} disabled={!time.canAuto} title="早送り" aria-label="早送り">
          ⏩
        </button>
        <button className="btn small" onClick={time.step} disabled={!canStep || time.speed > 0} title={canStep ? '' : '調査・要件定義・設計は、作業を選ぶと時間が進みます'}>
          {p ? '1週進める' : '1週待つ'}
        </button>
      </div>
      <div className="tb-tools">
        <div className="seg" role="group" aria-label="表示の細かさ">
          <button className={mode === 'easy' ? 'on' : ''} onClick={() => setMode('easy')}>
            かんたん
          </button>
          <button className={mode === 'detail' ? 'on' : ''} onClick={() => setMode('detail')}>
            詳細
          </button>
        </div>
        <button className="btn small" onClick={onGlossary}>
          用語集 {s.knownTerms.length}/{TERMS.length}
        </button>
        <button className="btn ghost small" onClick={onHelp}>
          遊び方
        </button>
      </div>
    </header>
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

function HelpModal({ onClose, onTour, guideOn, onGuide }: { onClose: () => void; onTour: () => void; guideOn: boolean; onGuide: () => void }) {
  return (
    <Modal onClose={onClose} wide>
      <h2>遊び方</h2>
      <div className="stack">
        <div className="card soft stack tight">
          <b>チュートリアル</b>
          <div className="small">画面の各場所を順番に案内します。左下の「次にやること」には、いまの段階でやることが順番に出て、終わると ✓ がつきます。</div>
          <div className="row">
            <button className="btn primary" onClick={onTour}>
              ▶ 画面の案内を見る
            </button>
            <button className="btn" onClick={onGuide}>
              {guideOn ? '「次にやること」を隠す' : '「次にやること」を表示する'}
            </button>
          </div>
        </div>
        <p>
          <b>司令室</b>が基本の画面です。左に「対応が必要なこと」、中央にシステムの構成図、右に詳しい説明と対応の候補、下に満足度・安定性・処理速度・安全性・進み具合・運用コストが出ます。左の項目を選ぶと構成図の関係する機器が光り、機器を選ぶと性能や費用、壊れたときの影響が見られます。上の ▶ で時間が進み、障害や攻撃が起きると自動で一時停止します。
        </p>
        <p>
          上のタブで「システム（構成）」「業務（仕事の流れ）」「開発（調査〜リリース）」「運用・セキュリティ」「管理（お金・契約・チーム）」「勉強会（アルゴリズムの練習問題）」に切り替えられます。勉強会でプログラムの問題を解くと、チームの開発スキルが育ちます。プログラムは「1手ずつ動きを見る」で動きを確かめられます。「かんたん／詳細」で表示の細かさを変えられます。
        </p>
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
