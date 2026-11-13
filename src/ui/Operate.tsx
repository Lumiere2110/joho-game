// 運用フェーズの部品：毎週の負荷・障害・攻撃・要望の様子と、改善の操作
import { useState } from 'react';
import { fmt, fmtTime, infraCost, pct } from '../core/calc';
import { caseById } from '../core/cases';
import type { Infra } from '../core/types';
import { LineChart, T, man, useGame } from './common';
import { InfraEditor, InfraMetrics } from './Design';
import { AssignTable } from './Develop';

/** 先週の結果（数値・グラフ・できごと） */
export function OpsOverview() {
  const { s } = useGame();
  const p = s.project!;
  const c = caseById(p.caseId);
  const ops = p.ops!;
  const h = ops.history;
  const last = h[h.length - 1];
  const labels = h.map((x) => `${x.week}週`);
  const nextEvent = c.traffic.events.find((e) => e.week === ops.week + 1);
  const knowPeak = !c.traffic.peakFact || p.facts.includes(c.traffic.peakFact);
  return (
    <div className="stack">
      <div className="card stack">
        <div className="spread">
          <h3 style={{ margin: 0 }}>運用の状況</h3>
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
            システムが動き始めました！ 毎週、アクセスの増減・機器の故障・攻撃・利用者の要望が起こります。メンバーを<T id="mtbf-mttr">運用監視</T>やバグ修正に割り当てて、時間を進めましょう。
          </p>
        )}
        {nextEvent && (
          <div className="warnbox small">
            来週の予定：{nextEvent.name}
            {knowPeak ? `（アクセス約${nextEvent.multiplier}倍）` : '（アクセスが増えそうです）'}
          </div>
        )}
        {last && (
          <div className="stack tight">
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
    </div>
  );
}

/** 利用者からの要望 */
export function OpsRequests() {
  const { s, dispatch } = useGame();
  const p = s.project!;
  const c = caseById(p.caseId);
  const ops = p.ops!;
  if (!ops.arrivedRequests.length) return <div className="card small muted">まだ利用者からの要望は届いていません。</div>;
  return (
    <div className="card stack">
      <h3>利用者からの要望</h3>
      {ops.arrivedRequests.map((id) => {
        const r = c.opsRequests.find((x) => x.id === id)!;
        const accepted = ops.acceptedRequests.includes(id);
        const done = ops.doneRequests.includes(id);
        return (
          <div key={id} className="bubble stack tight">
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
  );
}

/** 運用中のメンバーの割り当て */
export function OpsAssign() {
  const { s, dispatch } = useGame();
  const p = s.project!;
  return (
    <div className="card stack">
      <div className="spread">
        <h3 style={{ margin: 0 }}>メンバーの割り当て</h3>
        <button className="btn" onClick={() => dispatch({ type: 'autoAssign' })}>
          おまかせ割り当て
        </button>
      </div>
      <div className="small">
        残っているバグ：{p.bugs >= 0.5 ? `約${Math.round(p.bugs)}件` : 'ほぼなし'}。監視している人の運用スキルが高いほど、障害からの復旧（MTTR）が早くなります。だれも監視しないと復旧に丸1日かかります。
      </div>
      <AssignTable tasks={p.tasks} />
    </div>
  );
}

/** 運用中の構成変更 */
export function InfraChange() {
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
