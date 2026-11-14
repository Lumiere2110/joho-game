// アルゴリズム道場：どの問題も解けること、まちがった解き方は不合格になること、動きの記録（トレース）
import { DRILLS, drillById, drillProc, judgeDrill } from './drills';
import { TERMS } from './glossary';
import { traceProgram, type Block } from './program';

const linear: Block[] = [{ kind: 'each', body: [{ kind: 'ifKey', body: [{ kind: 'keep' }, { kind: 'stop' }] }] }];
const slowLinear: Block[] = [{ kind: 'each', body: [{ kind: 'ifKey', body: [{ kind: 'keep' }] }] }];

/** 各問題の模範解答 */
const ANSWERS: Record<string, Block[]> = {
  'd-linear': linear,
  'd-early': linear,
  'd-count': [{ kind: 'each', body: [{ kind: 'ifLow', body: [{ kind: 'countUp' }] }] }],
  'd-min': [{ kind: 'each', body: [{ kind: 'ifOldest', body: [{ kind: 'keep' }] }] }],
  'd-sort': [{ kind: 'sort', algo: 'merge', key: 'key' }],
  'd-binary': [{ kind: 'binary' }],
  'd-sortsearch': [{ kind: 'sort', algo: 'merge', key: 'key' }, { kind: 'binary' }],
  'd-queue': [{ kind: 'queue' }, { kind: 'first' }],
  'd-hash': [{ kind: 'hash' }, { kind: 'stockMinus' }],
};

const judge = (id: string, b: Block[]) => judgeDrill(drillById(id)!, b);

describe('アルゴリズム道場', () => {
  it('すべての問題に模範解答があり、合格する。最初のプログラムは不合格', () => {
    for (const d of DRILLS) {
      const a = ANSWERS[d.id];
      expect(a, d.id).toBeDefined();
      const j = judgeDrill(d, a);
      expect(j.pass, `${d.id}: ${JSON.stringify(j.checks)} ${j.result.error ?? j.result.failure ?? ''}`).toBe(true);
      if (d.starter) expect(judgeDrill(d, d.starter).pass, d.id).toBe(false);
      for (const t of d.terms) expect(TERMS.some((x) => x.id === t), `${d.id}: ${t}`).toBe(true);
    }
  });

  it('条件を満たさない解き方は不合格', () => {
    expect(judge('d-early', slowLinear).pass).toBe(false); // 最後まで調べると回数が多すぎる
    expect(judge('d-early', [{ kind: 'hash' }]).pass).toBe(false); // 使えないブロック
    expect(judge('d-sort', [{ kind: 'sort', algo: 'bubble', key: 'key' }]).pass).toBe(false); // O(n²)
    expect(judge('d-binary', linear).pass).toBe(false); // O(n) は遅すぎる
    expect(judge('d-binary', ANSWERS['d-sortsearch']).pass).toBe(false); // 毎回並べ替えると O(n log n)
    expect(judge('d-sortsearch', [{ kind: 'binary' }]).pass).toBe(false); // 並んでいないと見つからない
    expect(judge('d-count', [{ kind: 'each', body: [{ kind: 'countUp' }] }]).pass).toBe(false); // 全部数えてしまう
    expect(judge('d-min', [{ kind: 'sort', algo: 'merge', key: 'time' }, { kind: 'first' }]).pass).toBe(false); // 並べ替えは禁止
  });

  it('1手ずつの動きを記録する', () => {
    const d = drillById('d-binary')!;
    const t = traceProgram(drillProc(d), [{ kind: 'binary' }]);
    expect(t.failure).toBeUndefined();
    expect(t.steps.length).toBeGreaterThan(2);
    expect(t.steps.some((x) => x.range)).toBe(true);
    const last = t.steps[t.steps.length - 1];
    expect(last.found).toBeDefined();
    expect(last.items[last.found!].key).toBe(t.target);
    // 並べ替えの途中の並びも記録する（マージソート）
    const s = traceProgram(drillProc(drillById('d-sort')!), [{ kind: 'sort', algo: 'merge', key: 'key' }]);
    const end = s.steps[s.steps.length - 1].items.map((x) => x.key);
    expect(end).toEqual([...end].sort((a, b) => a - b));
    expect(s.steps.some((x) => x.note.includes('マージ'))).toBe(true);
    // まちがっていれば最後に知らせる
    const bad = traceProgram(drillProc(drillById('d-sortsearch')!), [{ kind: 'binary' }]);
    expect(bad.failure).toBeDefined();
  });
});
