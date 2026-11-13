// 切り替え画面：システム／業務／開発／運用・セキュリティ／管理
import { useMemo, useState } from 'react';
import { MEASURES, requiredLegal } from '../core/catalog';
import { fmt, singlePoints } from '../core/calc';
import { caseById } from '../core/cases';
import { deadlineWeek, taskDone } from '../core/project';
import { salaryTotal } from '../core/sim';
import { weeklyRisk } from '../core/status';
import { fmtDate } from '../core/time';
import { buildTopology } from '../core/topology';
import { PHASE_NAMES, type Phase } from '../core/types';
import { evalWorkflow } from '../core/workflow';
import { NodeDetail } from './CommandCenter';
import { Meter, Modal, T, TermNote, man, shortTerm, useGame } from './common';
import { BackupEditor, BackupTab, DataTab, DesignView, InfraMetrics, InfraTab, MeasureList, SecurityTab, ThreatTable } from './Design';
import { DevelopView } from './Develop';
import { Diagram } from './Diagram';
import { DoneView } from './Done';
import { InvestigateView } from './Investigate';
import { Cases, Results, Team } from './Office';
import { InfraChange, OpsAssign, OpsOverview, OpsRequests } from './Operate';
import { RequirementsView } from './Requirements';

function NoProject({ what }: { what: string }) {
  const { setScreen } = useGame();
  return (
    <div className="card stack">
      <p>まだ案件がありません。{what}</p>
      <button className="btn primary" onClick={() => setScreen('main')}>
        司令室で依頼を選ぶ
      </button>
    </div>
  );
}

// ------------------------------------------------------------
// システム：機器の配置・接続・CPU/メモリ・DB/ストレージ・バックアップ/予備機
// ------------------------------------------------------------
export function SystemScreen() {
  const { s, sel, setSel } = useGame();
  const topo = useMemo(() => buildTopology(s), [s]);
  const [tab, setTab] = useState<'infra' | 'data' | 'backup'>('infra');
  const p = s.project;
  if (!p) return <NoProject what="依頼を受けると、ここでシステムの構成を決められます。" />;
  const c = caseById(p.caseId);
  const node = sel?.kind === 'node' ? topo.nodes.find((n) => n.id === sel.id) : undefined;
  return (
    <div className="stack">
      <div className="sys-top">
        <div className="panel">
          <Diagram topo={topo} onSelect={(id) => setSel({ kind: 'node', id })} />
        </div>
        <div className="panel">{node ? <NodeDetail n={node} /> : <div className="detail small muted">構成図の機器を選ぶと、役割・性能・費用・壊れたときの影響が出ます。</div>}</div>
      </div>
      {p.phase === 'design' && (
        <>
          <div className="tabs">
            <button className={`tab ${tab === 'infra' ? 'on' : ''}`} onClick={() => setTab('infra')}>
              サーバー・ネットワーク
            </button>
            <button className={`tab ${tab === 'data' ? 'on' : ''}`} onClick={() => setTab('data')}>
              データベースの表
            </button>
            <button className={`tab ${tab === 'backup' ? 'on' : ''}`} onClick={() => setTab('backup')}>
              バックアップ・予備
            </button>
          </div>
          {tab === 'infra' && <InfraTab />}
          {tab === 'data' && <DataTab />}
          {tab === 'backup' && <BackupTab />}
          <div className="hint">処理のアルゴリズム・セキュリティ・設計レビューは「開発」画面の設計タブにあります。</div>
        </>
      )}
      {p.phase === 'operate' && (
        <div className="card stack">
          <h3>構成の変更</h3>
          <InfraChange />
        </div>
      )}
      {(p.phase === 'develop' || p.phase === 'done') && (
        <div className="card">
          <InfraMetrics c={c} p={p} infra={p.design.infra} />
        </div>
      )}
      {(p.phase === 'investigate' || p.phase === 'requirements') && <div className="hint">いまは調査・要件定義の段階です。設計フェーズになると、ここで構成を決められます。</div>}
    </div>
  );
}

// ------------------------------------------------------------
// 業務：業務の流れ・時間のかかる所・手作業や重複・改善前後の比較
// ------------------------------------------------------------
export function BusinessScreen() {
  const { s, mode } = useGame();
  const [view, setView] = useState<'before' | 'after'>('before');
  const p = s.project;
  if (!p) return <NoProject what="依頼主の業務の流れを、ここで調べて改善します。" />;
  const c = caseById(p.caseId);
  const w = evalWorkflow(c, p);
  const delivered = p.phase === 'operate' || p.phase === 'done';
  const who = (id?: string) => c.stakeholders.find((x) => x.id === id)?.name ?? '調査';
  // いちばん時間がかかっている工程（調査で分かっている工程の中から、今表示している状態で選ぶ）
  let bottleneck: string | null = null;
  let worst = 0;
  for (const st of w.steps) {
    if (!st.known) continue;
    const t = view === 'after' ? st.wait + st.work / 60 : st.step.wait + st.step.work / 60;
    if (t > worst) {
      worst = t;
      bottleneck = st.step.id;
    }
  }
  const B = w.before;
  const A = w.after;
  const rows: { k: string; b: string; a: string; better: boolean }[] = [
    { k: `${c.workflow.unit}の作業時間`, b: `${fmt(B.work, 1)}分`, a: `${fmt(A.work, 1)}分`, better: A.work < B.work },
    { k: '待ち時間の合計', b: `${fmt(B.wait, 1)}時間`, a: `${fmt(A.wait, 1)}時間`, better: A.wait < B.wait },
    { k: '手作業の工程', b: `${B.manual}か所`, a: `${A.manual}か所`, better: A.manual < B.manual },
    { k: '1か月の作業時間', b: `${fmt(B.monthlyHours)}時間`, a: `${fmt(A.monthlyHours)}時間`, better: A.monthlyHours < B.monthlyHours },
    { k: '1か月の人件費', b: man(B.monthlyCost), a: man(A.monthlyCost), better: A.monthlyCost < B.monthlyCost },
  ];
  return (
    <div className="stack">
      <div className="card stack">
        <div className="spread">
          <h3 style={{ margin: 0 }}>{c.client}の業務の流れ</h3>
          <div className="seg">
            <button className={view === 'before' ? 'on' : ''} onClick={() => setView('before')}>
              今の業務
            </button>
            <button className={view === 'after' ? 'on' : ''} onClick={() => setView('after')}>
              {delivered ? 'システム導入後' : '今の計画で改善すると'}
            </button>
          </div>
        </div>
        <p className="small" style={{ margin: 0 }}>
          {c.workflow.unit}が届いてから終わるまでの流れです（1日 約{fmt(c.workflow.perDay)}件）。黄色はいちばん時間がかかっている工程（ボトルネック）。「？」の工程は調査すると詳しく分かります。
        </p>
        <div className="flow">
          {w.steps.map((st, i) => {
            const after = view === 'after';
            const work = after ? st.work : st.step.work;
            const wait = after ? st.wait : st.step.wait;
            const gone = after && st.improved && work === 0 && wait === 0;
            const bott = st.step.id === bottleneck;
            return (
              <div key={st.step.id} className="flow-item">
                {i > 0 && <div className="flow-arrow" aria-hidden>→</div>}
                <div className={`flow-step ${bott ? 'bott' : ''} ${after && st.improved ? 'improved' : ''} ${gone ? 'gone' : ''} ${st.step.system ? 'sys' : ''}`}>
                  <div className="tiny muted">{st.step.actor}</div>
                  <b className="small">{st.step.name}</b>
                  <div className="row tiny" style={{ gap: 4 }}>
                    {st.step.system && <span className="badge accent">自動</span>}
                    {st.step.manual && !(after && st.improved && work === 0) && <span className="badge warn">手作業</span>}
                    {st.step.duplicate && !(after && st.improved) && <span className="badge bad">二重入力</span>}
                    {bott && <span className="badge warn">ボトルネック</span>}
                    {after && st.improved && <span className="badge good">改善</span>}
                  </div>
                  {st.known ? (
                    <div className="tiny">
                      作業 {fmt(work, 1)}分・待ち {fmt(wait, 1)}時間
                      {after && st.improved && (
                        <span className="muted">
                          {' '}
                          （前：{fmt(st.step.work, 1)}分・{fmt(st.step.wait, 1)}時間）
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="tiny muted">？ 「{who(st.step.reveal)}」で分かる</div>
                  )}
                  {st.known && (after && st.improved ? <div className="tiny good-t">{st.step.after!.note}</div> : st.step.note && <div className="tiny muted">{st.step.note}</div>)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="card stack">
        <h3>改善前と改善後の比べ</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>項目</th>
                <th className="right">今</th>
                <th className="right">{delivered ? '導入後' : '計画どおりなら'}</th>
                <th>変化</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.k}>
                  <td>{r.k}</td>
                  <td className="right num">{r.b}</td>
                  <td className="right num">{r.a}</td>
                  <td>{r.better ? <span className="badge good">▼ 減る</span> : <span className="badge">変わらない</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {mode === 'easy' && (
          <div className="hint">
            {A.monthlyHours < B.monthlyHours
              ? `今の計画で、1か月に約${fmt(B.monthlyHours - A.monthlyHours)}時間の作業が減ります。`
              : 'まだ業務は良くなりません。調査で問題を見つけて、それを解決する機能や設計を選びましょう。'}
          </div>
        )}
        <div className="tiny muted">人件費は1時間 {fmt(0.3 * 10000)}円で計算。業務を見直して、手作業・二重入力・待ち時間を減らすのも情報システムの大切な役割です。</div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// 開発：要件定義 → 設計 → 開発 → テスト → リリース、担当の割り当て
// ------------------------------------------------------------
const PHASES: Phase[] = ['investigate', 'requirements', 'design', 'develop', 'operate', 'done'];

export function DevScreen() {
  const { s } = useGame();
  const p = s.project;
  if (!p)
    return (
      <div className="stack">
        <h3>依頼一覧</h3>
        <Cases />
      </div>
    );
  const idx = PHASES.indexOf(p.phase);
  return (
    <div className="stack">
      <div className="stepper">
        {PHASES.map((ph, i) => (
          <div key={ph} className={`step ${i < idx ? 'done' : i === idx ? 'now' : ''}`}>
            {i < idx ? '✓ ' : ''}
            {i + 1}. {PHASE_NAMES[ph]}
          </div>
        ))}
      </div>
      {p.phase === 'investigate' && <InvestigateView />}
      {p.phase === 'requirements' && <RequirementsView />}
      {p.phase === 'design' && <DesignView />}
      {p.phase === 'develop' && <DevelopView />}
      {p.phase === 'operate' && (
        <>
          <OpsRequests />
          <OpsAssign />
        </>
      )}
      {p.phase === 'done' && <DoneView />}
    </div>
  );
}

// ------------------------------------------------------------
// 運用・セキュリティ：不審なアクセス・アカウントと権限・脆弱性対応・バックアップ・障害記録
// ------------------------------------------------------------
const ACCOUNT_MEASURES = ['mfa', 'lockout', 'leastpriv', 'logmon', 'patch', 'edu'];

export function OpsScreen() {
  const { s, dispatch } = useGame();
  const p = s.project;
  if (!p) return <NoProject what="システムを運用し始めると、ここで障害や攻撃の様子を確認できます。" />;
  const c = caseById(p.caseId);
  const ops = p.ops;
  const incidents = (ops?.history ?? []).flatMap((h) => (h.incidents ?? []).map((x) => ({ ...x, week: h.week }))).reverse();
  const attacks = incidents.filter((x) => x.kind === 'attack');
  return (
    <div className="stack">
      {ops && <OpsOverview />}
      <div className="cols">
        <div className="card stack">
          <h3>不審なアクセス・攻撃</h3>
          {!ops ? (
            <div className="small muted">運用を始めると記録されます。</div>
          ) : attacks.length ? (
            attacks.map((a, i) => (
              <div key={i} className="secbox small">
                運用{a.week}週目：{a.title}
              </div>
            ))
          ) : (
            <div className="small">これまで攻撃の被害はありません。</div>
          )}
          <div className="small muted">1週間に何かの攻撃・事故が起きる確率：約{fmt(weeklyRisk(c, p.design.measures) * 100, 1)}%</div>
        </div>
        <div className="card stack">
          <h3>アカウントと権限・脆弱性</h3>
          <ul className="plain small">
            {ACCOUNT_MEASURES.map((id) => {
              const m = MEASURES.find((x) => x.id === id);
              if (!m) return null;
              const on = p.design.measures.includes(id);
              return (
                <li key={id} className="row" style={{ gap: 6 }}>
                  <span className={`badge ${on ? 'good' : 'warn'}`}>{on ? '✓ 実施中' : '✕ 未実施'}</span>
                  {m.name}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <div className="card stack">
        <h3>障害・事故と復旧の記録</h3>
        {!incidents.length && <div className="small muted">まだ記録はありません。</div>}
        {incidents.map((x, i) => (
          <details key={i} className={`inc k-${x.kind}`}>
            <summary>
              <span className="badge">運用{x.week}週</span> {x.kind === 'attack' ? '【攻撃】' : x.kind === 'degraded' ? '【故障・継続】' : x.kind === 'overload' ? '【混雑】' : x.kind === 'warning' ? '【要確認】' : '【障害】'}
              {x.title}
            </summary>
            <ol className="steps">
              {x.steps.map((st, k) => (
                <li key={k}>{st}</li>
              ))}
            </ol>
          </details>
        ))}
      </div>
      {p.phase === 'design' && (
        <>
          <SecurityTab />
          <BackupTab />
        </>
      )}
      {p.phase === 'operate' && (
        <>
          <div className="card stack">
            <h3>セキュリティ対策の追加</h3>
            <ThreatTable c={c} measures={p.design.measures} />
            <div className="tiny muted">運用中は対策の追加だけができます（導入費をすぐ支払い、翌週から効果が出ます）。</div>
            <MeasureList c={c} measures={p.design.measures} lockOn onToggle={(id) => dispatch({ type: 'toggleMeasure', id })} />
          </div>
          <div className="card stack">
            <h3>
              <T id="backup">バックアップ</T>の状態
            </h3>
            <BackupEditor b={p.design.backup} dataGB={ops!.dataGB} onChange={(patch) => dispatch({ type: 'setBackup', patch })} />
          </div>
        </>
      )}
      {(p.phase === 'investigate' || p.phase === 'requirements' || p.phase === 'develop' || p.phase === 'done') && (
        <div className="card stack">
          <h3>脅威と対策</h3>
          <ThreatTable c={c} measures={p.design.measures} />
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// 管理：予算と支出・納期・チーム・契約・法令と個人情報・リスクと品質
// ------------------------------------------------------------
export function AdminScreen() {
  const { s, dispatch } = useGame();
  const [confirmQuit, setConfirmQuit] = useState(false);
  const p = s.project;
  const c = p ? caseById(p.caseId) : null;
  return (
    <div className="stack">
      <div className="cols">
        <div className="card stack">
          <h3>会社のお金</h3>
          <table className="small">
            <tbody>
              <tr>
                <th>資金</th>
                <td className="right num">{man(s.money)}</td>
              </tr>
              <tr>
                <th>人件費</th>
                <td className="right num">{man(salaryTotal(s))}/週</td>
              </tr>
              <tr>
                <th>評判</th>
                <td className="right num">{s.reputation}</td>
              </tr>
            </tbody>
          </table>
          <div className="tiny muted">資金が −500万円を下回ると倒産です。</div>
          {!p && (
            <button className="btn" onClick={() => dispatch({ type: 'nextWeek' })}>
              1週間待つ（採用候補が入れ替わる）
            </button>
          )}
        </div>
        {p && c && (
          <div className="card stack">
            <h3>この案件の予算と支出</h3>
            <table className="small">
              <tbody>
                <tr>
                  <th>受注額（予算）</th>
                  <td className="right num">{man(p.budget)}</td>
                </tr>
                <tr>
                  <th>支出</th>
                  <td className="right num">{man(p.spent)}</td>
                </tr>
                <tr>
                  <th>収入</th>
                  <td className="right num">{man(p.received)}</td>
                </tr>
                <tr>
                  <th>収支</th>
                  <td className="right num">{man(p.received - p.spent)}</td>
                </tr>
                <tr>
                  <th>納期</th>
                  <td className="right">
                    {fmtDate(deadlineWeek(c, p))}（{deadlineWeek(c, p) - s.week >= 0 ? `あと${deadlineWeek(c, p) - s.week}週` : `${s.week - deadlineWeek(c, p)}週遅れ`}）
                  </td>
                </tr>
              </tbody>
            </table>
            <div>
              <div className="tiny muted">予算に対する支出 {fmt((p.spent / Math.max(1, p.budget)) * 100)}%</div>
              <Meter value={Math.min(100, (p.spent / Math.max(1, p.budget)) * 100)} tone={p.spent > p.budget ? 'bad' : p.spent > p.budget * 0.8 ? 'warn' : 'good'} />
            </div>
          </div>
        )}
        {p && c && (
          <div className="card stack">
            <h3>契約</h3>
            {p.contract ? (
              <>
                <div>
                  <b>{p.contract === 'ukeoi' ? '請負契約' : '準委任契約'}</b>
                </div>
                <TermNote id={p.contract} />
                <div className="small">
                  {p.contract === 'ukeoi' ? '完成した物を納めて報酬をもらう。開始時に30%、納品時に70%。遅れると遅延損害金。' : '作業した分だけ報酬をもらう（毎週、人件費×1.25）。完成の責任はないが、上限は予算の1.2倍。'}
                </div>
              </>
            ) : (
              <div className="small muted">要件定義で決めます。</div>
            )}
            {p.nda && <div className="small">✓ 秘密保持契約（NDA）を結んでいます</div>}
          </div>
        )}
      </div>
      {p && c && (
        <div className="cols">
          <div className="card stack">
            <h3>法令・個人情報への対応</h3>
            <div className="small">
              扱うデータ：{c.personalData === 'sensitive' ? '要配慮個人情報（病歴など）' : c.personalData === 'personal' ? '個人情報' : '個人情報なし'}
            </div>
            {requiredLegal(c.personalData, p.design.infra.hosting).length === 0 && <div className="small">特に必要な対応はありません。</div>}
            <ul className="plain small">
              {requiredLegal(c.personalData, p.design.infra.hosting).map((id) => {
                const m = MEASURES.find((x) => x.id === id)!;
                const on = p.design.measures.includes(id);
                return (
                  <li key={id}>
                    <span className={`badge ${on ? 'good' : 'warn'}`}>{on ? '✓ 対応済み' : '✕ 未対応'}</span> {m.name}
                    <div className="tiny muted">{m.desc}</div>
                  </li>
                );
              })}
            </ul>
            <TermNote id="appi" />
          </div>
          <div className="card stack">
            <h3>リスクと品質</h3>
            <ul className="plain small">
              <li>
                攻撃・事故の確率：約{fmt(weeklyRisk(c, p.design.measures) * 100, 1)}%/週
              </li>
              <li>
                単一障害点：{singlePoints(p.design.infra).length ? singlePoints(p.design.infra).join('、') : 'なし'}
                <div className="tiny muted">
                  <T id="spof" />：{shortTerm('spof')}
                </div>
              </li>
              <li>
                残っているバグ：
                {p.phase === 'operate' || p.phase === 'done' || (p.tasks.find((t) => t.kind === 'test')?.progress ?? 0) > 0 ? (p.bugs >= 0.5 ? `約${Math.round(p.bugs)}件` : 'ほぼなし') : 'テストすると分かる'}
              </li>
              {p.phase === 'develop' && <li>テスト：{p.tasks.find((t) => t.kind === 'test') && taskDone(p.tasks.find((t) => t.kind === 'test')!) ? '完了' : '未完了'}</li>}
            </ul>
          </div>
        </div>
      )}
      <h3>チーム</h3>
      <Team />
      <h3>実績</h3>
      <Results />
      {p && p.phase !== 'done' && (
        <div className="right">
          <button className="btn danger ghost small" onClick={() => setConfirmQuit(true)}>
            案件をやめる…
          </button>
        </div>
      )}
      {confirmQuit && (
        <Modal onClose={() => setConfirmQuit(false)}>
          <h3>案件を途中でやめますか？</h3>
          <p>依頼主に迷惑がかかるので、評判が 5 下がります。これまでの費用は戻りません。</p>
          <div className="row">
            <button className="btn danger" onClick={() => (setConfirmQuit(false), dispatch({ type: 'abandonCase' }))}>
              やめる
            </button>
            <button className="btn" onClick={() => setConfirmQuit(false)}>
              続ける
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
