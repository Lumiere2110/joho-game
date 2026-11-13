// 運用フェーズ：毎週の負荷・障害・攻撃・要望に対応し、システムを改善する
import { useState } from 'react';
import { fmt, fmtTime, infraCost, pct, weeklyRunningCost } from '../core/calc';
import { caseById } from '../core/cases';
import type { Infra } from '../core/types';
import { LineChart, T, man, useGame } from './common';
import { BackupEditor, InfraEditor, InfraMetrics, MeasureList, ThreatTable } from './Design';
import { AssignTable } from './Develop';

export function OperateView() {
  const { s, dispatch } = useGame();
  const p = s.project!;
  const c = caseById(p.caseId);
  const ops = p.ops!;
  const h = ops.history;
  const last = h[h.length - 1];
  const labels = h.map((x) => `${x.week}週`);
  const nextEvent = c.traffic.events.find((e) => e.week === ops.week + 1);
  const knowPeak = !c.traffic.peakFact || p.facts.includes(c.traffic.peakFact);
  const [tab, setTab] = useState<'infra' | 'security' | 'backup'>('infra');

  return (
    <div className="stack">
      <div className="card stack">
        <div className="spread">
          <h2 style={{ margin: 0 }}>運用</h2>
          <span className="badge">
            運用 {ops.week} / {c.opsWeeks} 週
          </span>
        </div>
        {last ? (
          <div className="kpis">
            <div className="kpi">
              <div className="k">アクセス（ピーク時）</div>
              <div className="v">{fmt(last.lambda, 0)}件/秒</div>
              <div className="s">処理能力 {fmt(last.capacity, 0)}件/秒</div>
            </div>
            <div className="kpi">
              <div className="k">
                <T id="response-time">応答時間</T>
              </div>
              <div className="v">{fmtTime(last.response)}</div>
              <div className="s">目標 {fmtTime(c.responseTarget)}</div>
            </div>
            <div className="kpi">
              <div className="k">今週の停止時間</div>
              <div className="v">{fmt(last.outageHours, 1)}時間</div>
              <div className="s">
                <T id="availability">稼働率</T> {pct(1 - last.outageHours / 168, 2)}
              </div>
            </div>
            <div className="kpi">
              <div className="k">今週の収支（人件費を除く）</div>
              <div className="v">{man(last.revenue - last.cost)}</div>
              <div className="s">
                保守費 {man(last.revenue)} − 運用費 {fmt(last.cost, 1)}万円
              </div>
            </div>
          </div>
        ) : (
          <p className="small">
            システムが動き始めました！ 毎週、アクセスの増減・機器の故障・攻撃・利用者の要望が起こります。メンバーを<T id="mtbf-mttr">運用監視</T>やバグ修正に割り当てて、1週間ずつ進めましょう。
          </p>
        )}
        {nextEvent && (
          <div className="warnbox small">
            来週の予定：{nextEvent.name}
            {knowPeak ? `（アクセス約${nextEvent.multiplier}倍）` : '（アクセスが増えそうです）'}
          </div>
        )}
        {last && (
          <div className="stack">
            <b className="small">先週のできごと</b>
            {last.events.length === 0 && <div className="small muted">特に問題はありませんでした。</div>}
            {last.events.map((e, i) => (
              <div key={i} className={e.kind === 'bad' ? 'badbox' : e.kind === 'good' ? 'goodbox' : 'hint'}>
                {e.text}
              </div>
            ))}
          </div>
        )}
      </div>

      {h.length > 0 && (
        <div className="cols">
          <div className="card">
            <h3 className="small">アクセスと処理能力（件/秒）</h3>
            <LineChart
              labels={labels}
              series={[
                { name: 'アクセス', values: h.map((x) => x.lambda), color: 'var(--series-1)' },
                { name: 'Webの処理能力', values: h.map((x) => x.capacity), color: 'var(--series-2)', dashed: true },
              ]}
              format={(v) => fmt(v, 0)}
            />
          </div>
          <div className="card">
            <h3 className="small">応答時間（秒）</h3>
            <LineChart labels={labels} series={[{ name: '応答時間', values: h.map((x) => x.response), color: 'var(--series-1)' }]} format={(v) => fmt(v, 2)} refLine={{ value: c.responseTarget, label: '目標' }} />
          </div>
          <div className="card">
            <h3 className="small">依頼主の満足度</h3>
            <LineChart labels={labels} series={[{ name: '満足度', values: h.map((x) => x.satisfaction), color: 'var(--series-1)' }]} format={(v) => fmt(v, 0)} yMax={100} />
          </div>
        </div>
      )}

      {ops.arrivedRequests.length > 0 && (
        <div className="card stack">
          <h3>利用者からの要望</h3>
          {ops.arrivedRequests.map((id) => {
            const r = c.opsRequests.find((x) => x.id === id)!;
            const accepted = ops.acceptedRequests.includes(id);
            const done = ops.doneRequests.includes(id);
            return (
              <div key={id} className="bubble stack" style={{ gap: 6 }}>
                <div className="who">{r.from}</div>
                <div>{r.text}</div>
                <div className="row">
                  <b className="small">{r.name}</b>
                  <span className="badge">{r.effort}人週</span>
                  <span className="badge good">満足度 +{r.satisfaction}</span>
                  {done ? (
                    <span className="badge good">対応済み</span>
                  ) : accepted ? (
                    <span className="badge accent">対応中</span>
                  ) : (
                    <button className="btn primary" onClick={() => dispatch({ type: 'acceptRequest', id })}>
                      対応する
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          <div className="tiny muted">
            要望を放っておくと、少しずつ満足度が下がります。利用者の声をもとに改善を続けるのが <T id="pdca">PDCA</T> です。
          </div>
        </div>
      )}

      <div className="card stack">
        <div className="spread">
          <h3 style={{ margin: 0 }}>メンバーの割り当て</h3>
          <button className="btn" onClick={() => dispatch({ type: 'autoAssign' })}>
            おまかせ割り当て
          </button>
        </div>
        <div className="small">残っているバグ：{p.bugs >= 0.5 ? `約${Math.round(p.bugs)}件` : 'ほぼなし'}。監視している人の運用スキルが高いほど、障害からの復旧（MTTR）が早くなります。だれも監視しないと復旧に丸1日かかります。</div>
        <AssignTable tasks={p.tasks} />
      </div>

      <div className="card">
        <h3>改善（構成・対策・バックアップの見直し）</h3>
        <div className="tabs">
          <button className={`tab ${tab === 'infra' ? 'on' : ''}`} onClick={() => setTab('infra')}>
            構成の変更
          </button>
          <button className={`tab ${tab === 'security' ? 'on' : ''}`} onClick={() => setTab('security')}>
            対策の追加
          </button>
          <button className={`tab ${tab === 'backup' ? 'on' : ''}`} onClick={() => setTab('backup')}>
            バックアップ
          </button>
        </div>
        {tab === 'infra' && <InfraChange />}
        {tab === 'security' && (
          <div className="stack">
            <ThreatTable c={c} measures={p.design.measures} />
            <div className="tiny muted">運用中は対策の追加だけができます（導入費をすぐ支払い、翌週から効果が出ます）。</div>
            <MeasureList c={c} measures={p.design.measures} lockOn onToggle={(id) => dispatch({ type: 'toggleMeasure', id })} />
          </div>
        )}
        {tab === 'backup' && <BackupEditor b={p.design.backup} dataGB={ops.dataGB} onChange={(patch) => dispatch({ type: 'setBackup', patch })} />}
      </div>

      <div className="spread">
        <span className="small muted">
          来週の運用費 約{fmt(weeklyRunningCost(c, p.design, ops.dataGB), 1)}万円＋人件費 {man(s.staff.reduce((a, m) => a + m.salary, 0))}
        </span>
        <button className="btn primary big" onClick={() => dispatch({ type: 'nextWeek' })}>
          1週間進める →
        </button>
      </div>
    </div>
  );
}

function InfraChange() {
  const { s, dispatch } = useGame();
  const p = s.project!;
  const c = caseById(p.caseId);
  const ops = p.ops!;
  const [draft, setDraft] = useState<Infra>(() => structuredClone(p.design.infra));
  const patch = (x: Partial<Infra>) => {
    const n = { ...draft, ...x };
    if (n.webCount > 1 || n.autoscale) n.lb = true;
    n.webCount = Math.max(1, Math.min(8, n.webCount));
    setDraft(n);
  };
  const changed = JSON.stringify(draft) !== JSON.stringify(p.design.infra);
  const add = Math.max(0, infraCost(draft).initial - infraCost(p.design.infra).initial);
  if (ops.pendingInfra) return <div className="hint">構成変更を申し込み中です（{ops.pendingInfra.applyWeek}週目に完了）。</div>;
  return (
    <div className="stack">
      <InfraEditor infra={draft} onChange={patch} lockHosting />
      <InfraMetrics c={c} p={p} infra={draft} />
      <div className="row">
        <button className="btn primary" disabled={!changed} onClick={() => dispatch({ type: 'applyInfraChange', infra: draft })}>
          {p.design.infra.hosting === 'onprem' ? `変更を申し込む（追加費用 ${man(add)}・2週間後に完了）` : '変更する（すぐ反映）'}
        </button>
        {changed && (
          <button className="btn ghost" onClick={() => setDraft(structuredClone(p.design.infra))}>
            元に戻す
          </button>
        )}
      </div>
    </div>
  );
}
