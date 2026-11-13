// 画面で共通して使う部品（用語リンク、メーター、グラフ、モーダルなど）
import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Action } from '../core/game';
import { termById } from '../core/glossary';
import type { GameState } from '../core/types';

import type { Screen } from '../core/issues';
export type { Screen };
export type Mode = 'easy' | 'detail';
/** 司令室で選んでいるもの（左の項目か、構成図の機器） */
export type Selection = { kind: 'issue'; id: string } | { kind: 'node'; id: string } | null;

export interface Ctx {
  s: GameState;
  dispatch: (a: Action) => void;
  openTerm: (id: string) => void;
  mode: Mode; // かんたん表示／詳細表示
  screen: Screen;
  setScreen: (s: Screen) => void;
  sel: Selection;
  setSel: (s: Selection) => void;
  frozen: boolean; // 一時停止中（アニメーションも止める）
}

/** 用語の説明の最初の一文（短い説明として横に添える） */
export function shortTerm(id: string): string {
  const t = termById(id);
  if (!t) return '';
  const i = t.text.indexOf('。');
  return i >= 0 ? t.text.slice(0, i + 1) : t.text;
}

/** 用語＋短い説明（例：冗長化 — 機器が故障しても…） */
export function TermNote({ id }: { id: string }) {
  const t = termById(id);
  if (!t) return null;
  return (
    <div className="termnote">
      <T id={id} />
      <span>{shortTerm(id)}</span>
    </div>
  );
}

export const GameCtx = createContext<Ctx>(null!);
export const useGame = () => useContext(GameCtx);

/** 用語へのリンク。クリックすると説明が開き、用語集に登録される */
export function T({ id, children }: { id: string; children?: ReactNode }) {
  const { s, openTerm } = useGame();
  const t = termById(id);
  if (!t) return <>{children}</>;
  return (
    <span
      role="button"
      tabIndex={0}
      className={`term ${s.knownTerms.includes(id) ? "known" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        openTerm(id);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.stopPropagation();
          openTerm(id);
        }
      }}
      title="クリックで用語の説明"
    >
      {children ?? t.name}
    </span>
  );
}

/** 関係する用語の一覧（小さく表示） */
export function TermList({ ids }: { ids?: string[] }) {
  if (!ids?.length) return null;
  return (
    <span className="tiny muted">
      関連用語：
      {ids.map((id, i) => (
        <span key={id}>
          {i > 0 && '・'}
          <T id={id} />
        </span>
      ))}
    </span>
  );
}

export function Meter({ value, max = 100, tone }: { value: number; max?: number; tone?: 'good' | 'warn' | 'bad' }) {
  const p = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={`meter ${tone ?? ''}`} role="meter" aria-valuenow={value} aria-valuemax={max}>
      <div style={{ width: `${p}%` }} />
    </div>
  );
}

export const satTone = (v: number) => (v >= 70 ? 'good' : v >= 40 ? 'warn' : 'bad');

export function Modal({ children, onClose, wide }: { children: ReactNode; onClose?: () => void; wide?: boolean }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className={`modal ${wide ? 'wide' : ''}`} onClick={(e) => e.stopPropagation()} role="dialog">
        {children}
      </div>
    </div>
  );
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.v} className={o.v === value ? 'on' : ''} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const man = (n: number) => `${Math.round(n).toLocaleString('ja-JP')}万円`;

// ------------------------------------------------------------
// 折れ線グラフ（ホバーで値を表示）
// ------------------------------------------------------------
export interface Series {
  name: string;
  values: number[];
  color: string; // CSS 変数名（例 'var(--series-1)'）
  dashed?: boolean;
}

export function LineChart({
  series,
  labels,
  format = (v) => v.toFixed(1),
  height = 160,
  yMax,
  refLine,
}: {
  series: Series[];
  labels: string[];
  format?: (v: number) => string;
  height?: number;
  yMax?: number;
  refLine?: { value: number; label: string };
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 520;
  const H = height;
  const padL = 44;
  const padR = 12;
  const padT = 10;
  const padB = 24;
  const n = Math.max(1, labels.length);
  const all = series.flatMap((s) => s.values).filter(Number.isFinite);
  const max = yMax ?? Math.max(1e-9, ...all, refLine?.value ?? 0) * 1.1;
  const x = (i: number) => padL + (n === 1 ? (W - padL - padR) / 2 : (i * (W - padL - padR)) / (n - 1));
  const y = (v: number) => padT + (1 - Math.min(v, max) / max) * (H - padT - padB);
  const ticks = [0, 0.5, 1].map((f) => f * max);

  return (
    <div className="chart">
      {series.length > 1 && (
        <div className="legend">
          {series.map((s) => (
            <span key={s.name}>
              <i style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">
              {format(t)}
            </text>
          </g>
        ))}
        {refLine && (
          <g>
            <line x1={padL} x2={W - padR} y1={y(refLine.value)} y2={y(refLine.value)} stroke="var(--axis)" strokeDasharray="4 4" strokeWidth={1.5} />
            <text x={W - padR} y={y(refLine.value) - 4} textAnchor="end" fontSize={11} fill="var(--text-2)">
              {refLine.label}
            </text>
          </g>
        )}
        {labels.map((l, i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--muted)">
            {n > 12 && i % 2 ? '' : l}
          </text>
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} stroke="var(--axis)" strokeWidth={1} />}
        {series.map((s) => (
          <g key={s.name}>
            <polyline
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={s.dashed ? '5 4' : undefined}
              points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
            />
            {s.values.map((v, i) => (
              <circle key={i} cx={x(i)} cy={y(v)} r={hover === i ? 5 : 3} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
            ))}
          </g>
        ))}
        {labels.map((_, i) => (
          <rect
            key={i}
            x={x(i) - (W - padL - padR) / n / 2}
            y={0}
            width={(W - padL - padR) / n}
            height={H}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
      </svg>
      {hover !== null && (
        <div className="tip" style={{ left: `${(x(hover) / W) * 100}%`, top: 0, transform: `translateX(${hover > n / 2 ? '-105%' : '5%'})` }}>
          <div style={{ fontWeight: 700 }}>{labels[hover]}</div>
          {series.map((s) => (
            <div key={s.name}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: s.color, marginRight: 5 }} />
              {s.name}：{format(s.values[hover])}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
