// 案件の一覧。新しい案件ファイルを作ったら、ここに足してください。
import type { CaseDef } from '../types';
import { clinic } from './clinic';
import { ecommerce } from './ecommerce';
import { library } from './library';

export const CASES: CaseDef[] = [library, ecommerce, clinic];

export const caseById = (id: string): CaseDef => {
  const c = CASES.find((x) => x.id === id);
  if (!c) throw new Error(`案件が見つかりません: ${id}`);
  return c;
};
