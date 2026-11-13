// データの整合性チェック（参照している用語・機能・対策が存在するか）
import { MEASURES, THREATS } from './catalog';
import { CASES } from './cases';
import { TERMS, termById } from './glossary';

const refs: string[] = [];
const addTerms = (ids?: string[]) => ids?.forEach((id) => refs.push(id));
for (const m of MEASURES) refs.push(m.term);
for (const t of THREATS) refs.push(t.term);
for (const c of CASES) {
  c.stakeholders.forEach((x) => addTerms(x.terms));
  c.problems.forEach((x) => addTerms(x.terms));
  c.features.forEach((x) => addTerms(x.terms));
  c.processes.forEach((p) => p.options.forEach((o) => addTerms(o.terms)));
  c.opsRequests.forEach((x) => addTerms(x.terms));
}

describe('データの整合性', () => {
  it('参照している用語はすべて用語集にある', () => {
    expect(refs.filter((id) => !termById(id))).toEqual([]);
  });
  it('用語IDは重複しない', () => {
    expect(new Set(TERMS.map((t) => t.id)).size).toBe(TERMS.length);
  });
  for (const c of CASES) {
    it(`${c.client}：問題の解決条件が存在する機能・選択肢・対策を指している`, () => {
      const opts = c.processes.flatMap((p) => p.options.map((o) => o.id));
      for (const pr of c.problems)
        for (const cond of pr.solvedBy) {
          if ('feature' in cond) expect(c.features.map((f) => f.id)).toContain(cond.feature);
          if ('option' in cond) expect(opts).toContain(cond.option);
          if ('measures' in cond) for (const m of cond.measures) expect(MEASURES.map((x) => x.id)).toContain(m);
        }
      for (const inv of c.stakeholders) for (const id of inv.reveals.problems ?? []) expect(c.problems.map((p) => p.id)).toContain(id);
      for (const inv of c.stakeholders) for (const f of inv.reveals.facts ?? []) expect(Object.keys(c.facts)).toContain(f);
      for (const a of c.dataModel.attributes) for (const t of a.answer) expect(c.dataModel.tables.map((x) => x.id)).toContain(t);
    });
  }
});
