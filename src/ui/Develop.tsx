// 開発フェーズ：メンバーをタスクに割り当て、1週間ずつ進める
import { caseById } from '../core/cases';
import { canRelease, deadlineWeek, taskDone } from '../core/project';
import { salaryTotal } from '../core/sim';
import { workRate } from '../core/staff';
import type { Member, Task } from '../core/types';
import { SKILL_NAMES } from '../core/types';
import { Meter, Modal, T, man, useGame } from './common';

export function AssignTable({ tasks }: { tasks: Task[] }) {
  const { s, dispatch } = useGame();
  const p = s.project!;
  const open = tasks.filter((t) => t.continuous || !taskDone(t));
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>メンバー</th>
            <th>担当</th>
            <th>1週の作業量</th>
            <th>疲労</th>
          </tr>
        </thead>
        <tbody>
          {s.staff.map((m: Member) => {
            const t = p.tasks.find((x) => x.id === p.assignments[m.id]);
            const rate = t && !taskDone(t) ? workRate(m, t.skill, p.overtime) : 0;
            return (
              <tr key={m.id}>
                <td>
                  <b>{m.name}</b>
                  <div className="tiny muted">
                    {m.title}・
                    {Object.entries(m.skills)
                      .filter(([, v]) => v >= 3)
                      .map(([k, v]) => `${SKILL_NAMES[k as keyof typeof SKILL_NAMES]}${v}`)
                      .join(' ')}
                  </div>
                </td>
                <td>
                  <select value={p.assignments[m.id] ?? 'rest'} onChange={(e) => dispatch({ type: 'assign', memberId: m.id, taskId: e.target.value })} style={{ maxWidth: 280 }}>
                    <option value="rest">休む（疲労回復）</option>
                    {t && taskDone(t) && <option value={t.id}>（完了）{t.name} — 次の週に自動で割り当て</option>}
                    {open.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}（{SKILL_NAMES[x.skill]}・スキル{m.skills[x.skill]}）
                      </option>
                    ))}
                  </select>
                </td>
                <td className="num">{rate ? `${rate.toFixed(2)}人週` : '—'}</td>
                <td style={{ width: 110 }}>
                  <Meter value={m.fatigue} tone={m.fatigue >= 70 ? 'bad' : m.fatigue >= 50 ? 'warn' : 'good'} />
                  <span className="tiny muted">{Math.round(m.fatigue)}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function DevelopView() {
  const { s, dispatch } = useGame();
  const p = s.project!;
  const c = caseById(p.caseId);
  const dl = deadlineWeek(c, p);
  const total = p.tasks.filter((t) => !t.optional || t.kind !== 'test').reduce((a, t) => a + t.effort, 0);
  const done = p.tasks.filter((t) => !t.optional || t.kind !== 'test').reduce((a, t) => a + t.progress, 0);
  const test = p.tasks.find((t) => t.kind === 'test');
  const releasable = canRelease(p);
  const remainEffort = p.tasks.reduce((a, t) => a + Math.max(0, t.effort - t.progress), 0);
  const teamRate = s.staff.reduce((a, m) => a + workRate(m, 'dev', p.overtime), 0);

  return (
    <div className="stack">
      <div className="card stack">
        <div className="spread">
          <h2 style={{ margin: 0 }}>開発</h2>
          <span className={`badge ${s.week > dl ? 'bad' : dl - s.week <= 2 ? 'warn' : ''}`}>
            {s.week}週目／納期 {dl}週目
          </span>
        </div>
        <div className="kpis">
          <div className="kpi">
            <div className="k">進み具合</div>
            <div className="v">{Math.round((done / Math.max(1e-9, total)) * 100)}%</div>
            <Meter value={done} max={total} />
          </div>
          <div className="kpi">
            <div className="k">残りの工数</div>
            <div className="v">{remainEffort.toFixed(1)}人週</div>
            <div className="s">チームで あと約{(remainEffort / Math.max(0.1, teamRate)).toFixed(1)}週</div>
          </div>
          <div className="kpi">
            <div className="k">
              <T id="bug">バグ</T>（推定）
            </div>
            <div className="v">{test && test.progress > 0 ? `約${Math.round(p.bugs)}件` : '？件'}</div>
            <div className="s">{test && test.progress > 0 ? 'テストで判明' : 'テストすると分かる'}</div>
          </div>
          <div className="kpi">
            <div className="k">今週の人件費</div>
            <div className="v">{man(salaryTotal(s))}</div>
          </div>
        </div>
      </div>

      <div className="card stack">
        <h3>
          タスク（<T id="wbs">WBS</T>）
        </h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>タスク</th>
                <th>スキル</th>
                <th>担当</th>
                <th style={{ width: 160 }}>進み具合</th>
              </tr>
            </thead>
            <tbody>
              {p.tasks.map((t) => {
                const who = s.staff.filter((m) => p.assignments[m.id] === t.id).map((m) => m.name.split(' ')[0]);
                const fin = taskDone(t);
                return (
                  <tr key={t.id}>
                    <td>
                      {t.name}
                      {t.optional && t.kind !== 'test' && <span className="badge" style={{ marginLeft: 6 }}>任意</span>}
                      {t.kind === 'test' && <span className="badge warn" style={{ marginLeft: 6 }}>任意だが重要</span>}
                    </td>
                    <td className="small">{SKILL_NAMES[t.skill]}</td>
                    <td className="small">{who.join('・') || '—'}</td>
                    <td>
                      <Meter value={t.progress} max={t.effort} tone={fin ? 'good' : undefined} />
                      <span className="tiny muted num">
                        {t.progress.toFixed(1)} / {t.effort.toFixed(1)}人週 {fin && '✓'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="tiny muted">任意の機能は、未完成のままリリースするとその機能はなしになります。テストはバグを減らします（機能を作り終えてから行うと効果的）。</div>
      </div>

      <div className="card stack">
        <div className="spread">
          <h3 style={{ margin: 0 }}>メンバーの割り当て</h3>
          <div className="row">
            <label className="check small">
              <input type="checkbox" checked={p.overtime} onChange={(e) => dispatch({ type: 'setOvertime', on: e.target.checked })} />
              <span>
                <T id="overtime">残業する</T>（作業量×1.3、疲労とバグが増える）
              </span>
            </label>
            <button className="btn" onClick={() => dispatch({ type: 'autoAssign' })}>
              おまかせ割り当て
            </button>
          </div>
        </div>
        <AssignTable tasks={p.tasks} />
        <div className="tiny muted">得意なスキルのタスクほど速く進み、バグも少なくなります。疲労が70を超えると効率が落ち、80を超えると体調を崩すことがあります。</div>
      </div>

      <div className="spread">
        <button className="btn primary big" disabled={!releasable || !!p.pendingEvent} onClick={() => dispatch({ type: 'release' })}>
          {releasable ? 'リリースする（納品・運用開始）' : '必須タスクが終わるとリリースできます'}
        </button>
        <button className="btn primary big" disabled={!!p.pendingEvent} onClick={() => dispatch({ type: 'nextWeek' })}>
          1週間進める →
        </button>
      </div>

      {p.pendingEvent && (
        <Modal>
          <h2>{p.pendingEvent.title}</h2>
          <p>{p.pendingEvent.text}</p>
          <p className="small muted">
            追加の工数：{c.changeRequest.effort}人週。<T id="spec-change">仕様変更</T>をどう扱うかは契約（{p.contract === 'ukeoi' ? '請負' : '準委任'}）によって変わります。
          </p>
          <div className="options">
            <button className="option" onClick={() => dispatch({ type: 'resolveEvent', choice: 'accept' })}>
              <div className="title">受ける</div>
              <div className="small">{p.contract === 'ukeoi' ? '追加費用なしで受ける。満足度は上がるが、作業が増える。' : '準委任なので作業分の報酬が出る。納期も1週延びる。'}</div>
            </button>
            {p.contract === 'ukeoi' && (
              <button className="option" onClick={() => dispatch({ type: 'resolveEvent', choice: 'negotiate' })}>
                <div className="title">追加費用と納期延長を交渉する</div>
                <div className="small">企画・調整スキルが高いほど成功しやすい。失敗すると変更は見送り。</div>
              </button>
            )}
            <button className="option" onClick={() => dispatch({ type: 'resolveEvent', choice: 'decline' })}>
              <div className="title">断る</div>
              <div className="small">作業は増えないが、依頼主は残念に思う。</div>
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
