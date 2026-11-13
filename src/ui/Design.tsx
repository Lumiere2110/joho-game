// 設計フェーズ：データベース・処理方式・インフラ・セキュリティ・バックアップを決める
import { useState } from 'react';
import { BACKUP_INTERVALS, BACKUP_TYPES, COMPLEXITY_LABEL, DB_TIERS, MEASURES, NETWORKS, THREATS, WEB_TIERS } from '../core/catalog';
import {
  backupMetrics,
  batchTime,
  chosenOption,
  dataAt,
  dataModelScore,
  evaluateLoad,
  fmt,
  fmtTime,
  infraCost,
  measuresCost,
  opsCount,
  pct,
  processWeeklyCost,
  singlePoints,
  systemAvailability,
} from '../core/calc';
import { caseById } from '../core/cases';
import { describeCond, designWarnings, isSolved, totalEffort } from '../core/project';
import type { Backup, CaseDef, Infra, Project, Tier } from '../core/types';
import { Seg, T, TermList, man, useGame } from './common';
import { ProgramEditor } from './Program';

type Tab = 'data' | 'process' | 'infra' | 'security' | 'backup' | 'review';

export function DesignView() {
  const [tab, setTab] = useState<Tab>('data');
  const { s } = useGame();
  const p = s.project!;
  const c = caseById(p.caseId);
  const unassigned = c.dataModel.attributes.some((a) => !p.design.dataModel[a.id]);
  const tabs: { id: Tab; label: string; dot?: boolean }[] = [
    { id: 'data', label: 'データベース', dot: unassigned },
    { id: 'process', label: '処理・アルゴリズム' },
    { id: 'infra', label: 'サーバー・ネットワーク' },
    { id: 'security', label: 'セキュリティ・法務' },
    { id: 'backup', label: 'バックアップ', dot: p.design.backup.type === 'none' },
    { id: 'review', label: '設計レビュー' },
  ];
  return (
    <div>
      <div className="card" style={{ marginBottom: 14 }}>
        <h2>設計：どんなシステムにするか</h2>
        <p className="small" style={{ margin: 0 }}>
          各タブで設計を決めましょう。性能・稼働率・費用は、選んだ内容から計算されます。調査で数値が分かっていないと、見積もりができない項目があります。最後に「設計レビュー」で確認して開発へ進みます。
        </p>
      </div>
      <div className="tabs">
        {tabs.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
            {t.dot && <span className="dot" />}
          </button>
        ))}
      </div>
      {tab === 'data' && <DataTab />}
      {tab === 'process' && <ProcessTab />}
      {tab === 'infra' && <InfraTab />}
      {tab === 'security' && <SecurityTab />}
      {tab === 'backup' && <BackupTab />}
      {tab === 'review' && <ReviewTab />}
    </div>
  );
}

// ------------------------------------------------------------
// データベース
// ------------------------------------------------------------
export function DataTab() {
  const { s, dispatch } = useGame();
  const p = s.project!;
  const c = caseById(p.caseId);
  const [sel, setSel] = useState<string | null>(null);
  const [review, setReview] = useState(false);
  const dm = c.dataModel;
  const place = (table: string) => {
    if (!sel) return;
    dispatch({ type: 'setDataModel', attr: sel, table });
    const next = dm.attributes.find((a) => a.id !== sel && !p.design.dataModel[a.id]);
    setSel(next?.id ?? null);
  };
  const pool = dm.attributes.filter((a) => !p.design.dataModel[a.id]);
  const allPlaced = pool.length === 0;
  return (
    <div className="stack">
      <div className="card stack">
        <h3>
          <T id="database">データベース</T>の表を設計する（<T id="normalization">正規化</T>）
        </h3>
        <p className="small">{dm.intro}</p>
        <p className="small muted">
          項目をクリックして選び、入れたい表をクリックします。それぞれの表の<T id="primary-key">主キー</T>（番号）は自動で<T id="foreign-key">外部キー</T>としてほかの表とつながります。まちがえると運用中に<T id="anomaly">更新時異常</T>が起きやすくなります。
        </p>
        <div>
          <div className="tiny muted">まだ表に入れていない項目</div>
          {pool.length === 0 ? (
            <span className="small muted">すべて配置しました</span>
          ) : (
            pool.map((a) => (
              <button key={a.id} className={`chip ${sel === a.id ? 'sel' : ''}`} onClick={() => setSel(a.id)}>
                {a.name}
              </button>
            ))
          )}
        </div>
      </div>
      <div className="cols">
        {dm.tables.map((t) => {
          const attrs = dm.attributes.filter((a) => p.design.dataModel[a.id] === t.id);
          return (
            <div key={t.id} className="dm-table" onClick={() => place(t.id)} style={{ cursor: sel ? 'pointer' : 'default', borderColor: sel ? 'var(--accent)' : undefined }}>
              <h4>{t.name}</h4>
              <div className="tiny muted" style={{ marginBottom: 6 }}>
                {t.desc}
              </div>
              {attrs.map((a) => {
                const ok = a.answer.includes(t.id);
                return (
                  <button
                    key={a.id}
                    className={`chip ${sel === a.id ? 'sel' : ''} ${review ? (ok ? 'ok' : 'ng') : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSel(a.id);
                    }}
                  >
                    {a.name}
                    {review && (ok ? ' ✓' : ' ✗')}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="card stack">
        <div className="spread">
          <b>先輩エンジニアのレビュー</b>
          <button className="btn" disabled={!allPlaced} onClick={() => setReview(true)}>
            {allPlaced ? 'レビューしてもらう' : 'すべて配置するとレビューできます'}
          </button>
        </div>
        {review && (
          <>
            <div className={dataModelScore(c, p.design) === 1 ? 'goodbox' : 'warnbox'}>
              正しく配置できた項目：{pct(dataModelScore(c, p.design), 0)}
            </div>
            <ul className="small" style={{ margin: 0, paddingLeft: 20 }}>
              {dm.attributes.map((a) => (
                <li key={a.id}>
                  <b>{a.name}</b>
                  {a.answer.includes(p.design.dataModel[a.id]) ? ' ✓ ' : ' ✗ '}
                  {a.note}
                </li>
              ))}
            </ul>
            <TermList ids={['primary-key', 'foreign-key', 'anomaly', 'transaction']} />
          </>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// 処理方式
// ------------------------------------------------------------
export function ProcessTab() {
  const { s, dispatch } = useGame();
  const p = s.project!;
  const c = caseById(p.caseId);
  const data = dataAt(c, c.deadlineWeeks);
  const [howOf, setHow] = useState<Record<string, 'pick' | 'block'>>({});
  return (
    <div className="stack">
      <div className="card small">
        処理の方式によって、データが増えたときの速さが大きく変わります（<T id="big-o">計算量</T>）。オンライン処理はリクエストごとにサーバーの負荷になり、
        <T id="batch">バッチ処理</T>は夜間にまとめて行います（使える時間は {fmtTime(c.batchWindow)}）。
      </div>
      {c.processes.map((pr) => {
        const item = c.data.find((x) => x.key === pr.dataKey)!;
        const known = !item.fact || p.facts.includes(item.fact);
        const n = data[pr.dataKey];
        return (
          <div key={pr.id} className="card stack">
            <div className="spread">
              <h3 style={{ margin: 0 }}>{pr.name}</h3>
              <span className="badge">
                {item.label}：{known ? `約${fmt(n)}${item.unit}（納品時の見込み）` : '？（調査で判明）'}
              </span>
            </div>
            <div className="small">{pr.desc}</div>
            {pr.program && (
              <Seg
                value={(howOf[pr.id] ?? (p.design.processes[pr.id] === 'custom' ? 'block' : 'pick')) as 'pick' | 'block'}
                options={[
                  { v: 'pick', label: '方式を選ぶ' },
                  { v: 'block', label: '🧩 ブロックで作る' },
                ]}
                onChange={(v) => setHow({ ...howOf, [pr.id]: v })}
              />
            )}
            {p.design.processes[pr.id] === 'custom' && (
              <div className="goodbox small">✓ 自分で作ったプログラム（{COMPLEXITY_LABEL[chosenOption(c, p.design, pr.id).complexity]}）を使っています</div>
            )}
            {pr.program && (howOf[pr.id] ?? (p.design.processes[pr.id] === 'custom' ? 'block' : 'pick')) === 'block' ? (
              <ProgramEditor proc={pr} n={n} known={known} />
            ) : (
            <div className="options">
              {pr.options.map((o) => {
                const on = p.design.processes[pr.id] === o.id;
                const ops = opsCount(o.complexity, n);
                const t = o.costPerOp * ops * (o.mode === 'online' ? pr.callsPerRequest ?? 1 : 1);
                const t10 = o.costPerOp * opsCount(o.complexity, n * 10) * (o.mode === 'online' ? pr.callsPerRequest ?? 1 : 1);
                return (
                  <button key={o.id} className={`option ${on ? 'on' : ''}`} onClick={() => dispatch({ type: 'setProcess', proc: pr.id, option: o.id })}>
                    <div className="title">
                      {o.name}
                      <span className="badge accent">{COMPLEXITY_LABEL[o.complexity]}</span>
                      <span className="badge">{o.mode === 'online' ? 'オンライン' : 'バッチ'}</span>
                      {o.effort > 0 && <span className="badge">+{o.effort}人週</span>}
                      {o.weeklyCost ? <span className="badge">{o.weeklyCost}万円/週</span> : null}
                    </div>
                    <div className="small">{o.desc}</div>
                    <div className="tiny muted num">
                      {known
                        ? o.mode === 'online'
                          ? `1リクエストあたり 約${fmtTime(t)}（データが10倍なら ${fmtTime(t10)}）`
                          : `1回の処理 約${fmtTime(t)}（データが10倍なら ${fmtTime(t10)}）`
                        : 'データ量が分からないので見積もれません'}
                    </div>
                    <TermList ids={o.terms} />
                  </button>
                );
              })}
            </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------
// インフラ
// ------------------------------------------------------------
const TIER_OPTS: { v: Tier; label: string }[] = [
  { v: 'S', label: '小型' },
  { v: 'M', label: '中型' },
  { v: 'L', label: '大型' },
];

export function InfraEditor({ infra, onChange, lockHosting }: { infra: Infra; onChange: (patch: Partial<Infra>) => void; lockHosting?: boolean }) {
  const on = infra.hosting === 'onprem';
  return (
    <div className="stack">
      <div className="stack">
        <b>
          設置方式（<T id="onprem">オンプレミス</T> / <T id="cloud">クラウド</T>）
        </b>
        {lockHosting ? (
          <span className="small">{on ? 'オンプレミス' : 'クラウド'}（運用中は変更できません）</span>
        ) : (
          <Seg value={infra.hosting} options={[{ v: 'onprem', label: 'オンプレミス' }, { v: 'cloud', label: 'クラウド' }]} onChange={(v) => onChange({ hosting: v })} />
        )}
        <span className="tiny muted">{on ? '機器を買う。初期費用が高く、毎週の費用は安い。増設には時間がかかる。' : '借りる。初期費用がなく、毎週の利用料がかかる。台数をすぐ変えられる。'}</span>
      </div>
      <div className="cols">
        <div className="stack">
          <b>Webサーバーの性能（<T id="scale-up">スケールアップ</T>）</b>
          <Seg value={infra.webTier} options={TIER_OPTS} onChange={(v) => onChange({ webTier: v })} />
          <span className="tiny muted">
            {WEB_TIERS[infra.webTier].name}：{on ? `${WEB_TIERS[infra.webTier].onpremCost}万円/台 ＋ ${WEB_TIERS[infra.webTier].onpremWeekly}万円/週` : `${WEB_TIERS[infra.webTier].cloudWeekly}万円/週・台`}
          </span>
        </div>
        <div className="stack">
          <b>Webサーバーの台数（<T id="scale-out">スケールアウト</T>）</b>
          <div className="row">
            <button className="btn" onClick={() => onChange({ webCount: infra.webCount - 1 })} disabled={infra.webCount <= 1}>
              −
            </button>
            <b className="num">{infra.webCount} 台</b>
            <button className="btn" onClick={() => onChange({ webCount: infra.webCount + 1 })} disabled={infra.webCount >= 8}>
              ＋
            </button>
          </div>
          <label className="check small">
            <input type="checkbox" checked={infra.lb} disabled={infra.webCount > 1 || infra.autoscale} onChange={(e) => onChange({ lb: e.target.checked })} />
            <span>
              <T id="load-balancer">ロードバランサ</T>（2台以上なら必須）
            </span>
          </label>
          {!on && (
            <label className="check small">
              <input type="checkbox" checked={infra.autoscale} onChange={(e) => onChange({ autoscale: e.target.checked })} />
              <span>
                <T id="autoscale">オートスケール</T>（負荷に応じて最大10台まで自動で増やす）
              </span>
            </label>
          )}
        </div>
        <div className="stack">
          <b>データベースサーバー</b>
          <Seg value={infra.dbTier} options={TIER_OPTS} onChange={(v) => onChange({ dbTier: v })} />
          <label className="check small">
            <input type="checkbox" checked={infra.dbReplica} onChange={(e) => onChange({ dbReplica: e.target.checked })} />
            <span>
              <T id="replication">レプリカ</T>（予備のDB。故障時は<T id="failover">フェイルオーバー</T>）
            </span>
          </label>
          <span className="tiny muted">{DB_TIERS[infra.dbTier].name}</span>
        </div>
        <div className="stack">
          <b>
            回線の<T id="bandwidth">帯域幅</T>
          </b>
          <Seg value={infra.network} options={(Object.keys(NETWORKS) as Infra['network'][]).map((k) => ({ v: k, label: NETWORKS[k].name }))} onChange={(v) => onChange({ network: v })} />
          <span className="tiny muted">{NETWORKS[infra.network].weekly}万円/週</span>
          <label className="check small">
            <input type="checkbox" checked={infra.cdn} onChange={(e) => onChange({ cdn: e.target.checked })} />
            <span>
              <T id="cdn">CDN</T>（画像などを配信。通信量の6割・リクエストの3割を肩代わり）
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}

export function InfraMetrics({ c, p, infra }: { c: CaseDef; p: Project; infra: Infra }) {
  const d = { ...p.design, infra };
  const cost = infraCost(infra);
  const avail = systemAvailability(infra);
  const spof = singlePoints(infra);
  const knowBase = !c.traffic.peakFact || p.facts.includes('traffic-base');
  const knowPeak = !c.traffic.peakFact || p.facts.includes(c.traffic.peakFact);
  const knowData = c.data.every((x) => !x.fact || p.facts.includes(x.fact));
  const data = dataAt(c, c.deadlineWeeks + c.opsWeeks);
  const peakMult = Math.max(1, ...c.traffic.events.map((e) => e.multiplier));
  const base = c.traffic.base * Math.pow(1 + c.traffic.growthPerWeek, c.opsWeeks);
  const count = infra.hosting === 'cloud' && infra.autoscale ? 10 : infra.webCount;
  const normal = evaluateLoad(c, d, data, base, infra.webCount, infra);
  const peak = evaluateLoad(c, d, data, base * peakMult, count, infra);
  const row = (label: string, r: typeof normal, lambda: number) => (
    <tr>
      <th>{label}</th>
      <td className="num">{fmt(lambda, 0)} 件/秒</td>
      <td className="num">{fmt(r.capacity, 0)} 件/秒</td>
      <td className="num">{pct(Math.max(r.rho, r.dbRho, r.netRho), 0)}</td>
      <td className="num">{r.lostRate > 0 ? <span className="badge bad">さばけない（{pct(r.lostRate, 0)}エラー）</span> : fmtTime(r.response)}</td>
    </tr>
  );
  return (
    <div className="stack">
      <div className="kpis">
        <div className="kpi">
          <div className="k">初期費用</div>
          <div className="v">{man(cost.initial)}</div>
        </div>
        <div className="kpi">
          <div className="k">毎週の費用</div>
          <div className="v">{fmt(cost.weekly, 1)}万円</div>
        </div>
        <div className="kpi">
          <div className="k">
            理論<T id="availability">稼働率</T>
          </div>
          <div className="v">{pct(avail, 3)}</div>
          <div className="s">年間 約{fmt((1 - avail) * 8760, 0)}時間 停止</div>
        </div>
      </div>
      {spof.length > 0 ? (
        <div className="warnbox small">
          <T id="spof">単一障害点</T>：{spof.join('、')}
        </div>
      ) : (
        <div className="goodbox small">単一障害点はありません（<T id="redundancy">冗長化</T>済み）</div>
      )}
      <div>
        <b className="small">
          負荷の見積もり（<T id="queueing">待ち行列</T>で計算、運用終了時点）
        </b>
        {knowBase && knowData ? (
          <div className="table-wrap">
            <table className="small">
              <thead>
                <tr>
                  <th></th>
                  <th>アクセス</th>
                  <th>Web処理能力</th>
                  <th>
                    <T id="utilization">利用率</T>（最大）
                  </th>
                  <th>
                    <T id="response-time">応答時間</T>
                  </th>
                </tr>
              </thead>
              <tbody>
                {row('平常時', normal, base)}
                {knowPeak ? row(`ピーク（×${peakMult}）`, peak, base * peakMult) : (
                  <tr>
                    <th>ピーク</th>
                    <td colSpan={4} className="muted">
                      ピーク時のアクセス量が分からないため、見積もれません（アクセスログを分析しよう）
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="tiny muted">
              目標応答時間 {fmtTime(c.responseTarget)}。1リクエストの処理時間 {fmtTime(normal.S)}。回線の利用率 平常 {pct(normal.netRho, 0)}
              {knowPeak && ` / ピーク ${pct(peak.netRho, 0)}`}、DBの利用率 平常 {pct(normal.dbRho, 0)}
              {knowPeak && ` / ピーク ${pct(peak.dbRho, 0)}`}。
            </div>
          </div>
        ) : (
          <div className="muted small">アクセス量やデータ量が分からないため、見積もれません。調査でデータを分析しましょう。</div>
        )}
      </div>
      <table className="small">
        <tbody>
          {cost.lines.map((l) => (
            <tr key={l.name}>
              <td>{l.name}</td>
              <td className="right num">{l.initial ? man(l.initial) : '—'}</td>
              <td className="right num">{fmt(l.weekly, 1)}万円/週</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function InfraTab() {
  const { s, dispatch } = useGame();
  const p = s.project!;
  const c = caseById(p.caseId);
  return (
    <div className="stack">
      <div className="card">
        <InfraEditor infra={p.design.infra} onChange={(patch) => dispatch({ type: 'setInfra', patch })} />
      </div>
      <div className="card">
        <InfraMetrics c={c} p={p} infra={p.design.infra} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// セキュリティ・法務
// ------------------------------------------------------------
export function threatProb(c: CaseDef, measures: string[], id: string) {
  const th = THREATS.find((t) => t.id === id)!;
  let prob = th.basePerWeek * (c.threats[th.id] ?? 0);
  for (const m of MEASURES) if (measures.includes(m.id)) prob *= 1 - (m.mitigates[th.id] ?? 0);
  return prob;
}

export function MeasureList({ c, measures, onToggle, lockOn }: { c: CaseDef; measures: string[]; onToggle: (id: string) => void; lockOn?: boolean }) {
  return (
    <>
      {(['security', 'legal'] as const).map((cat) => (
        <div key={cat} className="stack">
          <h3>{cat === 'security' ? 'セキュリティ対策' : '法務・個人情報の対策'}</h3>
          {cat === 'legal' && (
            <div className="hint">
              {c.personalData === 'none'
                ? 'この案件では個人情報をほとんど扱いません。'
                : c.personalData === 'sensitive'
                  ? 'この案件では病歴などの要配慮個人情報を扱います。個人情報保護法で、より厳しいルールが定められています。'
                  : 'この案件では個人情報を扱います。個人情報保護法に沿った対策が必要です。'}{' '}
              <T id="appi">個人情報保護法</T>
            </div>
          )}
          <div className="options">
            {MEASURES.filter((m) => m.category === cat).map((m) => {
              const on = measures.includes(m.id);
              return (
                <button key={m.id} className={`option ${on ? 'on' : ''}`} disabled={lockOn && on} style={lockOn && on ? { opacity: 1 } : undefined} onClick={() => onToggle(m.id)}>
                  <div className="title">
                    <input type="checkbox" checked={on} readOnly />
                    {m.name}
                    {m.initialCost > 0 && <span className="badge">導入 {m.initialCost}万円</span>}
                    {m.weeklyCost > 0 && <span className="badge">{m.weeklyCost}万円/週</span>}
                    {m.effort > 0 && <span className="badge">{m.effort}人週</span>}
                  </div>
                  <div className="small">{m.desc}</div>
                  <div className="tiny muted">
                    {Object.entries(m.mitigates)
                      .map(([k, v]) => `${THREATS.find((t) => t.id === k)!.name} −${Math.round((v ?? 0) * 100)}%`)
                      .join('、')}
                    {m.leakImpact ? `${Object.keys(m.mitigates).length ? '、' : ''}漏えい時の被害 −${Math.round(m.leakImpact * 100)}%` : ''}{' '}
                    <T id={m.term}>用語</T>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

export function ThreatTable({ c, measures }: { c: CaseDef; measures: string[] }) {
  return (
    <table className="small">
      <thead>
        <tr>
          <th>脅威</th>
          <th className="right">対策なし</th>
          <th className="right">今の対策</th>
        </tr>
      </thead>
      <tbody>
        {THREATS.filter((t) => c.threats[t.id]).map((t) => {
          const before = threatProb(c, [], t.id);
          const after = threatProb(c, measures, t.id);
          return (
            <tr key={t.id}>
              <td>
                <T id={t.term}>{t.name}</T>
              </td>
              <td className="right num">{pct(before)}/週</td>
              <td className="right num">
                <span className={after < before * 0.3 ? 'badge good' : after < before ? 'badge warn' : 'badge bad'}>{pct(after)}/週</span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function SecurityTab() {
  const { s, dispatch } = useGame();
  const p = s.project!;
  const c = caseById(p.caseId);
  const mc = measuresCost(p.design.measures);
  return (
    <div className="stack">
      <div className="card stack">
        <h3>
          脅威と、起きる確率（1週間あたり）<TermList ids={['cia']} />
        </h3>
        <ThreatTable c={c} measures={p.design.measures} />
        <div className="small muted">
          対策の費用：導入 {man(mc.initial)}、維持 {fmt(mc.weekly, 1)}万円/週。工数が必要な対策は開発タスクになります。
        </div>
      </div>
      <div className="card stack">
        <MeasureList c={c} measures={p.design.measures} onToggle={(id) => dispatch({ type: 'toggleMeasure', id })} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// バックアップ
// ------------------------------------------------------------
export function BackupEditor({ b, dataGB, onChange }: { b: Backup; dataGB: number; onChange: (patch: Partial<Backup>) => void }) {
  const m = backupMetrics(b, dataGB);
  return (
    <div className="stack">
      <div className="stack">
        <b>方式</b>
        <Seg value={b.type} options={(Object.keys(BACKUP_TYPES) as Backup['type'][]).map((k) => ({ v: k, label: BACKUP_TYPES[k].name }))} onChange={(v) => onChange({ type: v })} />
        <TermList ids={['backup-full', 'backup-diff', 'backup-incr']} />
      </div>
      {b.type !== 'none' && (
        <>
          <div className="cols">
            <div className="stack">
              <b>頻度</b>
              <Seg value={b.interval} options={(Object.keys(BACKUP_INTERVALS) as Backup['interval'][]).map((k) => ({ v: k, label: BACKUP_INTERVALS[k].name }))} onChange={(v) => onChange({ interval: v })} />
            </div>
            <div className="stack">
              <b>
                残す回数（<T id="generation">世代</T>）
              </b>
              <div className="row">
                <button className="btn" disabled={b.generations <= 1} onClick={() => onChange({ generations: b.generations - 1 })}>
                  −
                </button>
                <b className="num">{b.generations} 世代</b>
                <button className="btn" disabled={b.generations >= 30} onClick={() => onChange({ generations: b.generations + 1 })}>
                  ＋
                </button>
              </div>
            </div>
          </div>
          <label className="check small">
            <input type="checkbox" checked={b.offsite} onChange={(e) => onChange({ offsite: e.target.checked })} />
            <span>
              <T id="offsite">遠隔地にも保管</T>（費用1.5倍・復元が1時間遅くなる。災害やランサムウェアに強い）
            </span>
          </label>
        </>
      )}
      <div className="kpis">
        <div className="kpi">
          <div className="k">
            <T id="rpo-rto">RPO</T>（失うデータ）
          </div>
          <div className="v">{Number.isFinite(m.rpoHours) ? `最大${m.rpoHours}時間` : 'すべて'}</div>
        </div>
        <div className="kpi">
          <div className="k">RTO（復旧時間）</div>
          <div className="v">{Number.isFinite(m.rtoHours) ? `${fmt(m.rtoHours, 1)}時間` : '復旧不可'}</div>
        </div>
        <div className="kpi">
          <div className="k">保存容量</div>
          <div className="v">{fmt(m.storageGB)}GB</div>
        </div>
        <div className="kpi">
          <div className="k">費用</div>
          <div className="v">{fmt(m.weeklyCost, 1)}万円/週</div>
        </div>
      </div>
      {b.type !== 'none' && (
        <div className={m.feasible ? 'hint' : 'badbox'}>
          1回のバックアップに約 {fmt(m.backupHours, 1)} 時間かかります。{!m.feasible && '次のバックアップの時刻までに終わりません！ 頻度を下げるか、差分・増分にしましょう。'}
        </div>
      )}
      <div className="tiny muted">
        データ量 約{fmt(dataGB)}GB。<T id="replication">レプリケーション</T>は故障には強いですが、誤って消したデータもコピーされるので、バックアップの代わりにはなりません。
      </div>
    </div>
  );
}

export function BackupTab() {
  const { s, dispatch } = useGame();
  const p = s.project!;
  const c = caseById(p.caseId);
  return (
    <div className="card">
      <h3>
        <T id="backup">バックアップ</T>の方針
      </h3>
      <BackupEditor b={p.design.backup} dataGB={c.dataGB} onChange={(patch) => dispatch({ type: 'setBackup', patch })} />
    </div>
  );
}

// ------------------------------------------------------------
// レビュー
// ------------------------------------------------------------
export function ReviewTab() {
  const { s, dispatch } = useGame();
  const p = s.project!;
  const c = caseById(p.caseId);
  const warnings = designWarnings(c, p);
  const ic = infraCost(p.design.infra);
  const mc = measuresCost(p.design.measures);
  const bm = backupMetrics(p.design.backup, c.dataGB);
  const weekly = ic.weekly + mc.weekly + bm.weeklyCost + processWeeklyCost(c, p.design);
  const effort = totalEffort(c, p);
  const bt = batchTime(c, p.design, dataAt(c, c.deadlineWeeks + c.opsWeeks));
  const found = c.problems.filter((x) => p.foundProblems.includes(x.id));
  return (
    <div className="stack">
      <div className="card stack">
        <h3>設計のまとめ</h3>
        <div className="kpis">
          <div className="kpi">
            <div className="k">初期費用</div>
            <div className="v">{man(ic.initial + mc.initial)}</div>
            {p.contract === 'junin' && <div className="s">準委任：依頼主が負担</div>}
          </div>
          <div className="kpi">
            <div className="k">運用費</div>
            <div className="v">{fmt(weekly, 1)}万円/週</div>
            <div className="s">保守費 {c.maintenanceFee}万円/週（満足度で増減）</div>
          </div>
          <div className="kpi">
            <div className="k">開発工数</div>
            <div className="v">{fmt(effort, 1)}人週</div>
          </div>
          <div className="kpi">
            <div className="k">理論稼働率</div>
            <div className="v">{pct(systemAvailability(p.design.infra), 2)}</div>
          </div>
          <div className="kpi">
            <div className="k">夜間バッチ</div>
            <div className="v">{fmtTime(bt)}</div>
            <div className="s">上限 {fmtTime(c.batchWindow)}（運用終了時の見込み）</div>
          </div>
        </div>
      </div>
      <div className="card stack">
        <h3>問題の解決見込み</h3>
        {found.map((x) => {
          const ok = isSolved(c, p, x, 'plan');
          return (
            <div key={x.id} className={`problem ${ok ? 'solved' : 'unsolved'}`}>
              <div className="row">
                <b>{x.title}</b>
                {ok ? <span className="badge good">解決の見込み</span> : <span className="badge warn">未解決</span>}
              </div>
              {!ok && <div className="tiny muted">解決方法：{x.solvedBy.map((cond) => describeCond(c, cond)).join(' または ')}</div>}
            </div>
          );
        })}
      </div>
      {warnings.length > 0 && (
        <div className="card stack">
          <h3>レビューでの指摘</h3>
          {warnings.map((w) => (
            <div key={w} className="warnbox">
              {w}
            </div>
          ))}
        </div>
      )}
      <div className="spread">
        <span className="small muted">設計レビューに1週間かかり、機器・サービスの初期費用を支払って開発を始めます。</span>
        <button className="btn primary big" onClick={() => dispatch({ type: 'confirmDesign' })}>
          設計を確定して開発へ
        </button>
      </div>
    </div>
  );
}
