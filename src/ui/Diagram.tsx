// システム構成図（司令室の中央）
// 機器をアイコンで並べ、線でつなぐ。データの流れを青い点のアニメーションで見せ、
// 混雑（黄）・障害（赤）・セキュリティ（紫）・停止（灰）を色と記号と文字で表す。
import { useEffect, useRef } from 'react';
import type { Topology, TopoEdge, TopoNode } from '../core/topology';
import { useGame } from './common';
import { NodeGlyph, StateMark, STATE_WORD } from './Icons';

const R = 28; // アイコンの箱の半分の大きさ

function edgePath(a: TopoNode, b: TopoNode): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dy) < 4) {
    const s = Math.sign(dx) || 1;
    return `M${a.x + s * R} ${a.y} L${b.x - s * R} ${b.y}`;
  }
  if (Math.abs(dx) < 4) {
    const s = Math.sign(dy) || 1;
    return `M${a.x} ${a.y + s * R} L${b.x} ${b.y - s * (R + 2)}`;
  }
  // 横に離れているときは、なめらかな曲線でつなぐ
  const sx = Math.sign(dx);
  const x1 = a.x + sx * R;
  const x2 = b.x - sx * R;
  const mx = (x1 + x2) / 2;
  return `M${x1} ${a.y} C${mx} ${a.y} ${mx} ${b.y} ${x2} ${b.y}`;
}

const pctText = (u: number | undefined) => (u === undefined ? '' : `使用率 ${Math.round(u * 100)}%`);

export function Diagram({ topo, related = [], onSelect, height }: { topo: Topology; related?: string[]; onSelect?: (id: string) => void; height?: number }) {
  const { mode, frozen, sel } = useGame();
  const ref = useRef<SVGSVGElement>(null);
  const hl = new Set(related);
  const selected = sel?.kind === 'node' ? sel.id : null;
  if (selected) hl.add(selected);
  const focus = hl.size > 0;

  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    if (frozen) svg.pauseAnimations();
    else svg.unpauseAnimations();
  }, [frozen, topo]);

  const byId = new Map(topo.nodes.map((n) => [n.id, n]));

  if (!topo.nodes.length)
    return (
      <div className="diagram empty">
        <div className="muted">{topo.caption}</div>
      </div>
    );

  return (
    <div className="diagram">
      <div className="diagram-head">
        <span className="small">{topo.caption}</span>
        {frozen && <span className="badge">⏸ 一時停止中（データの流れも止まっています）</span>}
      </div>
      <div className="diagram-scroll">
        <svg ref={ref} viewBox="0 0 1000 505" style={height ? { maxHeight: height } : undefined} role="group" aria-label="システム構成図">
          <defs>
            <pattern id="grid" width="25" height="25" patternUnits="userSpaceOnUse">
              <path d="M25 0H0V25" fill="none" stroke="var(--grid)" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="1000" height="505" fill="url(#grid)" opacity={0.6} />
          {topo.zone && (
            <g className="zone">
              <rect x={topo.zone.x} y={topo.zone.y} width={topo.zone.w} height={topo.zone.h} rx={14} />
              <text x={topo.zone.x + 12} y={topo.zone.y + 18}>
                {topo.zone.label}
              </text>
            </g>
          )}
          {topo.edges.map((e) => {
            const a = byId.get(e.from);
            const b = byId.get(e.to);
            if (!a || !b) return null;
            return <Edge key={e.id} e={e} d={edgePath(a, b)} hl={hl.has(e.from) && hl.has(e.to)} dim={focus && !(hl.has(e.from) || hl.has(e.to))} detail={mode === 'detail'} />;
          })}
          {topo.nodes.map((n) => (
            <Node key={n.id} n={n} hl={hl.has(n.id)} dim={focus && !hl.has(n.id)} sel={selected === n.id} detail={mode === 'detail'} onSelect={onSelect} />
          ))}
        </svg>
      </div>
      <Legend />
    </div>
  );
}

function Edge({ e, d, hl, dim, detail }: { e: TopoEdge; d: string; hl: boolean; dim: boolean; detail: boolean }) {
  const down = e.state === 'down';
  const dots = down ? 0 : Math.max(1, Math.min(5, Math.round(1 + e.load * 4)));
  // 混んでいる線ほど点が多く、ゆっくり進む（詰まっている様子）
  const dur = e.kind === 'backup' ? 4 : e.state === 'busy' ? 3.2 : 2.2;
  return (
    <g className={`edge k-${e.kind} st-${e.state} ${hl ? 'hl' : ''} ${dim ? 'dim' : ''}`}>
      <path d={d} className="edge-line" strokeWidth={1.6 + Math.min(1, e.load) * 3} />
      {Array.from({ length: dots }, (_, i) => (
        <circle key={i} r={e.kind === 'backup' ? 3 : 3.6} className="flow-dot">
          <animateMotion dur={`${dur}s`} repeatCount="indefinite" begin={`-${((i * dur) / dots).toFixed(2)}s`} path={d} />
        </circle>
      ))}
      {down && <EdgeMark d={d} />}
      {detail && e.label && <EdgeLabel d={d} text={e.label} />}
    </g>
  );
}

/** パスのだいたい真ん中の座標（始点と終点の中点） */
function mid(d: string) {
  const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
  return { x: (nums[0] + nums[nums.length - 2]) / 2, y: (nums[1] + nums[nums.length - 1]) / 2 };
}

function EdgeMark({ d }: { d: string }) {
  const m = mid(d);
  return <StateMark state="down" x={m.x} y={m.y} r={8} />;
}

function EdgeLabel({ d, text }: { d: string; text: string }) {
  const m = mid(d);
  return (
    <text x={m.x} y={m.y - 7} className="edge-label" textAnchor="middle">
      {text}
    </text>
  );
}

function Node({ n, hl, dim, sel, detail, onSelect }: { n: TopoNode; hl: boolean; dim: boolean; sel: boolean; detail: boolean; onSelect?: (id: string) => void }) {
  const alert = n.state === 'busy' || n.state === 'down' || (n.state === 'attack' && !!n.incident);
  const line3 = detail && n.util !== undefined ? `${pctText(n.util)}・${n.stateText ?? ''}` : (n.stateText ?? '');
  return (
    <g
      className={`node st-${n.state} ${hl ? 'hl' : ''} ${dim ? 'dim' : ''} ${sel ? 'sel' : ''} ${alert ? 'alert' : ''}`}
      transform={`translate(${n.x},${n.y})`}
      role="button"
      tabIndex={0}
      aria-label={`${n.label}：${n.stateText ?? STATE_WORD[n.state]}`}
      onClick={() => onSelect?.(n.id)}
      onKeyDown={(ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          onSelect?.(n.id);
        }
      }}
    >
      <circle r={44} className="hit" />
      {alert && <circle r={36} className="halo" />}
      {(hl || sel) && <rect x={-R - 6} y={-R - 6} width={2 * R + 12} height={2 * R + 12} rx={18} className="ring" />}
      {(n.count ?? 1) > 1 && <rect x={-R + 5} y={-R - 5} width={2 * R} height={2 * R} rx={14} className="node-bg back" />}
      <rect x={-R} y={-R} width={2 * R} height={2 * R} rx={14} className="node-bg" />
      <g className="node-icon">
        <NodeGlyph type={n.type} />
      </g>
      <StateMark state={n.state} x={R - 2} y={-R + 2} />
      {(n.count ?? 1) > 1 && (
        <g transform={`translate(${-R + 2},${-R + 2})`} className="count">
          <rect x={-13} y={-9} width={26} height={18} rx={9} />
          <text y={4} textAnchor="middle">
            ×{n.count}
          </text>
        </g>
      )}
      <text y={R + 17} className="node-label" textAnchor="middle">
        {n.label}
      </text>
      <text y={R + 31} className="node-sub" textAnchor="middle">
        {n.sub}
      </text>
      {line3 && (
        <text y={R + 45} className="node-state" textAnchor="middle">
          {line3}
        </text>
      )}
    </g>
  );
}

function Legend() {
  const items: { cls: string; text: string; state?: 'ok' | 'busy' | 'down' | 'attack' | 'off' }[] = [
    { cls: 'data', text: 'データ・通信の流れ' },
    { cls: 'ok', text: '正常', state: 'ok' },
    { cls: 'busy', text: '高負荷・要確認', state: 'busy' },
    { cls: 'down', text: '障害・緊急', state: 'down' },
    { cls: 'attack', text: 'セキュリティ', state: 'attack' },
    { cls: 'off', text: '停止・なし', state: 'off' },
  ];
  return (
    <div className="diagram-legend">
      {items.map((i) => (
        <span key={i.cls}>
          {i.state ? (
            <svg width={16} height={16} viewBox="-10 -10 20 20" aria-hidden>
              <StateMark state={i.state} />
            </svg>
          ) : (
            <i className="lg-flow" />
          )}
          {i.text}
        </span>
      ))}
      <span className="muted">機器を選ぶと、詳しい説明が出ます</span>
    </div>
  );
}
