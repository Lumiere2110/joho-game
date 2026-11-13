// ============================================================
// 1週間ごとのシミュレーション（開発・運用）
// ============================================================
import { AUTOSCALE_MAX, MEASURES, RELIABILITY, THREATS, WEB_TIERS, requiredLegal } from './catalog';
import { backupMetrics, batchTime, dataAt, dataModelScore, evaluateLoad, fmtTime, weeklyRunningCost } from './calc';
import { DEV_KINDS, taskDone } from './project';
import type { Rng } from './rng';
import { gainExp, workRate } from './staff';
import type { CaseDef, GameState, Incident, OpsWeekResult, Project, Task, ThreatId } from './types';

type Ev = OpsWeekResult['events'][number];

export function log(s: GameState, text: string, kind: 'info' | 'good' | 'bad' = 'info') {
  s.log.unshift({ week: s.week, text, kind });
  if (s.log.length > 200) s.log.length = 200;
}

export const salaryTotal = (s: GameState) => s.staff.reduce((a, m) => a + m.salary, 0);

/** 1週間進める（人件費の支払いなど、どのフェーズでも共通の処理） */
export function passWeek(s: GameState) {
  s.week += 1;
  const pay = salaryTotal(s);
  s.money -= pay;
  if (s.project) s.project.spent += pay;
  if (s.money < -500) {
    s.gameOver = true;
    log(s, '資金が尽きてしまいました…（資金 −500万円を下回った）', 'bad');
  }
}

function bugRate(lvl: number, overtime: boolean, fatigue: number) {
  return (1.2 - lvl * 0.2) * (overtime ? 1.3 : 1) * (fatigue >= 70 ? 1.4 : 1);
}

/** メンバーの仕事を1週間ぶん進める。タスクごとの作業量を返す */
function doWork(s: GameState, p: Project, rng: Rng, opts: { bugs: boolean }): Map<string, number> {
  const work = new Map<string, number>();
  for (const m of s.staff) {
    const a = p.assignments[m.id];
    if (m.fatigue >= 80 && rng.chance(0.4)) {
      m.fatigue = Math.max(0, m.fatigue - 35);
      log(s, `${m.name} が疲れから体調を崩し、今週は休みました。`, 'bad');
      continue;
    }
    const t = p.tasks.find((x) => x.id === a);
    if (!a || a === 'rest' || !t || taskDone(t)) {
      m.fatigue = Math.max(0, m.fatigue - (a === 'rest' ? 30 : 12));
      continue;
    }
    const rate = workRate(m, t.skill, p.overtime);
    work.set(t.id, (work.get(t.id) ?? 0) + rate);
    if (opts.bugs && DEV_KINDS.has(t.kind)) p.bugs += rate * bugRate(m.skills[t.skill], p.overtime, m.fatigue);
    m.fatigue = Math.min(100, m.fatigue + (p.overtime ? 16 : 4));
    if (gainExp(m, t.skill, rate)) log(s, `${m.name} の${skillName(t.skill)}スキルが ${m.skills[t.skill]} に上がった！`, 'good');
  }
  return work;
}

const skillName = (k: Task['skill']) => ({ plan: '企画・調整', dev: '開発', infra: 'インフラ', sec: 'セキュリティ', ops: '運用' })[k];

// ------------------------------------------------------------
// 開発
// ------------------------------------------------------------
export function devWeek(s: GameState, c: CaseDef, rng: Rng) {
  const p = s.project!;
  p.devWeeks += 1;
  const work = doWork(s, p, rng, { bugs: true });
  for (const t of p.tasks) {
    const w = work.get(t.id);
    if (!w || t.kind === 'test') continue;
    const before = taskDone(t);
    t.progress = Math.min(t.effort, t.progress + w);
    if (!before && taskDone(t)) log(s, `「${t.name}」が完了しました。`, 'good');
  }
  // テストはバグを見つけて直す。作業した割合に応じてバグが減る
  const test = p.tasks.find((t) => t.kind === 'test');
  const tw = test ? work.get(test.id) ?? 0 : 0;
  if (test && tw > 0) {
    const ratio = Math.min(1, tw / test.effort);
    const found = p.bugs * Math.min(0.95, ratio);
    p.bugs -= found;
    test.progress = Math.min(test.effort, test.progress + tw);
    log(s, `テストで約 ${Math.round(found)} 件のバグを見つけて直しました（残り約 ${Math.round(p.bugs)} 件）。`, 'info');
  }

  // 準委任：作業した週の分だけ報酬を受け取る
  if (p.contract === 'junin') {
    const pay = Math.min(salaryLimit(p), salaryTotal(s) * 1.25);
    s.money += pay;
    p.received += pay;
  }

  // 仕様変更の依頼
  if (!p.changeOffered && p.devWeeks >= 2 && (rng.chance(0.45) || p.devWeeks >= 4)) {
    p.changeOffered = true;
    p.pendingEvent = { kind: 'change', title: `仕様変更の依頼：${c.changeRequest.name}`, text: c.changeRequest.text };
  }
  passWeek(s);
}

// 準委任の報酬は予算の1.2倍まで
const salaryLimit = (p: Project) => Math.max(0, p.budget * 1.2 - p.received);

// ------------------------------------------------------------
// 運用
// ------------------------------------------------------------
export function opsWeek(s: GameState, c: CaseDef, rng: Rng) {
  const p = s.project!;
  const ops = p.ops!;
  const w = ops.week + 1;
  const d = p.design;
  const ev: Ev[] = [];
  const say = (text: string, kind: Ev['kind'] = 'info') => ev.push({ text, kind });
  // 構成図に表示するための、障害・攻撃の記録
  const incidents: Incident[] = [];
  let curThreat: ThreatId | undefined; // いま処理している脅威（攻撃・事故のときだけ）
  const hit = (node: string, kind: Incident['kind'], title: string, steps: string[] = []) => incidents.push({ node, kind, title, steps, ...(curThreat ? { threat: curThreat } : {}) });
  let sat = 0;

  // 予約していた構成変更を反映
  if (ops.pendingInfra && ops.pendingInfra.applyWeek <= w) {
    d.infra = ops.pendingInfra.infra;
    ops.pendingInfra = null;
    say('申し込んでいた構成変更が完了しました。', 'good');
  }

  // データとアクセスの量
  const weeksSinceStart = s.week - p.startWeek;
  const event = c.traffic.events.find((e) => e.week === w);
  const mult = event?.multiplier ?? 1;
  if (event) say(`イベント：${event.name}（アクセス約${mult}倍）`, 'info');
  const data = dataAt(c, weeksSinceStart);
  for (const item of c.data) if (item.scalesWithTraffic) data[item.key] = Math.round(data[item.key] * mult);
  ops.data = data;
  ops.dataGB = c.dataGB * Math.pow(1.01, weeksSinceStart);
  const lambda = c.traffic.base * Math.pow(1 + c.traffic.growthPerWeek, w) * mult * rng.range(0.9, 1.1);

  // メンバーの仕事
  const work = doWork(s, p, rng, { bugs: false });
  let monitorPower = 0;
  for (const m of s.staff) {
    const t = p.tasks.find((x) => x.id === p.assignments[m.id]);
    if (t?.kind === 'monitor') monitorPower += m.skills.ops;
  }
  const fixWork = work.get('t-bugfix') ?? 0;
  if (fixWork > 0 && p.bugs > 0) {
    const fixed = Math.min(p.bugs, fixWork * 1.5);
    p.bugs -= fixed;
    say(`バグ修正：${fixed.toFixed(1)} 件直しました（残り約 ${Math.round(p.bugs)} 件）。`, 'good');
    if (p.contract === 'junin') {
      // 準委任では、修正作業も契約の範囲で支払われる
      const pay = fixWork * 12;
      s.money += pay;
      p.received += pay;
    }
  }
  for (const t of p.tasks) {
    if (t.kind !== 'request') continue;
    const wk = work.get(t.id);
    if (!wk || taskDone(t)) continue;
    t.progress = Math.min(t.effort, t.progress + wk);
    if (taskDone(t)) {
      const r = c.opsRequests.find((x) => x.id === t.refId)!;
      ops.doneRequests.push(r.id);
      sat += r.satisfaction;
      say(`改善「${r.name}」をリリースしました！ 満足度 +${r.satisfaction}`, 'good');
    }
  }
  // 監視している人が多く、運用スキルが高いほど、障害からの復旧が早い（MTTR が短い）
  const mttr = monitorPower > 0 ? 2 + 10 / (1 + monitorPower * 0.6) : 24;

  // サーバー台数（オートスケール）
  const tier = WEB_TIERS[d.infra.webTier];
  let servers = d.infra.webCount;
  if (d.infra.hosting === 'cloud' && d.infra.autoscale && d.infra.lb) {
    const probe = evaluateLoad(c, d, data, lambda, 1);
    const need = Math.ceil((lambda * (d.infra.cdn ? 0.7 : 1) * probe.S) / (tier.cores * 0.7));
    servers = Math.max(d.infra.webCount, Math.min(AUTOSCALE_MAX, need));
    if (servers > d.infra.webCount) say(`オートスケールでWebサーバーを ${servers} 台に増やしました。`, 'info');
  }

  // 故障
  let outage = 0;
  const rel = RELIABILITY[d.infra.hosting];
  let alive = servers;
  for (let i = 0; i < servers; i++) if (rng.chance(rel.failPerWeek)) alive--;
  if (alive < servers) {
    if (alive === 0) {
      outage += mttr;
      say(`Webサーバーが故障し、サービスが ${mttr.toFixed(1)} 時間止まりました。`, 'bad');
      hit('web', 'failure', 'Webサーバーが全台停止', [
        `監視で故障に気づく（${monitorPower > 0 ? '監視あり' : '監視なし：気づくのが遅れた'}）`,
        '予備の機器がないため、修理・交換する',
        `サービス再開まで ${mttr.toFixed(1)} 時間`,
      ]);
    } else {
      say(`Webサーバー ${servers - alive} 台が故障しましたが、残りの台数で動き続けました（冗長化の効果）。`, 'good');
      hit('web', 'degraded', `Webサーバー ${servers - alive} 台が故障（ほかの台数で継続）`, ['ロードバランサが故障した台を自動で外す', '残りの台数でサービスを続ける', '故障した台を修理して戻す']);
    }
  }
  if (d.infra.lb && rng.chance(0.004)) {
    outage += mttr;
    say(`ロードバランサが故障し、${mttr.toFixed(1)} 時間止まりました（単一障害点）。`, 'bad');
    hit('lb', 'failure', 'ロードバランサが故障（単一障害点）', ['すべての通信がここを通るため、全体が止まる', `交換して復旧（${mttr.toFixed(1)} 時間）`]);
  }
  const bk = backupMetrics(d.backup, ops.dataGB);
  const restoreSteps = () => {
    const b = d.backup;
    const chain =
      b.type === 'full'
        ? '最新のフルバックアップを1つ戻す'
        : b.type === 'diff'
          ? 'フルバックアップを戻し、最新の差分を1つ重ねる'
          : 'フルバックアップを戻し、そのあとの増分を順番にすべて重ねる';
    return [`${chain}（約 ${bk.rtoHours.toFixed(1)} 時間）`, `最後のバックアップ以降のデータ（最大 ${bk.rpoHours} 時間分）は失われる`, '動作を確認してサービス再開'];
  };
  if (rng.chance(rel.failPerWeek)) {
    if (d.infra.dbReplica) {
      outage += 0.1;
      say('DBサーバーが故障しましたが、予備（レプリカ）に自動で切り替わりました（フェイルオーバー）。', 'good');
      hit('db', 'degraded', 'DBサーバーが故障（レプリカへ切り替え）', ['故障を検知', '予備（レプリカ）に自動で切り替え（フェイルオーバー）', '数分でサービス継続', '故障した機器を交換し、新しい予備にする']);
    } else if (d.backup.type === 'none') {
      outage += mttr + 48;
      sat -= 25;
      p.repPenalty += 3;
      say('DBサーバーが故障！ バックアップがなく、データの多くを失いました…', 'bad');
      hit('db', 'failure', 'DBサーバーが故障・データ消失', ['故障を検知', 'バックアップがないため、データを戻せない', '残ったデータと紙の記録から手作業で復旧（約2日）']);
    } else {
      const lost = bk.rpoHours / 2;
      outage += mttr + bk.rtoHours;
      sat -= Math.min(12, 2 + lost * 0.25);
      say(`DBサーバーが故障。バックアップから復元しました（復旧 ${(mttr + bk.rtoHours).toFixed(1)} 時間、約 ${lost.toFixed(0)} 時間分のデータを失った）。`, 'bad');
      hit('db', 'failure', 'DBサーバーが故障・バックアップから復元', [`故障を検知し、新しい機器を用意（${mttr.toFixed(1)} 時間）`, ...restoreSteps()]);
    }
  }

  // 攻撃・事故
  for (const th of THREATS) {
    curThreat = th.id;
    const weight = c.threats[th.id] ?? 0;
    if (!weight) continue;
    let prob = th.basePerWeek * weight;
    for (const m of MEASURES) if (d.measures.includes(m.id)) prob *= 1 - (m.mitigates[th.id] ?? 0);
    if (!rng.chance(prob)) continue;
    if (th.effect === 'leak') {
      if (c.personalData === 'none') {
        sat -= 4;
        say(`${th.name}を受けましたが、重要な情報はありませんでした。`, 'bad');
        continue;
      }
      let impact = 1;
      for (const m of MEASURES) if (d.measures.includes(m.id) && m.leakImpact) impact *= 1 - m.leakImpact;
      const sens = c.personalData === 'sensitive' ? 1.6 : 1;
      const dmg = 22 * th.severity * impact * sens;
      sat -= dmg;
      let rep = Math.round(5 * th.severity * impact * sens);
      if (d.measures.includes('breach')) {
        rep = Math.ceil(rep / 2);
        say(`${th.name}で情報が漏えい！ 手順どおり、すぐに本人と個人情報保護委員会へ報告しました。`, 'bad');
      } else {
        rep += 3;
        say(`${th.name}で情報が漏えい！ 報告の手順がなく対応が遅れ、批判を受けました。`, 'bad');
      }
      if (impact < 0.5) say('保存データの暗号化などで、漏れたデータの多くは読めない状態でした。', 'info');
      p.repPenalty += rep;
      hit(th.id === 'eavesdrop' ? 'internet' : 'db', 'attack', `${th.name}による情報漏えい`, [
        '不正なアクセスを検知し、通信を遮断する',
        '漏えいした範囲を調べる（ログを確認）',
        d.measures.includes('breach') ? '手順どおり、本人と個人情報保護委員会へ報告' : '報告の手順がなく、対応が遅れた',
        '原因となった弱点をふさぐ対策を入れる',
      ]);
    } else if (th.effect === 'tamper') {
      sat -= 6;
      say(`${th.name}で、サイトに不正なスクリプトが埋め込まれました。`, 'bad');
      hit('web', 'attack', `${th.name}でページが改ざん`, ['埋め込まれたスクリプトを削除', '入力・出力の処理を見直す（エスケープ処理）']);
    } else if (th.effect === 'outage') {
      const h = 12 * (d.infra.cdn ? 0.6 : 1);
      outage += h;
      say(`${th.name}を受け、${h.toFixed(0)} 時間つながりにくくなりました。`, 'bad');
      hit('edge', 'attack', `${th.name}で回線があふれた`, ['大量の通信を検知', '攻撃元からの通信を遮断・吸収する', `${h.toFixed(0)} 時間後に平常に戻る`]);
    } else if (th.effect === 'ransom') {
      const backupSafe = d.backup.type !== 'none' && (d.backup.offsite || rng.chance(0.4));
      if (backupSafe) {
        outage += bk.rtoHours + mttr;
        sat -= 10;
        say(`ランサムウェアに感染！ 無事だったバックアップから復元しました（${(bk.rtoHours + mttr).toFixed(1)} 時間停止）。`, 'bad');
        hit('db', 'attack', 'ランサムウェア感染・バックアップから復元', ['感染した機器をネットワークから切り離す', 'ウイルスを除去し、機器を初期化する', ...restoreSteps()]);
      } else {
        outage += 96;
        sat -= 30;
        p.repPenalty += 6;
        say(d.backup.type === 'none' ? 'ランサムウェアに感染！ バックアップがなく、データを取り戻せませんでした…' : 'ランサムウェアに感染！ 同じネットワークにあったバックアップまで暗号化されてしまいました…', 'bad');
        hit('db', 'attack', 'ランサムウェア感染・データを戻せない', ['感染した機器をネットワークから切り離す', d.backup.type === 'none' ? 'バックアップがない' : 'バックアップも暗号化されていた（遠隔地に置いていなかった）', '手作業でデータを作り直す（約4日）']);
      }
    } else if (th.effect === 'dataloss') {
      if (d.backup.type === 'none') {
        sat -= 18;
        p.repPenalty += 2;
        say('担当者の誤操作で大事なデータが消えました。バックアップがなく復元できません…', 'bad');
        hit('db', 'failure', '誤操作でデータ削除・復元できない', ['削除に気づく', d.infra.dbReplica ? 'レプリカにも削除がコピーされていた' : 'バックアップがない', '手作業でデータを作り直す']);
      } else {
        outage += bk.rtoHours;
        sat -= Math.min(10, 1 + bk.rpoHours * 0.2);
        const extra = d.infra.dbReplica ? '（レプリカにも削除がコピーされたので、バックアップが必要でした）' : '';
        say(`誤操作でデータが消えましたが、バックアップから復元しました${extra}。`, 'bad');
        hit('db', 'failure', '誤操作でデータ削除・バックアップから復元', ['削除に気づく', ...(d.infra.dbReplica ? ['レプリカにも削除がコピーされているので使えない'] : []), ...restoreSteps()]);
      }
    }
  }
  curThreat = undefined;

  // 残っているバグ
  let bugIncidents = 0;
  for (let i = 0; i < Math.round(p.bugs); i++) if (rng.chance(0.04)) bugIncidents++;
  if (bugIncidents) {
    sat -= bugIncidents * 1.5;
    outage += bugIncidents * 0.5;
    say(`バグによる不具合が ${bugIncidents} 件発生しました。`, 'bad');
    hit("web", "warning", `バグによる不具合 ${bugIncidents} 件`, ["不具合の報告を受ける", "原因を調べて修正する（バグ修正の担当者が必要）"]);
  }
  // データベース設計の不備による食い違い
  const dmScore = dataModelScore(c, d);
  if (rng.chance((1 - dmScore) * 0.5)) {
    sat -= 3;
    say('同じデータが複数の場所にあり、一部だけ更新されて内容が食い違いました（更新時異常）。', 'bad');
    hit("db", "warning", "データの食い違い（更新時異常）", ["食い違ったデータを手で直す", "表の設計（正規化）を見直すと根本的に防げる"]);
  }

  // 負荷
  const load = evaluateLoad(c, d, data, lambda, Math.max(1, alive));
  if (load.lostRate > 0) {
    sat -= Math.min(15, load.lostRate * 30);
    const where = load.bottleneck === 'db' ? 'データベース' : load.bottleneck === 'net' ? '回線' : 'Webサーバー';
    say(`アクセスが集中し、${where}が処理しきれず、約 ${(load.lostRate * 100).toFixed(0)}% のアクセスがエラーに。`, 'bad');
    hit(load.bottleneck === "db" ? "db" : load.bottleneck === "net" ? "internet" : "web", "overload", `${where}が混雑してエラー多発`, [`${where}の利用率が100%を超えた`, "処理しきれない分がエラーになる", "台数を増やす・性能を上げる・処理を速くする（アルゴリズム）などで改善"]);
  } else if (load.response <= c.responseTarget) sat += 1;
  else if (load.response > c.responseTarget * 2) {
    sat -= 3;
    say(`応答時間が ${fmtTime(load.response)} と遅く、不満の声が出ています。`, 'bad');
  }

  // 夜間バッチ
  const bt = batchTime(c, d, data);
  if (bt > c.batchWindow) {
    sat -= 4;
    say(`夜間バッチが ${fmtTime(bt)} かかり、朝までに終わりませんでした。`, 'bad');
    hit("batch", "overload", "夜間バッチが時間内に終わらない", ["データが増えて処理時間が伸びた", "計算量の小さいアルゴリズムに変えると速くなる"]);
  }

  // 監査（個人情報の扱い）
  if (!ops.auditDone && w >= Math.ceil(c.opsWeeks / 2)) {
    ops.auditDone = true;
    const missing = requiredLegal(c.personalData, d.infra.hosting).filter((id) => !d.measures.includes(id));
    if (missing.length) {
      sat -= missing.length * 4;
      p.repPenalty += missing.length * 2;
      say(`個人情報の取扱いを点検したところ、${missing.map((id) => MEASURES.find((m) => m.id === id)!.name).join('、')} が不十分と指摘されました。`, 'bad');
    } else if (c.personalData !== 'none') say('個人情報の取扱いの点検で、問題はありませんでした。', 'good');
  }

  // 要望
  const pendingReq = ops.arrivedRequests.filter((id) => !ops.acceptedRequests.includes(id)).length;
  sat -= pendingReq * 0.5;
  for (const r of c.opsRequests) {
    if (r.week === w) {
      ops.arrivedRequests.push(r.id);
      say(`要望が届きました：「${r.name}」（${r.from}）`, 'info');
    }
  }

  outage = Math.min(168, outage);
  if (outage > 0) sat -= Math.min(25, outage * 0.6);
  if (ev.every((e) => e.kind !== 'bad')) sat += 1.5; // 何事もない週は信頼が少し上がる

  // 費用と収入
  const extra = servers - d.infra.webCount;
  const cost = weeklyRunningCost(c, d, ops.dataGB, extra);
  s.money -= cost;
  p.spent += cost;
  // 保守費は満足度に応じて変わる（満足度が低いと値下げを求められる）
  const fee = Math.round(c.maintenanceFee * (0.5 + p.satisfaction / 200));
  s.money += fee;
  p.received += fee;

  p.satisfaction = Math.max(0, Math.min(100, p.satisfaction + sat));
  p.lowSatWeeks = p.satisfaction < 20 ? p.lowSatWeeks + 1 : 0;
  ops.week = w;
  ops.history.push({
    week: w,
    lambda,
    capacity: load.capacity,
    rho: load.rho,
    response: load.response,
    lostRate: load.lostRate,
    outageHours: outage,
    batchTime: bt,
    servers: alive,
    satisfaction: p.satisfaction,
    cost,
    revenue: fee,
    events: ev,
    dbRho: load.dbRho,
    netRho: load.netRho,
    incidents,
  });
  if (p.lowSatWeeks >= 3) {
    ev.push({ text: "満足度が低い状態が続き、依頼主から保守契約を打ち切られました…", kind: "bad" });
    p.repPenalty += 5;
  }
  for (const e of ev) log(s, `[運用${w}週目] ${e.text}`, e.kind);
  passWeek(s);
  if (w >= c.opsWeeks || p.lowSatWeeks >= 3) p.phase = "done";
}

