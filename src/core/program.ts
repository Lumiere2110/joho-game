// ============================================================
// ブロックで作るプログラム（処理・アルゴリズム）
// 「処理ブロック」と「条件」を組み合わせて処理を作り、
// 実際に小さいデータ（64件）と大きいデータ（1024件）で動かして、
//   ・答えが正しいか（テスト）
//   ・基本操作の回数がデータ量に対してどう増えるか（計算量）
// を数えて調べる。計算量は「それっぽい値」ではなく、実行した回数から判定する。
// ============================================================
import { opsCount } from './calc';
import type { Complexity, ProcessDef } from './types';

export type BlockKind = 'each' | 'ifKey' | 'ifOldest' | 'keep' | 'stop' | 'sort' | 'binary' | 'index' | 'hash' | 'queue' | 'first' | 'stockMinus';
export type SortAlgo = 'bubble' | 'merge';
export type SortKey = 'key' | 'time' | 'shelf';
export type Goal = 'find' | 'update' | 'next' | 'order';

export interface Block {
  kind: BlockKind;
  algo?: SortAlgo; // 並べ替えの方法
  key?: SortKey; // 並べ替える順番
  body?: Block[]; // くり返し・条件の中身
}

export interface BlockDef {
  kind: BlockKind;
  name: string;
  desc: string;
  group: 'control' | 'action' | 'structure';
  container?: boolean;
  term?: string;
  code: string; // 詳細画面（コード）での書き方
}

export const BLOCKS: BlockDef[] = [
  { kind: 'each', name: '全件を先頭から1件ずつ見る', desc: 'データを1件ずつ順番に取り出して、中のブロックを実行する（くり返し）。', group: 'control', container: true, term: 'linear-search', code: '全件を見る' },
  { kind: 'ifKey', name: 'もし 探している番号と同じなら', desc: '見ている1件の番号が、探している番号と同じときだけ中を実行する（条件）。', group: 'control', container: true, code: 'もし 番号が同じ' },
  { kind: 'ifOldest', name: 'もし 今までで一番早く受け付けたなら', desc: 'これまでに見た中で受付時刻が一番早いときだけ中を実行する（条件）。', group: 'control', container: true, code: 'もし 一番早い' },
  { kind: 'keep', name: 'その1件を答えとして覚える', desc: 'くり返しの中で、いま見ている1件を答えにする。', group: 'action', code: '覚える' },
  { kind: 'stop', name: 'くり返しを終える', desc: '答えが見つかったら、残りを調べずにくり返しを抜ける。', group: 'action', code: '終わる' },
  { kind: 'sort', name: '並べ替える', desc: 'データ全体を並べ替える。方法（バブルソート／マージソート）と順番を選ぶ。', group: 'action', term: 'merge-sort', code: '並べ替える' },
  { kind: 'binary', name: '2分探索：真ん中と比べて半分に絞る', desc: '番号の順に並んでいるデータを、真ん中と比べて半分ずつ絞り込む。並んでいないと正しく探せない。', group: 'action', term: 'binary-search', code: '2分探索' },
  { kind: 'index', name: '索引（インデックス）で番号を探す', desc: 'データベースの索引（B+木）をたどって、目的の1件を見つける。', group: 'structure', term: 'index', code: '索引で探す' },
  { kind: 'hash', name: 'ハッシュで場所を計算して取り出す', desc: '番号から保存場所を計算して、1回で取り出す。', group: 'structure', term: 'hash', code: 'ハッシュで探す' },
  { kind: 'queue', name: '受け付けた順に後ろへ並べておく（キュー）', desc: '受付のたびに列の最後に加えておく。先頭がいつも一番早い人になる。最初に置く。', group: 'structure', term: 'queue', code: 'キューに並べる' },
  { kind: 'first', name: '先頭の1件を答えにする', desc: '並んでいるデータの先頭を取り出す。', group: 'action', code: '先頭を取る' },
  { kind: 'stockMinus', name: '答えの在庫を1つ減らす', desc: '見つけた商品の在庫数を1減らして保存する。', group: 'action', code: '在庫を減らす' },
];
export const blockDef = (k: BlockKind) => BLOCKS.find((b) => b.kind === k)!;

export const ALGO_NAME: Record<SortAlgo, string> = { bubble: 'バブルソート', merge: 'マージソート' };
export const KEY_NAME: Record<SortKey, string> = { key: '番号順', time: '受付時刻順', shelf: '棚の場所順' };

export const GOAL_TEXT: Record<Goal, string> = {
  find: '探している番号の1件を見つけて、答えにする',
  update: '探している番号の商品を見つけて、在庫を1つ減らす',
  next: '一番早く受け付けた1件（次の順番の人）を答えにする',
  order: 'すべてのデータを、作業しやすい順番に並べ替える',
};

/** 「今のやり方」のプログラム（最初に読み込める見本） */
export function starterBlocks(goal: Goal): Block[] {
  if (goal === 'find') return [{ kind: 'each', body: [{ kind: 'ifKey', body: [{ kind: 'keep' }, { kind: 'stop' }] }] }];
  if (goal === 'update') return [{ kind: 'each', body: [{ kind: 'ifKey', body: [{ kind: 'keep' }, { kind: 'stop' }] }] }, { kind: 'stockMinus' }];
  if (goal === 'next') return [{ kind: 'each', body: [{ kind: 'ifOldest', body: [{ kind: 'keep' }] }] }];
  return [{ kind: 'sort', algo: 'bubble', key: 'time' }];
}

// ------------------------------------------------------------
// 実行（基本操作の回数を数える）
// ------------------------------------------------------------
interface Item {
  key: number; // 番号
  time: number; // 受付時刻
  shelf: number; // 棚の場所
  stock: number; // 在庫
}

interface Run {
  list: Item[];
  target: number;
  ops: number;
  result: Item | null;
  cur: Item | null;
  best: Item | null;
  inLoop: boolean;
  stopped: boolean;
  sortedBy: SortKey | null;
  error?: string;
}

class ProgramError extends Error {}

/** テスト用データを作る（シード付きの簡単な乱数。ゲームの乱数とは別） */
function makeData(n: number, seed: number): Item[] {
  let x = seed * 2654435761 + 1;
  const rnd = () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
  const shuffle = (a: number[]) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const keys = shuffle(Array.from({ length: n }, (_, i) => i + 1));
  const times = shuffle(Array.from({ length: n }, (_, i) => i + 1));
  const shelves = shuffle(Array.from({ length: n }, (_, i) => i + 1));
  return keys.map((k, i) => ({ key: k, time: times[i], shelf: shelves[i], stock: 1 + Math.floor(rnd() * 5) }));
}

function exec(blocks: Block[], r: Run, top: boolean) {
  for (let i = 0; i < blocks.length; i++) {
    if (r.stopped) return;
    const b = blocks[i];
    switch (b.kind) {
      case 'each': {
        if (r.inLoop) throw new ProgramError('「全件を見る」の中に、もう一度「全件を見る」は入れられません。');
        r.inLoop = true;
        for (const it of r.list) {
          r.cur = it;
          r.ops++;
          exec(b.body ?? [], r, false);
          if (r.stopped) break;
        }
        r.inLoop = false;
        r.stopped = false;
        r.cur = null;
        break;
      }
      case 'ifKey':
        if (!r.cur) throw new ProgramError('「もし 番号が同じなら」は「全件を見る」の中で使います。');
        r.ops++;
        if (r.cur.key === r.target) exec(b.body ?? [], r, false);
        break;
      case 'ifOldest':
        if (!r.cur) throw new ProgramError('「もし 一番早いなら」は「全件を見る」の中で使います。');
        r.ops++;
        if (!r.best || r.cur.time < r.best.time) {
          r.best = r.cur;
          exec(b.body ?? [], r, false);
        }
        break;
      case 'keep':
        if (!r.cur) throw new ProgramError('「覚える」は「全件を見る」の中で使います。');
        r.result = r.cur;
        break;
      case 'stop':
        if (!r.inLoop) throw new ProgramError('「くり返しを終える」は「全件を見る」の中で使います。');
        r.stopped = true;
        return;
      case 'sort': {
        const key = b.key ?? 'key';
        r.list = b.algo === 'bubble' ? bubble(r, key) : merge(r, r.list, key);
        r.sortedBy = key;
        break;
      }
      case 'binary': {
        // 真ん中と比べて半分に絞る。番号順に並んでいないと、見つけられないことがある
        let lo = 0;
        let hi = r.list.length - 1;
        r.result = null;
        while (lo <= hi) {
          r.ops++;
          const mid = (lo + hi) >> 1;
          const v = r.list[mid].key;
          if (v === r.target) {
            r.result = r.list[mid];
            break;
          }
          if (v < r.target) lo = mid + 1;
          else hi = mid - 1;
        }
        break;
      }
      case 'index':
        // B+木の高さ分だけたどる（約 log₂n 回）
        r.ops += Math.ceil(Math.log2(Math.max(2, r.list.length))) + 1;
        r.result = r.list.find((x) => x.key === r.target) ?? null;
        break;
      case 'hash':
        r.ops += 1;
        r.result = r.list.find((x) => x.key === r.target) ?? null;
        break;
      case 'queue':
        if (!top || i !== 0) throw new ProgramError('「キューに並べる」は、いちばん最初に置きます（受付のたびに並べておくため）。');
        // 受付のたびに最後に加えるだけなので、1件あたり1回。並べ替えの手間はかからない
        r.list = [...r.list].sort((a, z) => a.time - z.time);
        r.sortedBy = 'time';
        break;
      case 'first':
        r.ops += 1;
        r.result = r.list[0] ?? null;
        break;
      case 'stockMinus':
        if (!r.result) throw new ProgramError('「在庫を減らす」の前に、答えの商品を見つけておく必要があります。');
        r.ops += 1;
        r.result.stock -= 1;
        break;
    }
  }
}

function bubble(r: Run, key: SortKey): Item[] {
  const a = [...r.list];
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < a.length - 1 - i; j++) {
      r.ops++;
      if (a[j][key] > a[j + 1][key]) [a[j], a[j + 1]] = [a[j + 1], a[j]];
    }
  return a;
}

function merge(r: Run, a: Item[], key: SortKey): Item[] {
  if (a.length <= 1) return a;
  const m = a.length >> 1;
  const L = merge(r, a.slice(0, m), key);
  const R = merge(r, a.slice(m), key);
  const out: Item[] = [];
  let i = 0;
  let j = 0;
  while (i < L.length && j < R.length) {
    r.ops++;
    out.push(L[i][key] <= R[j][key] ? L[i++] : R[j++]);
  }
  return out.concat(L.slice(i), R.slice(j));
}

// ------------------------------------------------------------
// テストと計算量の判定
// ------------------------------------------------------------
export interface ProgramResult {
  ok: boolean;
  error?: string; // 書き方のまちがい
  failure?: string; // 答えがまちがっていたテスト
  sizes: { n: number; ops: number }[];
  ratio: number; // データが16倍になったとき、回数が何倍になったか
  complexity?: Complexity;
  optionId?: string; // 一致した既存の方式（なければ自作）
  uses: BlockKind[];
}

export const SIZES = [64, 1024];
const TRIALS = 4;

function flatten(blocks: Block[], out: Block[] = []): Block[] {
  for (const b of blocks) {
    out.push(b);
    if (b.body) flatten(b.body, out);
  }
  return out;
}

const COMPLEXITIES: Complexity[] = ['1', 'logn', 'n', 'nlogn', 'n2'];

export const COMPLEXITY_TEXT: Record<Complexity, string> = { '1': 'O(1)', logn: 'O(log n)', n: 'O(n)', nlogn: 'O(n log n)', n2: 'O(n²)' };

/** 回数の増え方から計算量を判定する（データが16倍になったとき、何倍になったか） */
export function classify(ratio: number): Complexity {
  let best: Complexity = '1';
  let diff = Infinity;
  for (const c of COMPLEXITIES) {
    const expect = opsCount(c, SIZES[1]) / opsCount(c, SIZES[0]);
    const dd = Math.abs(Math.log(Math.max(1e-9, ratio)) - Math.log(expect));
    if (dd < diff) {
      diff = dd;
      best = c;
    }
  }
  return best;
}

function check(goal: Goal, r: Run, original: Item[], target: number, keys: SortKey[]): string | null {
  if (goal === 'find') return r.result?.key === target ? null : `番号 ${target} を探したのに、${r.result ? `番号 ${r.result.key}` : '何も'}が答えになった`;
  if (goal === 'update') {
    if (r.result?.key !== target) return `番号 ${target} の商品を見つけられなかった`;
    const before = original.find((x) => x.key === target)!.stock;
    return r.result.stock === before - 1 ? null : '在庫の数が1つ減っていない';
  }
  if (goal === 'next') {
    const min = Math.min(...original.map((x) => x.time));
    return r.result?.time === min ? null : `一番早い受付（時刻 ${min}）ではなく、${r.result ? `時刻 ${r.result.time}` : '何も'}が答えになった`;
  }
  // order
  if (r.list.length !== original.length) return 'データの件数が変わってしまった';
  const okKey = keys.find((k) => r.list.every((x, i) => i === 0 || r.list[i - 1][k] <= x[k]));
  return okKey ? null : `${keys.map((k) => KEY_NAME[k]).join('か')}に並んでいない`;
}

export function runProgram(proc: ProcessDef, blocks: Block[]): ProgramResult {
  const goal = proc.program?.goal ?? 'find';
  const keys = proc.program?.keys ?? ['time'];
  const uses = [...new Set(flatten(blocks).map((b) => b.kind))];
  const sizes: { n: number; ops: number }[] = [];
  if (!blocks.length) return { ok: false, error: 'ブロックがありません。左の一覧からブロックを追加しましょう。', sizes, ratio: 0, uses };
  for (const n of SIZES) {
    let total = 0;
    for (let t = 0; t < TRIALS; t++) {
      const original = makeData(n, n * 31 + t * 7 + 1);
      const target = original[Math.floor(((t + 0.5) / TRIALS) * n)].key;
      const r: Run = { list: original.map((x) => ({ ...x })), target, ops: 0, result: null, cur: null, best: null, inLoop: false, stopped: false, sortedBy: null };
      try {
        exec(blocks, r, true);
      } catch (e) {
        if (e instanceof ProgramError) return { ok: false, error: e.message, sizes, ratio: 0, uses };
        throw e;
      }
      const fail = check(goal, r, original, target, keys);
      if (fail) return { ok: false, failure: `データ${n}件のテストで、${fail}。`, sizes, ratio: 0, uses };
      total += r.ops;
    }
    sizes.push({ n, ops: total / TRIALS });
  }
  const ratio = sizes[1].ops / Math.max(1e-9, sizes[0].ops);
  const complexity = classify(ratio);
  const all = flatten(blocks);
  const option = proc.options.find((o) => {
    const rc = o.recipe;
    if (!rc || o.complexity !== complexity) return false;
    if (!rc.uses.every((u) => uses.includes(u))) return false;
    const sorts = all.filter((b) => b.kind === 'sort');
    if (rc.algo && !sorts.some((b) => b.algo === rc.algo)) return false;
    if (rc.key && !sorts.some((b) => b.key === rc.key)) return false;
    return true;
  });
  return { ok: true, sizes, ratio, complexity, optionId: option?.id, uses };
}

export const blockCount = (blocks: Block[]) => flatten(blocks).length;

// ------------------------------------------------------------
// コード（文字）との変換：詳しい画面で使う
// ------------------------------------------------------------
const ALGO_CODE: Record<SortAlgo, string> = { bubble: 'バブル', merge: 'マージ' };
const KEY_CODE: Record<SortKey, string> = { key: '番号', time: '受付時刻', shelf: '棚' };

export function toCode(blocks: Block[], indent = 0): string {
  const pad = '  '.repeat(indent);
  return blocks
    .map((b) => {
      const d = blockDef(b.kind);
      const head = b.kind === 'sort' ? `${d.code} ${ALGO_CODE[b.algo ?? 'merge']} ${KEY_CODE[b.key ?? 'key']}` : d.code;
      if (d.container) return `${pad}${head} {\n${toCode(b.body ?? [], indent + 1)}${b.body?.length ? '\n' : ''}${pad}}`;
      return pad + head;
    })
    .join('\n');
}

/** コードを読み取ってブロックにする。まちがいがあれば何行目かを返す */
export function parseCode(src: string): { blocks: Block[] } | { error: string } {
  const root: Block[] = [];
  const stack: Block[][] = [root];
  const lines = src.split(/\r?\n/);
  for (let ln = 0; ln < lines.length; ln++) {
    let s = lines[ln].replace(/[#＃].*$/, '').trim();
    if (!s) continue;
    if (s === '}' || s === '｝') {
      if (stack.length === 1) return { error: `${ln + 1}行目：閉じる「}」が多すぎます。` };
      stack.pop();
      continue;
    }
    const open = /[{｛]$/.test(s);
    if (open) s = s.slice(0, -1).trim();
    const def = BLOCKS.find((b) => s === b.code || s.startsWith(b.code + ' ') || s.startsWith(b.code + '　'));
    if (!def) return { error: `${ln + 1}行目：「${s}」は知らない命令です。` };
    if (open !== !!def.container) return { error: def.container ? `${ln + 1}行目：「${def.code}」のあとには「{」が必要です。` : `${ln + 1}行目：「${def.code}」のあとに「{」は書けません。` };
    const b: Block = { kind: def.kind };
    if (def.kind === 'sort') {
      const rest = s.slice(def.code.length).trim().split(/\s+/);
      const algo = (Object.keys(ALGO_CODE) as SortAlgo[]).find((k) => rest.includes(ALGO_CODE[k]));
      const key = (Object.keys(KEY_CODE) as SortKey[]).find((k) => rest.includes(KEY_CODE[k]));
      if (!algo || !key) return { error: `${ln + 1}行目：「並べ替える バブル|マージ 番号|受付時刻|棚」の形で書きます。` };
      b.algo = algo;
      b.key = key;
    }
    stack[stack.length - 1].push(b);
    if (def.container) {
      b.body = [];
      stack.push(b.body);
    }
  }
  if (stack.length > 1) return { error: '閉じる「}」が足りません。' };
  return { blocks: root };
}
