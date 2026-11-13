// ブロックで作るプログラム：実行・テスト・計算量の判定・既存方式との対応を確かめる
import { chosenOption } from './calc';
import { CASES } from './cases';
import { newGame, reduce } from './game';
import { parseCode, runProgram, starterBlocks, toCode, type Block } from './program';

const proc = (caseId: string, id: string) => CASES.find((c) => c.id === caseId)!.processes.find((p) => p.id === id)!;

const find = (caseId: string, id: string) => proc(caseId, id);
const linear: Block[] = [{ kind: 'each', body: [{ kind: 'ifKey', body: [{ kind: 'keep' }, { kind: 'stop' }] }] }];

describe('ブロックのプログラム', () => {
  it('すべての処理に目的があり、「今のやり方」の見本がテストに合格する', () => {
    for (const c of CASES)
      for (const p of c.processes) {
        if (p.options.some((o) => o.recipe)) expect(p.program).toBeDefined();
        if (!p.program) continue;
        const r = runProgram(p, starterBlocks(p.program.goal));
        expect(r.ok, `${c.id}/${p.id}: ${r.error ?? r.failure}`).toBe(true);
      }
  });

  it('実行した回数から計算量を判定する', () => {
    const p = find('midori-library', 'search');
    expect(runProgram(p, linear).complexity).toBe('n');
    expect(runProgram(p, [{ kind: 'index' }]).complexity).toBe('logn');
    expect(runProgram(p, [{ kind: 'hash' }]).complexity).toBe('1');
    // 並べ替えてから2分探索：正しいが、毎回並べ替えるので O(n log n)
    expect(runProgram(p, [{ kind: 'sort', algo: 'merge', key: 'key' }, { kind: 'binary' }]).complexity).toBe('nlogn');
    expect(runProgram(p, [{ kind: 'sort', algo: 'bubble', key: 'key' }, { kind: 'binary' }]).complexity).toBe('n2');
  });

  it('答えがまちがっているとテストに失敗する', () => {
    const p = find('midori-library', 'search');
    expect(runProgram(p, [{ kind: 'binary' }]).ok).toBe(false); // 並んでいないデータで2分探索
    expect(runProgram(p, [{ kind: 'each', body: [{ kind: 'keep' }] }]).ok).toBe(false); // 条件なし
    expect(runProgram(p, [{ kind: 'keep' }]).error).toBeDefined(); // くり返しの外
    const q = find('midori-library', 'queue');
    expect(runProgram(q, [{ kind: 'first' }, { kind: 'queue' }]).error).toBeDefined(); // キューは最初
    expect(runProgram(q, [{ kind: 'sort', algo: 'merge', key: 'key' }, { kind: 'first' }]).ok).toBe(false); // 番号順では順番にならない
  });

  it('既存の方式と一致すれば、その方式として扱う', () => {
    expect(runProgram(find('midori-library', 'search'), linear).optionId).toBe('lsearch-linear');
    expect(runProgram(find('midori-library', 'search'), [{ kind: 'index' }]).optionId).toBe('lsearch-index');
    expect(runProgram(find('midori-library', 'queue'), [{ kind: 'queue' }, { kind: 'first' }]).optionId).toBe('queue-fifo');
    expect(runProgram(find('midori-library', 'queue'), [{ kind: 'sort', algo: 'merge', key: 'time' }, { kind: 'first' }]).optionId).toBe('queue-sort');
    expect(runProgram(find('harukaze', 'ship'), [{ kind: 'sort', algo: 'merge', key: 'shelf' }]).optionId).toBe('ship-location');
    expect(runProgram(find('harukaze', 'stock'), [{ kind: 'hash' }, { kind: 'stockMinus' }]).optionId).toBe('stock-hash');
    // 一番早い人を1回の走査で探す：O(n) の自作の方式
    const r = runProgram(find('midori-library', 'queue'), starterBlocks('next'));
    expect(r.ok && r.complexity === 'n' && !r.optionId).toBe(true);
  });

  it('コードとブロックを行き来できる', () => {
    const blocks: Block[] = [{ kind: 'queue' }, { kind: 'sort', algo: 'merge', key: 'shelf' }, ...linear, { kind: 'first' }];
    const back = parseCode(toCode(blocks));
    expect('blocks' in back && back.blocks).toEqual(blocks);
    expect('error' in parseCode('全件を見る {\n覚える')).toBe(true);
    expect('error' in parseCode('とぶ')).toBe(true);
  });

  it('設計に使うと、測った計算量で性能が計算される', () => {
    let s = reduce({ ...newGame(1), reputation: 99 }, { type: 'startCase', caseId: 'midori-library' });
    s = reduce(s, { type: 'finishInvestigation' });
    s = reduce(s, { type: 'setContract', contract: 'ukeoi' });
    s = reduce(s, { type: 'confirmRequirements' });
    expect(s.project!.phase).toBe('design');
    const c = CASES.find((x) => x.id === 'midori-library')!;
    s = reduce(s, { type: 'setProgram', proc: 'queue', blocks: starterBlocks('next') });
    expect(s.project!.design.processes.queue).toBe('custom');
    expect(chosenOption(c, s.project!.design, 'queue').complexity).toBe('n');
    s = reduce(s, { type: 'setProgram', proc: 'queue', blocks: [{ kind: 'queue' }, { kind: 'first' }] });
    expect(s.project!.design.processes.queue).toBe('queue-fifo');
    // 失敗したプログラムは設計を変えない
    s = reduce(s, { type: 'setProgram', proc: 'queue', blocks: [{ kind: 'binary' }] });
    expect(s.project!.design.processes.queue).toBe('queue-fifo');
    expect(s.project!.design.programs!.queue.result.ok).toBe(false);
  });
});
