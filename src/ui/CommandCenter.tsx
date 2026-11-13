// 司令室（メイン画面）
// 左：対応が必要なこと ／ 中央：システム構成図 ／ 右：詳細と操作 ／ 下：状態
import { useEffect, useMemo, type ReactNode } from 'react';
import { BACKUP_TYPES, DB_TIERS, LB, NETWORKS, WEB_TIERS, CDN } from '../core/catalog';
import { backupMetrics, batchTime, dataAt, fmt, fmtTime, peakLambda, singlePoints } from '../core/calc';
import { caseById } from '../core/cases';
import { buildIssues, infraAction, infraCandidates, measureCandidates, batchActions, type Issue, type IssueAction } from '../core/issues';
import { computeStatus, type StatusItem } from '../core/status';
import { buildTopology, GUARD_MEASURES, NODE_ROLE, type TopoNode } from '../core/topology';
import type { CaseDef, GameState, Project } from '../core/types';
import { Meter, T, TermNote, shortTerm, useGame } from './common';
import { Diagram } from './Diagram';
import { Glyph, KindGlyph, NodeGlyph, PartGlyph, StateMark } from './Icons';

export const TONE_WORD: Record<Issue['tone'], string> = { bad: '緊急', security: 'セキュリティ', warn: '要確認', info: 'お知らせ', good: '順調' };
const KIND_WORD: Record<Issue['kind'], string> = { case: '依頼', task: 'やること', alert: '警告', request: '要望', news: 'ニュース' };

export function CommandCenter() {
  const { s, sel, setSel } = useGame();
  const issues = useMemo(() => buildIssues(s), [s]);
  const topo = useMemo(() => buildTopology(s), [s]);
  const issue = sel?.kind === 'issue' ? issues.find((i) => i.id === sel.id) : undefined;
  const node = sel?.kind === 'node' ? topo.nodes.find((n) => n.id === sel.id) : undefined;
  // 選んでいた項目が解決して消えたら、選択を外す
  const gone = !!sel && !issue && !node;
  useEffect(() => {
    if (gone) setSel(null);
  }, [gone, setSel]);
  return (
    <div className="cc">
      <section className="panel cc-left" aria-label="対応が必要なこと">
        <IssueList issues={issues} />
      </section>
      <section className="panel cc-center" aria-label="システム構成図">
        <Diagram topo={topo} related={issue?.related} onSelect={(id) => setSel(sel?.kind === 'node' && sel.id === id ? null : { kind: 'node', id })} />
      </section>
      <section className="panel cc-right" aria-label="詳細と操作">
        {issue ? <IssueDetail issue={issue} /> : node ? <NodeDetail n={node} /> : <Overview issues={issues} />}
      </section>
      <section className="cc-status" aria-label="状態">
        <StatusBar />
      </section>
    </div>
  );
}

// ------------------------------------------------------------
// 左：対応が必要なこと
// ------------------------------------------------------------
export function IssueList({ issues }: { issues: Issue[] }) {
  const { s, sel, setSel } = useGame();
  return (
    <div className="issues">
      <div className="panel-head">
        <h3>対応が必要なこと</h3>
        <span className="badge">{issues.length}件</span>
      </div>
      {issues.length === 0 && <div className="muted small pad">いまは特に問題はありません。</div>}
      <ul className="issue-list">
        {issues.map((i) => {
          const on = sel?.kind === 'issue' && sel.id === i.id;
          return (
            <li key={i.id}>
              <button className={`issue t-${i.tone} ${on ? 'on' : ''}`} onClick={() => setSel(on ? null : { kind: 'issue', id: i.id })} aria-pressed={on}>
                <span className="issue-icon">
                  <KindGlyph kind={i.kind} />
                </span>
                <span className="issue-body">
                  <span className="issue-meta">
                    <span className={`tone t-${i.tone}`}>{TONE_WORD[i.tone]}</span>
                    <span>{KIND_WORD[i.kind]}</span>
                    <span>・{i.dept}</span>
                  </span>
                  <span className="issue-title">{i.title}</span>
                  {i.deadline && <span className="issue-sub">期限：{i.deadline}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <details className="log-box">
        <summary>できごとの記録</summary>
        <ul className="log">
          {s.log.slice(0, 50).map((l, i) => (
            <li key={i}>
              <span className="w">{l.week}週</span>
              <span className={l.kind}>{l.text}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

// ------------------------------------------------------------
// 右：選んだ項目の詳細と、対応の候補
// ------------------------------------------------------------
function Field({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="field">
      <div className="k">{k}</div>
      <div className="v">{children}</div>
    </div>
  );
}

export function IssueDetail({ issue }: { issue: Issue }) {
  const { setSel, mode } = useGame();
  const acts = mode === 'easy' ? [...issue.actions].sort((a, b) => (b.recommended ? 1 : 0) - (a.recommended ? 1 : 0)) : issue.actions;
  return (
    <div className="detail stack">
      <div className="panel-head">
        <span className={`tone t-${issue.tone}`}>{TONE_WORD[issue.tone]}</span>
        <button className="btn ghost small" onClick={() => setSel(null)} aria-label="閉じる">
          ✕
        </button>
      </div>
      <h3 className="detail-title">{issue.title}</h3>
      <Field k="何が起きているか">{issue.what}</Field>
      <Field k="影響を受ける人・業務">{issue.affected}</Field>
      {issue.deadline && <Field k="対応期限">{issue.deadline}</Field>}
      {issue.ifIgnored && <Field k="放っておくと">{issue.ifIgnored}</Field>}
      <Field k="関係する部門">{issue.dept}</Field>
      {issue.related.length > 0 && <div className="tiny muted">構成図で、関係する機器を光らせています。</div>}
      {issue.causes && issue.causes.length > 0 && (
        <Field k="考えられる原因・解決の方向">
          <ul className="plain">
            {issue.causes.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </Field>
      )}
      {issue.steps && issue.steps.length > 0 && (
        <Field k="何が起きて、どう復旧したか">
          <ol className="steps">
            {issue.steps.map((st, i) => (
              <li key={i}>{st}</li>
            ))}
          </ol>
        </Field>
      )}
      {acts.length > 0 && (
        <div className="stack tight">
          <b className="small">対応の候補</b>
          {acts.map((a, i) => (
            <ActionCard key={i} a={a} />
          ))}
        </div>
      )}
      {issue.terms && issue.terms.length > 0 && (
        <div className="stack tight">
          <b className="small">ことば</b>
          {issue.terms.map((t) => (
            <TermNote key={t} id={t} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ActionCard({ a }: { a: IssueAction }) {
  const { dispatch, setScreen, mode } = useGame();
  const run = () => {
    if (a.action) dispatch(a.action);
    if (a.screen) setScreen(a.screen);
  };
  const can = !a.disabled && (a.action || a.screen);
  return (
    <div className={`action ${a.recommended ? 'rec' : ''}`}>
      <div className="action-head">
        <b>{a.label}</b>
        {a.recommended && <span className="badge accent">おすすめ</span>}
      </div>
      {a.desc && <div className="small">{a.desc}</div>}
      {a.recommended && <div className="small rec-why">理由：{a.recommended}</div>}
      <div className="action-facts">
        {a.cost && <span>費用：{a.cost}</span>}
        {a.time && <span>時間：{a.time}</span>}
        {a.effect && (mode === 'detail' || a.recommended || !a.cost) && <span>効果：{a.effect}</span>}
        {a.risk && <span className="risk">注意：{a.risk}</span>}
      </div>
      <div className="row">
        <button className={`btn small ${a.recommended ? 'primary' : ''}`} disabled={!can} onClick={run}>
          {a.action ? 'この対応をする' : a.screen ? '画面を開く' : '—'}
        </button>
        {a.disabled && <span className="tiny muted">{a.disabled}</span>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// 右：機器の詳細（全体 → 機器の詳細 → 仕組みの解説 の順に深く見られる）
// ------------------------------------------------------------
function lambdaNow(c: CaseDef, p: Project) {
  const last = p.ops?.history[p.ops.history.length - 1];
  if (last) return last.lambda;
  const known = !c.traffic.peakFact || p.facts.includes(c.traffic.peakFact);
  return known ? peakLambda(c) : c.traffic.base;
}

const TIER_MEMORY = { S: 8, M: 32, L: 128 } as const; // 機器の仕様としてのメモリ容量（GB）

export function NodeDetail({ n }: { n: TopoNode }) {
  const { s, setSel, mode, setScreen } = useGame();
  const p = s.project!;
  const c = caseById(p.caseId);
  const i = p.design.infra;
  const role = NODE_ROLE[n.type];
  const lam = lambdaNow(c, p);
  const sp = singlePoints(i);
  const cloud = i.hosting === 'cloud';

  let spec: ReactNode = null;
  let failure = '';
  let options: IssueAction[] = [];
  const cands = () => infraCandidates(s, c, p, lam);
  switch (n.type) {
    case 'web': {
      const t = WEB_TIERS[i.webTier];
      spec = (
        <Parts
          rows={[
            { g: 'cpu', k: 'CPU', v: `${t.cores}コア × ${n.count ?? i.webCount}台`, u: n.util },
            { g: 'memory', k: 'メモリ', v: `${TIER_MEMORY[i.webTier]}GB（1台あたり）` },
          ]}
          cost={cloud ? `毎週 ${fmt(t.cloudWeekly * i.webCount)}万円（クラウド利用料）` : `購入 ${fmt(t.onpremCost)}万円/台・保守 毎週 ${fmt(t.onpremWeekly * i.webCount, 1)}万円`}
        />
      );
      failure = i.webCount === 1 && !i.autoscale ? '1台しかないので、壊れるとサービス全体が止まります（単一障害点）。' : '1台が壊れても、残りのサーバーで動き続けます（冗長化）。';
      options = cands().filter((a) => a.label.includes('Web') || a.label.includes('オートスケール'));
      break;
    }
    case 'db':
    case 'replica': {
      const t = DB_TIERS[i.dbTier];
      const gb = p.ops?.dataGB ?? c.dataGB;
      spec = (
        <Parts
          rows={[
            { g: 'cpu', k: 'CPU', v: `${t.cores}コア`, u: n.type === 'db' ? n.util : undefined },
            { g: 'memory', k: 'メモリ', v: `${TIER_MEMORY[i.dbTier]}GB` },
            { g: 'drive', k: '記憶装置（SSD）', v: `データ ${fmt(gb, 1)}GB` },
          ]}
          cost={cloud ? `毎週 ${fmt(t.cloudWeekly * (i.dbReplica ? 2 : 1))}万円` : `購入 ${fmt(t.onpremCost)}万円/台・保守 毎週 ${fmt(t.onpremWeekly * (i.dbReplica ? 2 : 1), 1)}万円`}
        />
      );
      failure = i.dbReplica ? '本体が壊れても、予備のDBに切り替えて動き続けます（フェイルオーバー）。' : 'DBが1台だけなので、壊れると全部の機能が止まります（単一障害点）。';
      options = cands().filter((a) => a.label.includes('DB'));
      if (!i.dbReplica) {
        const ia = infraAction(p, { dbReplica: true });
        options.push({ label: '予備のDB（レプリカ）を置く', desc: '故障しても止まらないようにする', time: ia.time, action: ia.action, disabled: ia.disabled, cost: cloud ? `毎週 +${t.cloudWeekly}万円` : `購入 +${t.onpremCost}万円`, recommended: '単一障害点をなくせる' });
      }
      break;
    }
    case 'internet': {
      const nw = NETWORKS[i.network];
      spec = <Parts rows={[{ g: 'net', k: '帯域幅', v: nw.name, u: n.util }]} cost={`毎週 ${nw.weekly}万円`} />;
      failure = '回線が混むと、全員の画面の表示が遅くなります。';
      options = cands().filter((a) => a.label.includes('回線') || a.label.includes('CDN'));
      break;
    }
    case 'cdn':
      spec = <Parts rows={[]} cost={`毎週 ${CDN.weekly}万円`} />;
      failure = 'CDN が止まっても、サーバーから直接配信できます（遅くはなります）。';
      break;
    case 'lb':
      spec = <Parts rows={[]} cost={cloud ? `毎週 ${LB.cloudWeekly}万円` : `購入 ${LB.onpremCost}万円・保守 毎週 ${LB.onpremWeekly}万円`} />;
      failure = sp.some((x) => x.includes('ロードバランサ')) ? 'ロードバランサは1台なので、壊れると振り分けが止まります。' : '';
      break;
    case 'guard': {
      const on = p.design.measures.filter((m) => GUARD_MEASURES.includes(m));
      failure = on.length ? '入口で防げなかった攻撃は、サーバーやデータに届きます。' : '入口で何も防いでいないので、攻撃がそのままサーバーに届きます。';
      options = measureCandidates(c, p, (id) => GUARD_MEASURES.includes(id), 3);
      break;
    }
    case 'batch': {
      const data = p.ops?.data && Object.keys(p.ops.data).length ? p.ops.data : dataAt(c, c.deadlineWeeks);
      const bt = batchTime(c, p.design, data);
      spec = <Parts rows={[{ g: 'cpu', k: '処理時間', v: `${fmtTime(bt)}（使える時間 ${fmtTime(c.batchWindow)}）`, u: bt / c.batchWindow }]} />;
      failure = '朝までに終わらないと、その日の業務が遅れます。データが増えるほど時間がのびます。';
      options = p.phase === 'design' ? [{ label: '処理の方式（アルゴリズム）を見直す', desc: '計算量の小さい方式にすると、データが増えても速い', screen: 'dev' }] : batchActions(c, p);
      break;
    }
    case 'staff':
      failure = 'システムが止まると、社員の業務も止まります。';
      options = [{ label: '業務の流れを見る', desc: 'どこに時間がかかっているか、改善でどう変わるか', screen: 'business' }];
      break;
    case 'backup':
    case 'offsite': {
      const b = p.design.backup;
      const gb = p.ops?.dataGB ?? c.dataGB;
      const m = backupMetrics(b, gb);
      spec =
        b.type === 'none' ? null : (
          <Parts
            rows={[
              { g: 'drive', k: '方式', v: `${BACKUP_TYPES[b.type].name}（${b.interval === 'daily' ? '毎日' : b.interval === 'hourly' ? '毎時' : '毎週'}・${b.generations}世代）` },
              { g: 'drive', k: '保存容量', v: `${fmt(m.storageGB)}GB` },
            ]}
            cost={`毎週 ${fmt(m.weeklyCost, 1)}万円`}
          />
        );
      failure = b.type === 'none' ? 'バックアップがないので、誤って消したデータやウイルスに暗号化されたデータは戻せません。' : `最大 ${m.rpoHours}時間分のデータを失い、復旧に約${fmt(m.rtoHours, 1)}時間かかります（RPO/RTO）。`;
      if (p.phase === 'design' || p.phase === 'operate') {
        options = (['full', 'diff', 'incr'] as const)
          .filter((t) => t !== b.type)
          .map((t) => {
            const mm = backupMetrics({ ...b, type: t, interval: b.type === 'none' ? 'daily' : b.interval }, gb);
            return { label: `${BACKUP_TYPES[t].name}にする`, desc: t === 'full' ? '毎回全部コピー。復元が一番速い' : t === 'diff' ? '前のフルからの変更分。復元はフル＋1つ' : '前回からの変更分だけ。容量最小・復元は遅い', effect: `RTO 約${fmt(mm.rtoHours, 1)}時間・容量 ${fmt(mm.storageGB)}GB`, cost: `毎週 ${fmt(mm.weeklyCost, 1)}万円`, action: { type: 'setBackup', patch: { type: t, interval: b.type === 'none' ? 'daily' : b.interval } } } as IssueAction;
          });
        if (b.type !== 'none' && !b.offsite) options.push({ label: '遠隔地にも保管する', desc: '災害やランサムウェアでも守れる', cost: '保管費 1.5倍', action: { type: 'setBackup', patch: { offsite: true } }, recommended: '本体と同じ場所だけだと、まとめて失うおそれがある' });
      }
      break;
    }
    default:
      break;
  }

  return (
    <div className="detail stack">
      <div className="panel-head">
        <span className="small muted">機器の詳細</span>
        <button className="btn ghost small" onClick={() => setSel(null)} aria-label="閉じる">
          ✕
        </button>
      </div>
      <div className="node-head">
        <span className={`node-big st-${n.state}`}>
          <Glyph size={46}>
            <NodeGlyph type={n.type} />
          </Glyph>
        </span>
        <div>
          <h3 className="detail-title">{n.label}</h3>
          <div className="small muted">{n.sub}</div>
          <div className="row small" style={{ gap: 6 }}>
            <svg width={16} height={16} viewBox="-10 -10 20 20" aria-hidden>
              <StateMark state={n.state} />
            </svg>
            {n.stateText}
          </div>
        </div>
      </div>
      <Field k="役割">{role.role}</Field>
      {n.util !== undefined && (
        <Field k="使用率">
          <Meter value={Math.min(100, n.util * 100)} tone={n.util >= 0.85 ? 'bad' : n.util >= 0.7 ? 'warn' : 'good'} />
          <div className="small">{mode === 'detail' ? `${fmt(n.util * 100, 1)}%（${fmt(lam)}件/秒のとき）` : n.stateText}</div>
        </Field>
      )}
      {spec}
      {failure && <Field k="壊れたときの影響">{failure}</Field>}
      {n.incident && (
        <Field k="直近のできごと">
          <b>{n.incident.title}</b>
          <ol className="steps">
            {n.incident.steps.map((x, k) => (
              <li key={k}>{x}</li>
            ))}
          </ol>
        </Field>
      )}
      {options.length > 0 && (
        <div className="stack tight">
          <b className="small">強化・設定の候補</b>
          {options.map((a, k) => (
            <ActionCard key={k} a={a} />
          ))}
        </div>
      )}
      {(n.type === 'web' || n.type === 'db' || n.type === 'internet') && p.phase !== 'operate' && p.phase !== 'design' && (
        <button className="btn small" onClick={() => setScreen('system')}>
          システム画面で構成を見る
        </button>
      )}
      <details className="mech">
        <summary>しくみの解説を見る</summary>
        <Mechanism n={n} />
        {role.term && (
          <div className="small" style={{ marginTop: 8 }}>
            <T id={role.term} />：{shortTerm(role.term)}
          </div>
        )}
      </details>
      {mode === 'detail' && <CompareTable />}
    </div>
  );
}

function Parts({ rows, cost }: { rows: { g: 'cpu' | 'memory' | 'drive' | 'net'; k: string; v: string; u?: number }[]; cost?: string }) {
  return (
    <div className="parts">
      {rows.map((r, i) => (
        <div key={i} className="part">
          <Glyph size={26}>
            <PartGlyph type={r.g} />
          </Glyph>
          <div>
            <div className="tiny muted">{r.k}</div>
            <div className="small">{r.v}</div>
            {r.u !== undefined && <Meter value={Math.min(100, r.u * 100)} tone={r.u >= 0.85 ? 'bad' : r.u >= 0.7 ? 'warn' : 'good'} />}
          </div>
        </div>
      ))}
      {cost && (
        <div className="small">
          <span className="muted">費用：</span>
          {cost}
        </div>
      )}
    </div>
  );
}

/** 詳細表示：機器ごとの比較 */
function CompareTable() {
  const { s, setSel } = useGame();
  const topo = buildTopology(s);
  const rows = topo.nodes.filter((n) => n.util !== undefined);
  if (!rows.length) return null;
  return (
    <div>
      <b className="small">機器ごとの比較（使用率）</b>
      <table className="small">
        <tbody>
          {rows.map((n) => (
            <tr key={n.id} onClick={() => setSel({ kind: 'node', id: n.id })} style={{ cursor: 'pointer' }}>
              <td>{n.label}</td>
              <td className="right num">{fmt(n.util! * 100, 1)}%</td>
              <td>{n.stateText}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** しくみの解説（小さな図） */
function Mechanism({ n }: { n: TopoNode }) {
  const { s } = useGame();
  const p = s.project!;
  if (n.type === 'web' || n.type === 'db') {
    // 待ち行列：使用率 ρ が上がると応答時間は 1/(1−ρ) 倍にのびる
    const W = 260;
    const H = 120;
    const pts: string[] = [];
    for (let k = 0; k <= 48; k++) {
      const r = (k / 50) * 0.98;
      const f = Math.min(10, 1 / (1 - r));
      pts.push(`${20 + r * (W - 30)},${H - 18 - (f / 10) * (H - 30)}`);
    }
    const u = Math.min(0.97, n.util ?? 0);
    const fx = 20 + u * (W - 30);
    const fy = H - 18 - (Math.min(10, 1 / (1 - u)) / 10) * (H - 30);
    return (
      <div className="stack tight">
        <p className="small">
          処理を待つ行列（<T id="queueing">待ち行列</T>）ができます。使用率が上がるほど、待ち時間は<b>急に</b>長くなります。応答時間 ＝ 処理時間 ÷（1 − 使用率）。
        </p>
        <svg viewBox={`0 0 ${W} ${H}`} className="mini">
          <line x1={20} y1={H - 18} x2={W - 8} y2={H - 18} className="axis" />
          <line x1={20} y1={8} x2={20} y2={H - 18} className="axis" />
          <polyline points={pts.join(' ')} className="curve" />
          {n.util !== undefined && <circle cx={fx} cy={fy} r={5} className="now" />}
          <text x={W - 8} y={H - 4} textAnchor="end" className="mini-t">
            使用率 →
          </text>
          <text x={24} y={16} className="mini-t">
            待ち時間
          </text>
          <text x={20 + 0.7 * (W - 30)} y={H - 4} textAnchor="middle" className="mini-t">
            70%
          </text>
        </svg>
        {n.util !== undefined && <div className="tiny muted">● が今の位置です。70%をこえたあたりから急に遅くなります。</div>}
      </div>
    );
  }
  if (n.type === 'lb') {
    const k = Math.min(4, p.design.infra.webCount);
    return (
      <div className="stack tight">
        <p className="small">届いたリクエストを、空いているサーバーに順番に振り分けます。故障したサーバーには送りません。</p>
        <svg viewBox="0 0 260 100" className="mini">
          <rect x={10} y={40} width={50} height={20} rx={4} className="box" />
          <text x={35} y={54} textAnchor="middle" className="mini-t">LB</text>
          {Array.from({ length: k }, (_, j) => {
            const y = 10 + (j * 80) / Math.max(1, k - 1 || 1);
            return (
              <g key={j}>
                <path d={`M60 50 C120 50 120 ${y + 8} 190 ${y + 8}`} className="flow" />
                <rect x={190} y={y} width={60} height={16} rx={3} className="box" />
                <text x={220} y={y + 12} textAnchor="middle" className="mini-t">Web {j + 1}</text>
              </g>
            );
          })}
        </svg>
      </div>
    );
  }
  if (n.type === 'backup' || n.type === 'offsite') {
    const t = p.design.backup.type;
    const row = (label: string, blocks: string[], y: number, on: boolean, restore: number[]) => (
      <g key={label} opacity={on ? 1 : 0.45}>
        <text x={0} y={y + 12} className="mini-t">{label}</text>
        {blocks.map((b, j) => (
          <g key={j}>
            <rect x={50 + j * 42} y={y} width={36} height={16} rx={3} className={restore.includes(j) ? 'box hot' : 'box'} />
            <text x={68 + j * 42} y={y + 12} textAnchor="middle" className="mini-t">{b}</text>
          </g>
        ))}
      </g>
    );
    return (
      <div className="stack tight">
        <p className="small">月〜木にとったバックアップから、木曜の状態に戻すときに必要なもの（明るい箱）：</p>
        <svg viewBox="0 0 230 80" className="mini">
          {row('フル', ['全部', '全部', '全部', '全部'], 2, t === 'full', [3])}
          {row('差分', ['全部', '差1', '差2', '差3'], 28, t === 'diff', [0, 3])}
          {row('増分', ['全部', '増1', '増2', '増3'], 54, t === 'incr', [0, 1, 2, 3])}
        </svg>
        <div className="tiny muted">フルは容量が大きいが復元が速い。増分は容量が小さいが、全部つなぐので復元が遅い。</div>
      </div>
    );
  }
  const text: Partial<Record<TopoNode['type'], string>> = {
    internet: '回線の使用率 ＝ 1秒あたりの件数 × 1件のデータ量 × 8（ビット）÷ 帯域幅。CDN で画像を配ると、回線を通るデータが減ります。',
    cdn: `画像などの重いデータの約${CDN.byteOffload * 100}%を、利用者の近くのサーバーから配ります。本体のサーバーと回線の負担が減ります。`,
    guard: 'ファイアウォールは決められた通り道以外の通信を止め、WAF は Web への攻撃の形（SQLインジェクションなど）を見つけて止めます。DDoS 対策は大量の通信を手前で吸収します。',
    replica: '本体のDBへの書き込みを、いつも予備にもコピーしています（レプリケーション）。本体が壊れたら予備に切り替えます（フェイルオーバー）。',
    batch: '1日分のデータを夜にまとめて処理します。処理の回数はデータ量と計算量（O記法）で決まり、データが増えるほど時間がのびます。',
    users: 'アクセスは時間や曜日、セールなどのイベントで大きく変わります。一番多いとき（ピーク）に耐えられるように設計します。',
    staff: '社員が手作業でしていることをシステムに任せると、作業時間とミスが減ります。',
  };
  return <p className="small">{text[n.type] ?? ''}</p>;
}

// ------------------------------------------------------------
// 右：何も選んでいないとき（全体の状況のまとめ）
// ------------------------------------------------------------
function Overview({ issues }: { issues: Issue[] }) {
  const { s, setSel, mode } = useGame();
  const st = computeStatus(s);
  const p = s.project;
  const bad = issues.filter((i) => i.tone === 'bad' || i.tone === 'security');
  const top = issues.filter((i) => i.kind !== 'case').slice(0, 3);
  return (
    <div className="detail stack">
      <div className="panel-head">
        <h3>いまの状況</h3>
      </div>
      {!p ? (
        <p className="small">案件がありません。左の「依頼」を選ぶと、内容と予算が見られます。受けた依頼のシステムが、中央の構成図に表示されます。</p>
      ) : (
        <>
          <div className="small">
            <b>{caseById(p.caseId).client}</b>：{caseById(p.caseId).title}
          </div>
          <div className={bad.length ? 'badbox' : 'goodbox'}>
            {bad.length ? `急いで対応が必要なことが ${bad.length} 件あります。` : '急ぎの問題はありません。'}
          </div>
          <ul className="plain small">
            {st
              .filter((x) => x.tone !== 'none')
              .map((x) => (
                <li key={x.id}>
                  <b>{x.label}</b>：{mode === 'easy' ? x.word : x.display}
                  {x.tone === 'bad' ? '（要対応）' : x.tone === 'warn' ? '（注意）' : ''}
                </li>
              ))}
          </ul>
          {top.length > 0 && (
            <div className="stack tight">
              <b className="small">まず見てほしいこと</b>
              {top.map((i) => (
                <button key={i.id} className="option small" onClick={() => setSel({ kind: 'issue', id: i.id })}>
                  <span className={`tone t-${i.tone}`}>{TONE_WORD[i.tone]}</span> {i.title}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      <div className="hint">左の項目を選ぶと、構成図で関係する場所が光り、ここに対応の候補が出ます。構成図の機器を選ぶと、性能・費用・壊れたときの影響が見られます。</div>
    </div>
  );
}

// ------------------------------------------------------------
// 下：状態（項目ごとに数値と簡単なグラフィック）
// ------------------------------------------------------------
export function StatusBar() {
  const { s, mode, openTerm } = useGame();
  const items = computeStatus(s);
  return (
    <div className="statusbar">
      {items.map((x) => (
        <StatusTile key={x.id} x={x} easy={mode === 'easy'} onTerm={openTerm} />
      ))}
    </div>
  );
}

function StatusTile({ x, easy, onTerm }: { x: StatusItem; easy: boolean; onTerm: (id: string) => void }) {
  const toneWord = x.tone === 'good' ? '良好' : x.tone === 'warn' ? '注意' : x.tone === 'bad' ? '要対応' : '';
  return (
    <div className={`stile t-${x.tone}`} title={x.detail}>
      <div className="stile-head">
        <span className="k">{x.label}</span>
        {x.term && (
          <button className="q" onClick={() => onTerm(x.term!)} aria-label={`${x.label}の説明`}>
            ?
          </button>
        )}
      </div>
      <div className="stile-main">
        <Ring value={x.value} tone={x.tone} />
        <div>
          <div className="v">{easy ? x.word : x.display}</div>
          <div className="s">
            {easy ? x.display : x.word}
            {toneWord && <span className={`tone t-${x.tone === 'bad' ? 'bad' : x.tone === 'warn' ? 'warn' : 'good'}`}>{toneWord}</span>}
          </div>
        </div>
      </div>
      {x.delta && (
        <div className={`delta ${x.deltaGood ? 'up' : 'down'}`}>
          {x.deltaGood ? '▲ 良くなった' : '▼ 悪くなった'} {x.delta}
        </div>
      )}
    </div>
  );
}

function Ring({ value, tone }: { value: number | null; tone: StatusItem['tone'] }) {
  const r = 15;
  const L = 2 * Math.PI * r;
  const v = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <svg width={40} height={40} viewBox="0 0 40 40" className={`ring-g t-${tone}`} aria-hidden>
      <circle cx={20} cy={20} r={r} className="ring-bg" />
      {value !== null && <circle cx={20} cy={20} r={r} className="ring-fg" strokeDasharray={`${(v / 100) * L} ${L}`} transform="rotate(-90 20 20)" />}
    </svg>
  );
}

export type { GameState };
