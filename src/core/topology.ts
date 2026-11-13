// ============================================================
// システム構成図のデータ
// 今の設計と運用の結果から、構成図に描く「機器（ノード）」と「つながり（エッジ）」を作る。
// 描画は UI（Diagram.tsx）が行い、ここでは位置・状態・説明だけを決める。
// ============================================================
import { DB_TIERS, MEASURES, NETWORKS, WEB_TIERS } from './catalog';
import { backupMetrics, batchTime, dataAt, evaluateLoad, systemAvailability } from './calc';
import { caseById } from './cases';
import type { CaseDef, GameState, Incident, Project } from './types';

export type NodeType = 'users' | 'internet' | 'cdn' | 'guard' | 'lb' | 'web' | 'db' | 'replica' | 'batch' | 'staff' | 'backup' | 'offsite';

/** 状態：ok=正常（緑） busy=負荷が高い（黄） down=障害（赤） attack=セキュリティ（紫） off=未接続・なし（灰） */
export type NodeState = 'ok' | 'busy' | 'down' | 'attack' | 'off';

export interface TopoNode {
  id: string;
  type: NodeType;
  label: string;
  sub: string; // アイコンの下の小さい説明
  x: number;
  y: number;
  state: NodeState;
  util?: number; // 使用率（0〜1以上）
  count?: number;
  stateText?: string; // 状態を言葉で（色だけに頼らない）
  incident?: Incident;
}

export interface TopoEdge {
  id: string;
  from: string;
  to: string;
  kind: 'data' | 'internal' | 'sync' | 'backup';
  load: number; // 0〜1（流れる量の目安）
  state: NodeState;
  label?: string;
}

export interface Topology {
  nodes: TopoNode[];
  edges: TopoEdge[];
  zone: { label: string; x: number; y: number; w: number; h: number } | null;
  live: boolean; // 運用中の実データかどうか
  caption: string;
}

export const GUARD_MEASURES = ['fw', 'waf', 'ddosprot'];

const stateOf = (util: number | undefined): NodeState => (util === undefined ? 'ok' : util >= 0.97 ? 'down' : util >= 0.7 ? 'busy' : 'ok');
export const utilText = (util: number | undefined) =>
  util === undefined ? '負荷は未調査' : util >= 0.97 ? '処理しきれない' : util >= 0.85 ? 'かなり混雑' : util >= 0.7 ? '混雑ぎみ' : util >= 0.4 ? '順調' : '余裕あり';

/** 設計中・開発中に、平常時の負荷を見積もる（調査で数値が分かっている場合だけ） */
function estimate(c: CaseDef, p: Project) {
  const knowBase = !c.traffic.peakFact || p.facts.includes('traffic-base');
  const knowData = c.data.every((x) => !x.fact || p.facts.includes(x.fact));
  if (!knowBase || !knowData) return null;
  const data = dataAt(c, c.deadlineWeeks);
  return evaluateLoad(c, p.design, data, c.traffic.base, p.design.infra.webCount);
}

export function buildTopology(s: GameState): Topology {
  const p = s.project;
  if (!p) return { nodes: [], edges: [], zone: null, live: false, caption: 'まだシステムはありません。左の依頼から仕事を選びましょう。' };
  const c = caseById(p.caseId);
  const d = p.design;
  const i = d.infra;
  const last = p.ops?.history[p.ops.history.length - 1];
  const live = !!last;
  const before = p.phase === 'investigate' || p.phase === 'requirements';

  let webU: number | undefined;
  let dbU: number | undefined;
  let netU: number | undefined;
  let servers = i.webCount;
  if (last) {
    webU = last.rho;
    dbU = last.dbRho;
    netU = last.netRho;
    servers = Math.max(1, last.servers);
  } else if (!before) {
    const e = estimate(c, p);
    if (e) {
      webU = e.rho;
      dbU = e.dbRho;
      netU = e.netRho;
    }
  }
  const inc = (node: string) => last?.incidents?.find((x) => x.node === node);
  const applyInc = (n: TopoNode) => {
    const x = inc(n.id) ?? (n.id === 'guard' ? inc('edge') : undefined);
    if (!x) return n;
    n.incident = x;
    if (x.kind === 'failure') (n.state = 'down'), (n.stateText = '障害');
    else if (x.kind === 'attack') (n.state = 'attack'), (n.stateText = '攻撃を受けた');
    else if (x.kind === 'overload') (n.state = 'down'), (n.stateText = '処理しきれない');
    else if (x.kind === 'degraded') (n.state = 'busy'), (n.stateText = '一部故障・継続中');
    else if (x.kind === 'warning' && n.state === 'ok') (n.state = 'busy'), (n.stateText = '要確認');
    return n;
  };

  const nodes: TopoNode[] = [];
  const edges: TopoEdge[] = [];
  const add = (n: TopoNode) => nodes.push(applyInc(n));
  const link = (from: string, to: string, kind: TopoEdge['kind'], load: number, label?: string) => {
    const a = nodes.find((n) => n.id === from);
    const b = nodes.find((n) => n.id === to);
    const st: NodeState = [a, b].some((n) => n?.state === 'down') ? 'down' : load >= 0.7 ? 'busy' : kind === 'backup' || kind === 'sync' ? 'ok' : 'ok';
    edges.push({ id: `${from}-${to}`, from, to, kind, load: Math.min(1.2, load), state: st, label });
  };

  const mid = 270;
  add({ id: 'users', type: 'users', label: '利用者', sub: 'PC・スマホ', x: 70, y: mid, state: 'ok', stateText: '利用中' });
  add({ id: 'internet', type: 'internet', label: 'インターネット回線', sub: NETWORKS[i.network].name, x: 200, y: mid, state: stateOf(netU), util: netU, stateText: utilText(netU) });
  if (i.cdn) add({ id: 'cdn', type: 'cdn', label: 'CDN', sub: '画像などを配信', x: 200, y: 110, state: 'ok', stateText: '配信中' });
  const guards = d.measures.filter((m) => GUARD_MEASURES.includes(m));
  add({
    id: 'guard',
    type: 'guard',
    label: '入口の防御',
    sub: guards.length ? guards.map((g) => MEASURES.find((m) => m.id === g)!.name.replace('サービス', '')).join('・') : '対策なし',
    x: 330,
    y: mid,
    state: guards.length ? 'attack' : 'off',
    stateText: guards.length ? '防御中' : '防御なし',
  });
  // 紫は「セキュリティ」の色。防御している入口は紫で表示する（攻撃を受けたときは applyInc で上書き）
  if (i.lb) add({ id: 'lb', type: 'lb', label: 'ロードバランサ', sub: '振り分け', x: 450, y: mid, state: 'ok', stateText: '振り分け中' });
  const wt = WEB_TIERS[i.webTier];
  add({ id: 'web', type: 'web', label: 'Webサーバー', sub: `${wt.name}`, x: 585, y: mid, state: stateOf(webU), util: webU, count: servers, stateText: utilText(webU) });
  const dbt = DB_TIERS[i.dbTier];
  add({ id: 'db', type: 'db', label: 'データベース', sub: dbt.name, x: 745, y: 220, state: stateOf(dbU), util: dbU, stateText: utilText(dbU) });
  if (i.dbReplica) add({ id: 'replica', type: 'replica', label: '予備DB（レプリカ）', sub: '常に同じ内容', x: 745, y: 360, state: 'ok', stateText: '待機中' });
  const hasBatch = c.processes.some((pr) => pr.options.find((o) => o.id === d.processes[pr.id])?.mode === 'batch');
  if (hasBatch) {
    const data = p.ops?.data && Object.keys(p.ops.data).length ? p.ops.data : dataAt(c, c.deadlineWeeks);
    const bt = last ? last.batchTime : batchTime(c, d, data);
    const u = bt / c.batchWindow;
    add({ id: 'batch', type: 'batch', label: '夜間バッチ', sub: '1日1回まとめて処理', x: 745, y: 90, state: before ? 'ok' : stateOf(u), util: before ? undefined : u, stateText: before ? '' : u >= 1 ? '朝までに終わらない' : u >= 0.7 ? 'ぎりぎり' : '間に合う' });
  }
  add({ id: 'staff', type: 'staff', label: `${c.client}の社員`, sub: '業務端末', x: 905, y: 90, state: 'ok', stateText: '業務中' });
  const bk = backupMetrics(d.backup, p.ops?.dataGB ?? c.dataGB);
  add({
    id: 'backup',
    type: 'backup',
    label: 'バックアップ',
    sub: d.backup.type === 'none' ? 'なし' : `RPO ${bk.rpoHours}時間`,
    x: 905,
    y: 290,
    state: d.backup.type === 'none' ? 'off' : bk.feasible ? 'ok' : 'busy',
    stateText: d.backup.type === 'none' ? '未設定' : bk.feasible ? '保管中' : '時間内に終わらない',
  });
  if (d.backup.type !== 'none' && d.backup.offsite) add({ id: 'offsite', type: 'offsite', label: '遠隔地の保管庫', sub: '災害・ランサムウェア対策', x: 905, y: 420, state: 'ok', stateText: '保管中' });

  const flow = webU ?? 0.3;
  link('users', 'internet', 'data', netU ?? 0.3);
  if (i.cdn) link('internet', 'cdn', 'data', 0.3, '画像');
  link('internet', 'guard', 'data', netU ?? 0.3);
  if (i.lb) {
    link('guard', 'lb', 'data', flow);
    link('lb', 'web', 'data', flow);
  } else link('guard', 'web', 'data', flow);
  link('web', 'db', 'data', dbU ?? 0.2, 'SQL');
  if (i.dbReplica) link('db', 'replica', 'sync', 0.2, '複製');
  if (hasBatch) link('batch', 'db', 'internal', 0.2);
  link('staff', 'db', 'internal', 0.2, '業務データ');
  if (d.backup.type !== 'none') link('db', 'backup', 'backup', 0.15, '保存');
  if (d.backup.type !== 'none' && d.backup.offsite) link('backup', 'offsite', 'backup', 0.1, '遠隔地へ');

  const zoneX = i.lb ? 400 : 520;
  const zone = before
    ? null
    : { label: i.hosting === 'cloud' ? 'クラウド（借りている環境）' : 'サーバー室（自社で管理）', x: zoneX, y: 40, w: 990 - zoneX - 15, h: 460 };

  const caption = before
    ? '依頼主の今のシステム（調査中）。設計フェーズで新しい構成を決めます。'
    : live
      ? `運用 ${last!.week} 週目の状態。理論稼働率 ${(systemAvailability(i) * 100).toFixed(2)}%`
      : p.phase === 'design'
        ? '設計中の構成（平常時の見積もり）'
        : '開発中の構成';
  return { nodes, edges, zone, live, caption };
}

/** ノードの説明（かんたん表示用の一文） */
export const NODE_ROLE: Record<NodeType, { role: string; term?: string }> = {
  users: { role: 'サービスを使うお客様や利用者。スマホやパソコンからアクセスしてくる。' },
  internet: { role: '利用者とサーバーをつなぐ回線。帯域幅（1秒に送れるデータ量）が足りないと混雑する。', term: 'bandwidth' },
  cdn: { role: '画像などを利用者の近くから配信して、回線とサーバーの負担を減らす。', term: 'cdn' },
  guard: { role: '外からの攻撃を入口で止める仕組み（ファイアウォール・WAF・DDoS対策）。', term: 'firewall' },
  lb: { role: '複数のWebサーバーにアクセスを振り分ける。故障したサーバーには送らない。', term: 'load-balancer' },
  web: { role: 'リクエストを受けて処理し、画面を返すコンピュータ。CPUのコア数が多いほど同時に処理できる。', term: 'scale-out' },
  db: { role: '注文や会員などのデータを表の形で保存し、検索・更新する。', term: 'database' },
  replica: { role: 'データベースの予備。いつも同じ内容をコピーしていて、故障したらすぐ切り替わる。', term: 'replication' },
  batch: { role: '夜の間にデータをまとめて処理するプログラム。朝までに終わらないと業務が遅れる。', term: 'batch' },
  staff: { role: '依頼主の社員が業務で使う端末。システムのデータを見たり入力したりする。' },
  backup: { role: 'データのコピーを保存しておく場所。故障・誤操作・ウイルスのときに元に戻せる。', term: 'backup' },
  offsite: { role: '別の場所に置いたバックアップ。災害やランサムウェアで本体ごとやられても守れる。', term: 'offsite' },
};
