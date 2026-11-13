// チュートリアル
// ・Tour：画面の各場所を順番に光らせて、何が書いてあるかを説明する（最初に1回、あとは「遊び方」から何度でも）
// ・GuidePanel：いまの段階で「次にやること」を一覧にして、終わったものに ✓ をつける
import { useEffect, useLayoutEffect, useMemo, useState, type CSSProperties } from 'react';
import { buildGuide } from '../core/guide';
import { useGame } from './common';

// ------------------------------------------------------------
// 画面の案内（ツアー）
// ------------------------------------------------------------
interface TourStep {
  target?: string; // 光らせる場所（CSS セレクタ）。なければ画面の真ん中に説明だけ出す
  title: string;
  text: string;
}

const TOUR: TourStep[] = [
  {
    title: 'ようこそ、情報システムの司令室へ',
    text: 'あなたは情報システムをつくるチームのリーダーです。依頼主の困りごとを調べ、システムを設計・開発し、動かし続けます。まずは画面の見方を案内します（1分ほど）。',
  },
  { target: '.tb-stats', title: '会社と案件の状況', text: '日付、会社の資金、案件の予算の残り、納期までの残りの期間です。資金が尽きると倒産なので気をつけましょう。' },
  {
    target: '.tb-time',
    title: '時間の進め方',
    text: '開発と運用のあいだは、▶ で時間が流れます（⏩ は早送り、⏸ で一時停止）。障害や攻撃など大事なことが起きると、自動で一時停止します。調査・要件定義・設計は、作業を選ぶと時間が進みます。',
  },
  { target: '.tb-tools', title: '表示の切り替えと用語集', text: '「かんたん／詳細」で表示の細かさを変えられます。詳細にすると数値やコードが出ます。青い点線の言葉（用語）を押すと説明が出て、用語集に集まります。' },
  { target: '.screens', title: '画面の切り替え', text: '司令室のほか、システム（構成）、業務（仕事の流れ）、開発（調査〜リリース）、運用・セキュリティ、管理（お金・メンバー）の画面があります。' },
  { target: '.cc-left', title: '対応が必要なこと', text: 'いまやるべき作業や、警告・障害・攻撃・要望が並びます。赤は緊急、紫はセキュリティ、黄は要確認。選ぶと原因と対応の候補が右に出ます。' },
  { target: '.cc-center', title: 'システム構成図', text: '利用者からサーバー・データベースまでの構成と、データの流れ（青い点）です。混んでいると黄、止まると赤になります。機器を押すと、性能や壊れたときの影響が分かります。' },
  { target: '.cc-right', title: '詳しい説明と対応', text: '選んだ項目の「何が起きているか・放置するとどうなるか・対応の候補（費用・時間・効果）」や、機器の仕組みの解説が出ます。' },
  { target: '.cc-status', title: '6つの状態', text: '満足度・安定性・処理速度・安全性・進み具合・運用コストです。判断すると、どれが良くなり、どれが悪くなったかが通知されます（速くしたら高くなった、など）。' },
  { target: '.guide', title: '次にやること', text: '迷ったら、ここを見ましょう。いまの段階でやることが順番に並び、終わると ✓ がつきます。「この画面へ」で作業する画面に移動できます。' },
  { title: '準備ができました', text: 'まずは「開発」画面で依頼を1つ引き受けてみましょう。案内は右上の「遊び方」から、いつでもまた見られます。' },
];

export const TOUR_KEY = 'joho-game-tour-v1';

export function Tour({ onClose }: { onClose: () => void }) {
  const { setScreen } = useGame();
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = TOUR[i];
  const last = i === TOUR.length - 1;

  useEffect(() => setScreen('main'), [setScreen]);

  // 光らせる場所の位置を測る（スクロールや画面の大きさが変わったら測り直す）
  useLayoutEffect(() => {
    if (!step.target) {
      setRect(null);
      return;
    }
    const el = document.querySelector(step.target);
    if (!el) {
      setRect(null);
      return;
    }
    const inBar = !!el.closest('.topbar');
    if (!inBar) el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
    const measure = () => setRect(el.getBoundingClientRect());
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [step.target, i]);

  const finish = () => {
    try {
      localStorage.setItem(TOUR_KEY, 'done');
    } catch {
      /* 保存できなくても閉じる */
    }
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      if (e.key === 'ArrowRight' || e.key === 'Enter') setI((x) => Math.min(x + 1, TOUR.length - 1));
      if (e.key === 'ArrowLeft') setI((x) => Math.max(x - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 説明の箱の位置：光らせた場所の下 → 上 → 画面の下 の順に、入るところへ置く
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(380, vw - 32);
  const H = 230;
  let pos: CSSProperties;
  if (!rect) pos = { left: (vw - w) / 2, top: Math.max(16, vh / 2 - H / 2) };
  else {
    const left = Math.min(Math.max(16, rect.left), vw - w - 16);
    if (vh - rect.bottom > H + 12) pos = { left, top: rect.bottom + 12 };
    else if (rect.top > H + 12) pos = { left, bottom: vh - rect.top + 12 };
    else pos = { left: (vw - w) / 2, bottom: 16 };
  }
  const pad = 6;

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label="画面の案内">
      {rect ? (
        <div
          className="tour-spot"
          style={{
            left: Math.max(4, rect.left - pad),
            top: Math.max(4, rect.top - pad),
            width: Math.min(vw - 8, rect.width + pad * 2),
            height: Math.min(vh - 8, rect.height + pad * 2),
          }}
        />
      ) : (
        <div className="tour-dim" />
      )}
      <div className="tour-card stack tight" style={{ ...pos, width: w }}>
        <div className="spread">
          <span className="tiny muted">
            画面の案内 {i + 1} / {TOUR.length}
          </span>
          <button className="btn ghost small" onClick={finish}>
            スキップ
          </button>
        </div>
        <h3 style={{ margin: 0 }}>{step.title}</h3>
        <p className="small" style={{ margin: 0 }}>
          {step.text}
        </p>
        <div className="tour-dots" aria-hidden="true">
          {TOUR.map((_, k) => (
            <i key={k} className={k === i ? 'on' : k < i ? 'past' : ''} />
          ))}
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          {i > 0 && (
            <button className="btn small" onClick={() => setI(i - 1)}>
              ← 戻る
            </button>
          )}
          <button className="btn primary small" onClick={() => (last ? finish() : setI(i + 1))} autoFocus>
            {last ? 'はじめる' : '次へ →'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// 次にやること（ガイド）
// ------------------------------------------------------------
export type GuideView = 'open' | 'min' | 'off';
export const GUIDE_KEY = 'joho-game-guide';

export function loadGuideView(): GuideView {
  try {
    const v = localStorage.getItem(GUIDE_KEY);
    if (v === 'open' || v === 'min' || v === 'off') return v;
  } catch {
    /* 読めなければ初期値 */
  }
  return window.innerWidth < 700 ? 'min' : 'open';
}

export function GuidePanel({ view, setView, onTour }: { view: GuideView; setView: (v: GuideView) => void; onTour: () => void }) {
  const { s, screen, setScreen } = useGame();
  const guide = useMemo(() => buildGuide(s), [s]);
  const doneCount = guide.steps.filter((x) => x.done).length;
  const [open, setOpen] = useState<string | null>(null);
  // 次の手順に進んだら、その説明を開く
  useEffect(() => setOpen(guide.current), [guide.current]);

  if (view === 'off') return null;
  if (view === 'min')
    return (
      <button className="guide guide-pill" onClick={() => setView('open')} aria-label="次にやることを開く">
        📘 次にやること <span className="muted">{guide.title}</span>
      </button>
    );

  return (
    <aside className="guide" aria-label="次にやること">
      <div className="spread">
        <b className="small">📘 次にやること</b>
        <span className="row" style={{ gap: 2 }}>
          <button className="btn ghost small" onClick={() => setView('min')} title="小さくする" aria-label="小さくする">
            —
          </button>
          <button className="btn ghost small" onClick={() => setView('off')} title="隠す（「遊び方」からまた出せます）" aria-label="隠す">
            ✕
          </button>
        </span>
      </div>
      <div className="guide-phase">
        <b>{guide.title}</b>
        <span className="tiny muted">
          {doneCount}/{guide.steps.length}
        </span>
      </div>
      <div className="tiny muted">{guide.goal}</div>
      <ol className="guide-steps">
        {guide.steps.map((st) => {
          const cur = st.id === guide.current;
          const mark = st.done ? '✓' : cur ? '▶' : '○';
          return (
            <li key={st.id} className={`${st.done ? 'done' : ''} ${cur ? 'cur' : ''}`}>
              <button className="guide-step" onClick={() => setOpen(open === st.id ? null : st.id)} aria-expanded={open === st.id}>
                <span className="gmark" aria-hidden="true">
                  {mark}
                </span>
                <span>
                  {st.text}
                  {st.optional && <span className="tiny muted">（任意）</span>}
                  {st.done && <span className="sr-only">（完了）</span>}
                </span>
              </button>
              {open === st.id && (
                <div className="guide-more tiny">
                  {st.hint && <div>{st.hint}</div>}
                  {st.screen && st.screen !== screen && (
                    <button className="btn small primary" onClick={() => setScreen(st.screen!)}>
                      この画面へ →
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <button className="linkish tiny" onClick={onTour}>
        画面の案内をもう一度見る
      </button>
    </aside>
  );
}
