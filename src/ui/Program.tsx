// ブロックでプログラムを作る画面
// 左の一覧からブロックを選んで組み立て、「実行してテスト」で
// 答えが正しいか・データが増えると何倍の手間になるか（計算量）を確かめる。
// 詳細表示では、同じプログラムをコード（文字）で書くこともできる。
import { useEffect, useMemo, useState } from 'react';
import { fmt, fmtTime, opsCount } from '../core/calc';
import { caseById } from '../core/cases';
import {
  ALGO_NAME,
  BLOCKS,
  COMPLEXITY_TEXT,
  GOAL_TEXT,
  KEY_NAME,
  SIZES,
  blockDef,
  parseCode,
  runProgram,
  starterBlocks,
  toCode,
  type Block,
  type BlockKind,
  type ProgramResult,
  type SortAlgo,
  type SortKey,
} from '../core/program';
import type { Complexity, ProcessDef } from '../core/types';
import { T, useGame } from './common';

type Path = number[];
const same = (a: Path, b: Path) => a.length === b.length && a.every((x, i) => x === b[i]);

/** path（入れ物のブロックの位置）の中身の配列を取り出す。[] はいちばん外側 */
function listAt(root: Block[], path: Path): Block[] {
  let list = root;
  for (const i of path) list = list[i].body ??= [];
  return list;
}

const GROUPS: { id: 'control' | 'action' | 'structure'; label: string }[] = [
  { id: 'control', label: 'くり返し・条件' },
  { id: 'action', label: '処理' },
  { id: 'structure', label: 'データの仕組み' },
];

const ORDER: Complexity[] = ['1', 'logn', 'n', 'nlogn', 'n2'];

export function ProgramEditor({ proc, n, known }: { proc: ProcessDef; n: number; known: boolean }) {
  const { s, dispatch, mode } = useGame();
  const p = s.project!;
  const c = caseById(p.caseId);
  const saved = p.design.programs?.[proc.id];
  const goal = proc.program!.goal;
  const [blocks, setBlocks] = useState<Block[]>(() => structuredClone(saved?.blocks ?? []));
  const [at, setAt] = useState<Path>([]);
  const [result, setResult] = useState<ProgramResult | null>(saved?.result ?? null);
  const [code, setCode] = useState(() => toCode(saved?.blocks ?? []));
  const [codeErr, setCodeErr] = useState<string | null>(null);
  const appliedSame = !!saved && JSON.stringify(saved.blocks) === JSON.stringify(blocks);

  // ブロックを変えたら、前のテスト結果は古くなる
  const change = (next: Block[]) => {
    setBlocks(next);
    setResult(null);
    setCode(toCode(next));
    setCodeErr(null);
  };
  useEffect(() => {
    if (appliedSame && saved) setResult(saved.result);
  }, [appliedSame, saved]);

  const add = (kind: BlockKind) => {
    const next = structuredClone(blocks);
    const list = listAt(next, at);
    const def = blockDef(kind);
    const b: Block = { kind };
    if (kind === 'sort') {
      b.algo = 'merge';
      b.key = proc.program?.keys?.[0] ?? (goal === 'next' ? 'time' : 'key');
    }
    if (def.container) b.body = [];
    list.push(b);
    change(next);
    if (def.container) setAt([...at, list.length - 1]);
  };
  const remove = (path: Path) => {
    const next = structuredClone(blocks);
    listAt(next, path.slice(0, -1)).splice(path[path.length - 1], 1);
    change(next);
    setAt([]);
  };
  const move = (path: Path, d: -1 | 1) => {
    const next = structuredClone(blocks);
    const list = listAt(next, path.slice(0, -1));
    const i = path[path.length - 1];
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    change(next);
    setAt([]);
  };
  const patch = (path: Path, x: Partial<Block>) => {
    const next = structuredClone(blocks);
    const list = listAt(next, path.slice(0, -1));
    list[path[path.length - 1]] = { ...list[path[path.length - 1]], ...x };
    change(next);
  };

  const renderList = (list: Block[], path: Path) => (
    <div className={`blist ${same(at, path) ? 'target' : ''}`}>
      {list.map((b, i) => {
        const bp = [...path, i];
        const def = blockDef(b.kind);
        return (
          <div key={i} className={`blk g-${def.group}`}>
            <div className="blk-row">
              <span className="blk-name">{def.name}</span>
              {b.kind === 'sort' && (
                <>
                  <select value={b.algo} onChange={(e) => patch(bp, { algo: e.target.value as SortAlgo })} aria-label="並べ替えの方法">
                    {(Object.keys(ALGO_NAME) as SortAlgo[]).map((k) => (
                      <option key={k} value={k}>
                        {ALGO_NAME[k]}
                      </option>
                    ))}
                  </select>
                  <select value={b.key} onChange={(e) => patch(bp, { key: e.target.value as SortKey })} aria-label="並べ替える順番">
                    {(Object.keys(KEY_NAME) as SortKey[]).map((k) => (
                      <option key={k} value={k}>
                        {KEY_NAME[k]}
                      </option>
                    ))}
                  </select>
                </>
              )}
              <span className="blk-tools">
                <button onClick={() => move(bp, -1)} disabled={i === 0} aria-label="上へ" title="上へ">
                  ↑
                </button>
                <button onClick={() => move(bp, 1)} disabled={i === list.length - 1} aria-label="下へ" title="下へ">
                  ↓
                </button>
                <button onClick={() => remove(bp)} aria-label="削除" title="削除">
                  ✕
                </button>
              </span>
            </div>
            {def.container && renderList(b.body ?? [], bp)}
          </div>
        );
      })}
      <button className="slot" onClick={() => setAt(path)}>
        {same(at, path) ? '▶ 次のブロックはここに入ります' : '＋ ここに追加する'}
      </button>
    </div>
  );

  // 本番のデータ量での見込み
  const est = useMemo(() => {
    if (!result?.ok || !result.complexity || !known) return null;
    const o = proc.options.find((x) => x.id === result.optionId) ?? proc.options[0];
    const online = goal !== 'order';
    const per = o.costPerOp * opsCount(result.complexity, n) * (online ? proc.callsPerRequest ?? 1 : 1);
    return { per, online, ops: opsCount(result.complexity, n) };
  }, [result, known, n, proc, goal]);
  const matched = result?.ok ? proc.options.find((o) => o.id === result.optionId) : undefined;
  const solves = matched ? c.problems.filter((pr) => pr.solvedBy.some((cond) => 'option' in cond && cond.option === matched.id) && p.foundProblems.includes(pr.id)) : [];

  return (
    <div className="prog stack">
      <div className="hint">
        <b>目的：</b>
        {proc.program!.target}
        <div className="tiny muted">テストで確かめること：{GOAL_TEXT[goal]}</div>
      </div>
      <div className="prog-grid">
        <div className="palette">
          {GROUPS.map((g) => (
            <div key={g.id} className="stack tight">
              <b className="tiny muted">{g.label}</b>
              {BLOCKS.filter((b) => b.group === g.id).map((b) => (
                <button key={b.kind} className={`pal g-${b.group}`} onClick={() => add(b.kind)} title={b.desc}>
                  ＋ {b.name}
                </button>
              ))}
            </div>
          ))}
          <div className="tiny muted">ブロックにマウスを重ねると説明が出ます。</div>
        </div>
        <div className="workspace">
          <div className="spread">
            <b className="small">プログラム</b>
            <span className="row" style={{ gap: 6 }}>
              <button className="btn small" onClick={() => change(starterBlocks(goal))} title="今のシステムと同じやり方を読み込む">
                今のやり方を読み込む
              </button>
              <button className="btn small ghost" onClick={() => change([])} disabled={!blocks.length}>
                全部消す
              </button>
            </span>
          </div>
          {blocks.length === 0 && <div className="tiny muted">左のブロックを押すと、ここに追加されます。「全件を見る」などの入れ物ブロックの中にも入れられます。</div>}
          {renderList(blocks, [])}
          <div className="row">
            <button className="btn primary" onClick={() => setResult(runProgram(proc, blocks))} disabled={!blocks.length}>
              ▶ 実行してテスト
            </button>
            <button
              className="btn"
              disabled={!result?.ok || appliedSame || p.phase !== 'design'}
              onClick={() => dispatch({ type: 'setProgram', proc: proc.id, blocks })}
              title={p.phase !== 'design' ? '設計フェーズで使えます' : ''}
            >
              {appliedSame && result?.ok ? '✓ 設計に使っています' : 'この処理を設計に使う'}
            </button>
          </div>
      {result && <ResultView r={result} />}
      {result?.ok && (
        <div className="stack tight">
          {matched ? (
            <div className="goodbox small">
              これは「{matched.name}」と同じ方式です。{matched.effort > 0 && `実装に +${matched.effort}人週。`}
              {solves.length > 0 && `問題「${solves.map((x) => x.title).join('」「')}」の解決につながります。`}
            </div>
          ) : (
            <div className="hint small">既存のどの方式とも違う「自作の方式」として使います（実装の手間はブロックの数で決まります）。</div>
          )}
          {est && (
            <div className="small">
              本番のデータ量（約{fmt(n)}件）だと：基本操作 約{fmt(est.ops)}回 → {est.online ? '1リクエストあたり' : '1回の処理'} 約{fmtTime(est.per)}
            </div>
          )}
        </div>
      )}
        </div>
      </div>

      {mode === 'detail' && (
        <details className="mech" open>
          <summary>コードで書く（詳細）</summary>
          <p className="tiny muted">
            1行に1つの命令を書きます。「{'{'}」と「{'}'}」で、くり返し・条件の中身を囲みます。# から後ろはメモ（コメント）です。使える命令：
            {BLOCKS.map((b) => b.code).join('／')}（並べ替えは「並べ替える マージ 受付時刻」のように方法と順番を書く）
          </p>
          <textarea className="code" value={code} onChange={(e) => setCode(e.target.value)} rows={Math.max(6, code.split('\n').length + 1)} spellCheck={false} aria-label="プログラムのコード" />
          <div className="row">
            <button
              className="btn small"
              onClick={() => {
                const r = parseCode(code);
                if ('error' in r) setCodeErr(r.error);
                else {
                  setBlocks(r.blocks);
                  setResult(null);
                  setCodeErr(null);
                  setAt([]);
                }
              }}
            >
              コードからブロックを作る
            </button>
            {codeErr && <span className="small bad-t">{codeErr}</span>}
          </div>
        </details>
      )}
    </div>
  );
}

function ResultView({ r }: { r: ProgramResult }) {
  if (!r.ok)
    return (
      <div className="badbox small">
        <b>{r.error ? '書き方にまちがいがあります' : 'テストに失敗しました'}</b>
        <div>{r.error ?? r.failure}</div>
      </div>
    );
  return (
    <div className="card soft stack tight">
      <b className="small">✓ テストに合格（{SIZES.length * 4}回のテストで正しい答え）</b>
      <table className="small">
        <tbody>
          {r.sizes.map((x) => (
            <tr key={x.n}>
              <th>データ {fmt(x.n)}件</th>
              <td className="right num">基本操作 約{fmt(x.ops, x.ops < 10 ? 1 : 0)}回</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="small">
        データが{SIZES[1] / SIZES[0]}倍になると、回数は約<b>{fmt(r.ratio, 1)}倍</b>。→ <T id="big-o">計算量</T> <b>{COMPLEXITY_TEXT[r.complexity!]}</b>
      </div>
      <div className="cx-scale" aria-label="計算量のくらべ">
        {ORDER.map((cx) => {
          const e = opsCount(cx, SIZES[1]) / opsCount(cx, SIZES[0]);
          return (
            <div key={cx} className={`cx ${cx === r.complexity ? 'on' : ''}`}>
              <div className="cx-name">{COMPLEXITY_TEXT[cx]}</div>
              <div className="cx-bar">
                <i style={{ width: `${Math.max(3, (Math.log(e) / Math.log(256)) * 100)}%` }} />
              </div>
              <div className="cx-v num">約{fmt(e, e < 10 ? 1 : 0)}倍</div>
              {cx === r.complexity && <span className="tiny">← あなたのプログラム</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
