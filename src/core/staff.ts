// メンバー（社員）の初期データと、採用候補の作り方
import type { Rng } from './rng';
import type { Member, SkillKey } from './types';
import { SKILL_KEYS } from './types';

const sk = (plan: number, dev: number, infra: number, sec: number, ops: number): Record<SkillKey, number> => ({
  plan,
  dev,
  infra,
  sec,
  ops,
});

const zero = () => sk(0, 0, 0, 0, 0);

export function initialStaff(): Member[] {
  return [
    { id: 'm1', name: '青木 ハルト', title: 'プロジェクトマネージャー', skills: sk(4, 2, 1, 1, 2), exp: zero(), salary: 14, fatigue: 0 },
    { id: 'm2', name: '森 ユイ', title: 'アプリエンジニア', skills: sk(1, 4, 2, 2, 1), exp: zero(), salary: 13, fatigue: 0 },
    { id: 'm3', name: '石川 ソウタ', title: 'インフラエンジニア', skills: sk(1, 2, 4, 2, 3), exp: zero(), salary: 13, fatigue: 0 },
    { id: 'm4', name: '白井 ミオ', title: '新人エンジニア', skills: sk(2, 2, 1, 2, 2), exp: zero(), salary: 8, fatigue: 0 },
  ];
}

const FAMILY = ['佐々木', '高橋', '中村', '小林', '加藤', '吉田', '山口', '松本', '井上', '木村', '林', '清水', '山崎', '池田', '橋本', '阿部', '藤田', '岡田', '後藤', '長谷川'];
const GIVEN = ['リク', 'アオイ', 'カイト', 'ヒナ', 'レン', 'サクラ', 'ユウマ', 'ミナト', 'ツムギ', 'ハル', 'ナギ', 'コハル', 'イツキ', 'メイ', 'ソラ', 'アカリ'];

const TITLES: Record<SkillKey, string> = {
  plan: 'プロジェクトマネージャー',
  dev: 'アプリエンジニア',
  infra: 'インフラエンジニア',
  sec: 'セキュリティエンジニア',
  ops: '運用エンジニア',
};

/** 採用候補をランダムに作る。得意分野が1つあり、強いほど給料が高い */
export function makeCandidate(rng: Rng, id: string): Member {
  const main = rng.pick(SKILL_KEYS);
  const skills = zero();
  for (const k of SKILL_KEYS) skills[k] = rng.int(1, 2);
  skills[main] = rng.int(3, 5);
  const sub = rng.pick(SKILL_KEYS.filter((k) => k !== main));
  skills[sub] = Math.max(skills[sub], rng.int(2, 3));
  const total = SKILL_KEYS.reduce((a, k) => a + skills[k], 0);
  return {
    id,
    name: `${rng.pick(FAMILY)} ${rng.pick(GIVEN)}`,
    title: TITLES[main],
    skills,
    exp: zero(),
    salary: Math.round(total * 1.15 + skills[main] * 0.8),
    fatigue: 0,
  };
}

/** 1週間で進む作業量（人週）。スキル3でおよそ1人週 */
export function workRate(m: Member, skill: SkillKey, overtime: boolean): number {
  const lvl = m.skills[skill];
  let r = 0.3 + lvl * 0.25;
  if (overtime) r *= 1.3;
  if (m.fatigue >= 70) r *= 0.6;
  else if (m.fatigue >= 50) r *= 0.85;
  return r;
}

/** 経験値がたまったらスキルアップ。上がったら true */
export function gainExp(m: Member, skill: SkillKey, amount: number): boolean {
  m.exp[skill] += amount;
  const need = m.skills[skill] * 3;
  if (m.skills[skill] < 5 && m.exp[skill] >= need) {
    m.exp[skill] -= need;
    m.skills[skill] += 1;
    return true;
  }
  return false;
}
