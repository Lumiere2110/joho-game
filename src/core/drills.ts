// ============================================================
// アルゴリズム道場（社内勉強会の練習問題）
// 案件とは別に、ブロックのプログラムで小さな問題を解く。
// 判定は案件と同じ runProgram（実際に動かしてテストし、操作回数から計算量を判定）を使い、
// それに「計算量の上限」「操作回数の上限」「使えないブロック」などの条件を足す。
// 初めて解くと、チーム全員の「開発」の経験値が増える。
// ============================================================
import { COMPLEXITY_TEXT, SIZES, blockCount, runProgram, type Block, type BlockKind, type Goal, type ProgramResult, type SortKey } from './program';
import type { Complexity, ProcessDef } from './types';

export interface Drill {
  id: string;
  title: string;
  level: 1 | 2 | 3;
  story: string; // どんな場面の問題か
  goal: Goal;
  keys?: SortKey[];
  presorted?: boolean;
  starter?: Block[]; // 最初に入っているプログラム（直す問題のとき）
  limit: {
    complexity?: Complexity; // これより遅い計算量は不合格
    maxOps?: number; // データ1024件のときの平均の操作回数の上限
    maxBlocks?: number; // ブロックの数の上限
    banned?: BlockKind[]; // 使えないブロック
  };
  hint: string;
  explain: string; // 解いたあとの解説
  terms: string[];
  reward: number; // 開発の経験値（全員に）
}

const ORDER: Complexity[] = ['1', 'logn', 'n', 'nlogn', 'n2'];
const BIG = SIZES[SIZES.length - 1];

export const DRILLS: Drill[] = [
  {
    id: 'd-linear',
    title: '名簿から1人を探す',
    level: 1,
    story: '会員名簿（番号はばらばら）から、探している番号の会員を見つけるプログラムを作ろう。',
    goal: 'find',
    limit: {},
    hint: '「全件を見る」の中に「もし 番号が同じなら」、その中に「覚える」を入れる。くり返し（反復）と条件（選択）の組み合わせ。',
    explain: '先頭から順に1件ずつ調べる方法を線形探索という。どんなデータでも使えるが、データが16倍になると手間も約16倍（O(n)）。',
    terms: ['algorithm', 'structured', 'linear-search'],
    reward: 1,
  },
  {
    id: 'd-early',
    title: '見つけたら、そこで止める',
    level: 1,
    story: '先輩の書いた探索プログラムは正しいが、見つけたあとも最後まで調べ続けて遅い。むだを省こう。',
    goal: 'find',
    starter: [{ kind: 'each', body: [{ kind: 'ifKey', body: [{ kind: 'keep' }] }] }],
    limit: { maxOps: 1300, banned: ['index', 'hash', 'binary', 'sort'] },
    hint: '答えを覚えたあとに「くり返しを終える」を入れると、残りを調べなくて済む。',
    explain: '見つかった時点でくり返しを抜けると、平均で半分の手間になる（ただし増え方は同じ O(n)）。計算量が同じでも、定数倍の改善には意味がある。',
    terms: ['linear-search', 'trace'],
    reward: 1,
  },
  {
    id: 'd-count',
    title: '在庫が少ない商品を数える',
    level: 1,
    story: '倉庫の担当者が「在庫が2個以下の商品が何件あるか知りたい」と言っている。数えるプログラムを作ろう。',
    goal: 'count',
    limit: { complexity: 'n' },
    hint: '「全件を見る」→「もし 在庫が2個以下なら」→「数を1増やす」。数を覚えておく入れ物を変数（カウンタ）という。',
    explain: '条件に合うものを数えるときは、0から始めた変数に1ずつ足していく。全件を1回ずつ見るので O(n)。SQL なら SELECT COUNT(*) ... WHERE 在庫 <= 2 にあたる。',
    terms: ['variable', 'structured'],
    reward: 1,
  },
  {
    id: 'd-min',
    title: '一番早く来た人を探す',
    level: 1,
    story: '受付の記録から、一番早く受け付けた人を見つけたい。並べ替えを使わずに、1回の見直しで探そう。',
    goal: 'next',
    limit: { complexity: 'n', banned: ['sort', 'queue'] },
    hint: '「全件を見る」の中で「もし 今までで一番早いなら」→「覚える」。今までの一番と比べ続ける。',
    explain: '最小値（最大値）は、全件を1回見ながら「今までの一番」を更新していけば O(n) で求められる。並べ替え（O(n log n)）より速い。',
    terms: ['algorithm', 'linear-search'],
    reward: 1,
  },
  {
    id: 'd-sort',
    title: '名簿を速く並べ替える',
    level: 2,
    story: '1000件をこえる名簿を番号順に並べ替えたい。バブルソートでは遅すぎる。O(n log n) で並べ替えよう。',
    goal: 'order',
    keys: ['key'],
    starter: [{ kind: 'sort', algo: 'bubble', key: 'key' }],
    limit: { complexity: 'nlogn' },
    hint: '並べ替えブロックの方法を「マージソート」にする。「1手ずつ動きを見る」で、2つの方法の動きをくらべてみよう。',
    explain: 'バブルソートはとなり同士を比べるので O(n²)。マージソートは半分に分けて並べ、合体させるので O(n log n)。1024件なら約50万回 → 約1万回。',
    terms: ['bubble-sort', 'merge-sort', 'big-o'],
    reward: 2,
  },
  {
    id: 'd-binary',
    title: '並んだ名簿から一瞬で探す',
    level: 2,
    story: 'この名簿は最初から番号順に並んでいる。並んでいることを生かして、O(log n) で探そう（索引・ハッシュは使えない）。',
    goal: 'find',
    presorted: true,
    limit: { complexity: 'logn', banned: ['index', 'hash'] },
    hint: '並んでいれば「2分探索」が使える。毎回並べ替えると、そのぶん遅くなるので注意。',
    explain: '2分探索は真ん中と比べて範囲を半分にしていく。1024件でも約10回。ただし並んでいることが前提で、毎回並べ替えるなら O(n log n) かかってしまう。',
    terms: ['binary-search', 'big-o'],
    reward: 2,
  },
  {
    id: 'd-sortsearch',
    title: 'ばらばらの名簿で2分探索',
    level: 2,
    story: '今度の名簿は番号がばらばら。2分探索を正しく動かすには何が必要？（索引・ハッシュは使えない）',
    goal: 'find',
    starter: [{ kind: 'binary' }],
    limit: { complexity: 'nlogn', banned: ['index', 'hash'] },
    hint: 'まず「1手ずつ動きを見る」で、並んでいないと2分探索がまちがう様子を見てみよう。その前に何を置けばいい？',
    explain: '2分探索の前に番号順に並べ替えれば正しく動く。ただし並べ替えに O(n log n) かかるので、1回探すだけなら線形探索（O(n)）のほうが速い。何度も探すなら、一度並べておく（索引を作る）価値がある。',
    terms: ['binary-search', 'merge-sort'],
    reward: 2,
  },
  {
    id: 'd-queue',
    title: '次の人を O(1) で呼ぶ',
    level: 3,
    story: '窓口で「次の方どうぞ」と呼ぶたびに全員を見直していては遅い。データの持ち方を工夫して、1回で次の人を取り出そう。',
    goal: 'next',
    limit: { complexity: '1', banned: ['sort'] },
    hint: '受付のたびに列の後ろへ並べておく（キュー）と、先頭がいつも一番早い人になる。',
    explain: 'アルゴリズムだけでなく「データの持ち方（データ構造）」を変えると速くなる。キューは追加も取り出しも O(1)。',
    terms: ['queue', 'data-structure'],
    reward: 3,
  },
  {
    id: 'd-hash',
    title: '在庫を1回で減らす',
    level: 3,
    story: '注文のたびに商品を探して在庫を1つ減らす。セールで注文が殺到しても大丈夫なように、O(1) で処理しよう。',
    goal: 'update',
    limit: { complexity: '1', maxBlocks: 3 },
    hint: '番号から保存場所を計算できるデータ構造を使い、見つけた商品の在庫を減らす。',
    explain: 'ハッシュ表は番号（キー）から場所を計算するので、データが何件でも平均1回で取り出せる。そのかわり「番号の範囲で探す」「順番に並べる」は苦手。',
    terms: ['hash', 'data-structure'],
    reward: 3,
  },
];

export const drillById = (id: string) => DRILLS.find((d) => d.id === id);

/** 練習問題を runProgram で動かすための「処理」の形にする */
export function drillProc(d: Drill): ProcessDef {
  return { id: d.id, name: d.title, desc: d.story, dataKey: '', options: [], program: { goal: d.goal, keys: d.keys, target: d.story, presorted: d.presorted } };
}

export interface DrillJudge {
  result: ProgramResult;
  pass: boolean;
  checks: { label: string; ok: boolean }[]; // 合格の条件と、それぞれ満たしたか
}

/** 練習問題の条件を一覧にする（まだ動かしていなくても表示できるように） */
export function drillConditions(d: Drill): string[] {
  const out = ['テストで正しい答えを出す'];
  if (d.limit.complexity) out.push(`計算量が ${COMPLEXITY_TEXT[d.limit.complexity]} 以下`);
  if (d.limit.maxOps) out.push(`データ${BIG}件で基本操作が平均 ${d.limit.maxOps}回以下`);
  if (d.limit.maxBlocks) out.push(`ブロック ${d.limit.maxBlocks}個以内`);
  return out;
}

export function judgeDrill(d: Drill, blocks: Block[]): DrillJudge {
  const banned = (d.limit.banned ?? []).filter((k) => JSON.stringify(blocks).includes(`"kind":"${k}"`));
  const result: ProgramResult = banned.length
    ? { ok: false, error: 'この問題では使えないブロックが入っています。', sizes: [], ratio: 0, uses: [] }
    : runProgram(drillProc(d), blocks);
  const checks: { label: string; ok: boolean }[] = [{ label: 'テストで正しい答えを出す', ok: result.ok }];
  if (d.limit.complexity) checks.push({ label: `計算量が ${COMPLEXITY_TEXT[d.limit.complexity]} 以下`, ok: result.ok && ORDER.indexOf(result.complexity!) <= ORDER.indexOf(d.limit.complexity) });
  if (d.limit.maxOps) {
    const ops = result.sizes.find((x) => x.n === BIG)?.ops ?? Infinity;
    checks.push({ label: `データ${BIG}件で基本操作が平均 ${d.limit.maxOps}回以下`, ok: result.ok && ops <= d.limit.maxOps });
  }
  if (d.limit.maxBlocks) checks.push({ label: `ブロック ${d.limit.maxBlocks}個以内`, ok: blockCount(blocks) <= d.limit.maxBlocks });
  return { result, pass: checks.every((c) => c.ok), checks };
}
