// アイコン（形で役割がわかるように描く）
// 構成図の中では <g> として、ほかの場所では小さな <svg> として使う。
// 座標は中心が (0,0)、だいたい -22〜22 の範囲。
import type { ReactNode } from 'react';
import type { NodeState, NodeType } from '../core/topology';

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };

/** 機器のアイコン */
export function NodeGlyph({ type }: { type: NodeType }) {
  switch (type) {
    case 'users': // パソコンとスマホ
      return (
        <g {...S}>
          <rect x={-21} y={-14} width={26} height={18} rx={2} />
          <path d="M-12 9h8M-8 4v5" />
          <rect x={9} y={-10} width={12} height={21} rx={2.5} />
          <path d="M13.5 7.5h3" />
        </g>
      );
    case 'internet': // 雲（インターネット）
      return (
        <g {...S}>
          <path d="M-14 10h28a8 8 0 0 0 0-16 11 11 0 0 0-21-3A9 9 0 0 0-14 10z" />
          <path d="M-6 3h12M-3 -1l-3 4 3 4M3 -1l3 4-3 4" strokeWidth={1.6} />
        </g>
      );
    case 'cdn': // 地球と配信拠点
      return (
        <g {...S}>
          <circle r={15} />
          <ellipse rx={6.5} ry={15} />
          <path d="M-15 0h30M-12-8h24M-12 8h24" strokeWidth={1.4} />
          <circle cx={15} cy={-13} r={3.2} fill="currentColor" />
          <circle cx={-15} cy={12} r={3.2} fill="currentColor" />
        </g>
      );
    case 'guard': // 盾
      return (
        <g {...S}>
          <path d="M0-19 15-13v10c0 10-6.5 17-15 21C-8.5 14-15 7-15-3v-10z" />
          <path d="M-6 0l4.5 4.5L7-5" />
        </g>
      );
    case 'lb': // ポートのある箱＋振り分けの矢印
      return (
        <g {...S}>
          <rect x={-20} y={-8} width={40} height={16} rx={3} />
          {[-13, -6, 1, 8].map((x) => (
            <rect key={x} x={x} y={-3} width={5} height={5} rx={1} strokeWidth={1.4} />
          ))}
          <path d="M0-8v-6M0-14l-10-5M0-14l10-5" strokeWidth={1.6} />
          <path d="M-10 8v6M10 8v6" strokeWidth={1.6} />
        </g>
      );
    case 'web': // ラック（サーバー）
      return (
        <g {...S}>
          <rect x={-15} y={-20} width={30} height={40} rx={3} />
          {[-12, -1, 10].map((y) => (
            <g key={y}>
              <rect x={-11} y={y - 1} width={22} height={8} rx={1.5} strokeWidth={1.4} />
              <circle cx={7} cy={y + 3} r={1.4} fill="currentColor" stroke="none" />
            </g>
          ))}
        </g>
      );
    case 'db': // 円柱（データベース）
      return <Cylinder />;
    case 'replica': // 円柱が2つ（コピー）
      return (
        <g>
          <g transform="translate(-5,-4) scale(0.78)" opacity={0.65}>
            <Cylinder />
          </g>
          <g transform="translate(5,4) scale(0.78)">
            <Cylinder />
          </g>
        </g>
      );
    case 'batch': // 四角い処理ブロック＋時計（夜間にまとめて処理）
      return (
        <g {...S}>
          <rect x={-17} y={-15} width={30} height={30} rx={3} />
          <path d="M-9-5h14M-9 1h10M-9 7h7" strokeWidth={1.5} />
          <circle cx={12} cy={10} r={8} fill="var(--node-bg)" />
          <path d="M12 5v5l3 2" strokeWidth={1.6} />
        </g>
      );
    case 'staff': // 業務端末（モニターとキーボード）
      return (
        <g {...S}>
          <rect x={-17} y={-17} width={34} height={22} rx={2} />
          <path d="M-5 5v5M5 5v5M-9 10h18" />
          <rect x={-19} y={13} width={38} height={6} rx={1.5} strokeWidth={1.4} />
        </g>
      );
    case 'backup': // 金庫（コピーを保管）
      return (
        <g {...S}>
          <rect x={-12} y={-19} width={30} height={32} rx={3} strokeWidth={1.4} opacity={0.55} />
          <rect x={-18} y={-13} width={30} height={32} rx={3} fill="var(--node-bg)" />
          <circle cx={-3} cy={3} r={7} />
          <path d="M-3-4v3M-3 7v3M-10 3h3M1 3h3" strokeWidth={1.5} />
          <path d="M8-6v18" strokeWidth={1.5} />
        </g>
      );
    case 'offsite': // 遠くの建物の金庫
      return (
        <g {...S}>
          <path d="M-19 19h38M-15 19V-6l15-10 15 10v25" />
          <rect x={-7} y={0} width={14} height={13} rx={2} />
          <circle cx={0} cy={6.5} r={3} strokeWidth={1.5} />
        </g>
      );
  }
}

function Cylinder() {
  return (
    <g {...S}>
      <ellipse cx={0} cy={-13} rx={16} ry={6} />
      <path d="M-16-13v26c0 3.3 7.2 6 16 6s16-2.7 16-6v-26" />
      <path d="M-16 0c0 3.3 7.2 6 16 6s16-2.7 16-6" strokeWidth={1.5} />
    </g>
  );
}

/** パーツのアイコン：CPU（チップ）・メモリ（モジュール）・記憶装置（ドライブ） */
export function PartGlyph({ type }: { type: 'cpu' | 'memory' | 'drive' | 'net' }) {
  if (type === 'cpu')
    return (
      <g {...S}>
        <rect x={-11} y={-11} width={22} height={22} rx={2.5} />
        <rect x={-5} y={-5} width={10} height={10} rx={1} strokeWidth={1.4} />
        {[-6, 0, 6].map((v) => (
          <path key={v} d={`M${v}-11v-5M${v} 11v5M-11 ${v}h-5M11 ${v}h5`} strokeWidth={1.5} />
        ))}
      </g>
    );
  if (type === 'memory')
    return (
      <g {...S}>
        <path d="M-19-8h38v13h-17l-2 3-2-3h-17z" />
        {[-14, -6, 2, 10].map((x) => (
          <rect key={x} x={x} y={-5} width={5} height={7} rx={0.8} strokeWidth={1.3} />
        ))}
      </g>
    );
  if (type === 'drive')
    return (
      <g {...S}>
        <rect x={-15} y={-11} width={30} height={22} rx={3} />
        <circle cx={-4} cy={0} r={6} strokeWidth={1.5} />
        <circle cx={-4} cy={0} r={1.4} fill="currentColor" stroke="none" />
        <path d="M6-5h5M6 0h5M6 5h5" strokeWidth={1.4} />
      </g>
    );
  return (
    <g {...S}>
      <path d="M-18 0h36M10-6l8 6-8 6M-10-6l-8 6 8 6" />
    </g>
  );
}

/** 小さな svg に包む */
export function Glyph({ children, size = 28, title }: { children: ReactNode; size?: number; title?: string }) {
  return (
    <svg className="glyph" width={size} height={size} viewBox="-24 -24 48 48" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

/** 状態の記号（色だけに頼らず、形でもわかるように） */
export function StateMark({ state, x = 0, y = 0, r = 9 }: { state: NodeState; x?: number; y?: number; r?: number }) {
  const cls = `mark-${state}`;
  const k = r / 9;
  return (
    <g transform={`translate(${x},${y}) scale(${k})`} className={cls}>
      <circle r={9} className="mark-bg" />
      {state === 'ok' && <path d="M-4 0l3 3 5-6" className="mark-fg" />}
      {state === 'busy' && <path d="M0-5v5M0 4v.5" className="mark-fg" />}
      {state === 'down' && <path d="M-3.5-3.5l7 7M3.5-3.5l-7 7" className="mark-fg" />}
      {state === 'attack' && <path d="M0-5.5 4.5-3.5v3c0 3-2 5-4.5 6.5C-2.5 4.5-4.5 2.5-4.5-.5v-3z" className="mark-fg" />}
      {state === 'off' && <path d="M-4 0h8" className="mark-fg" />}
    </g>
  );
}

export const STATE_WORD: Record<NodeState, string> = { ok: '正常', busy: '高負荷・要確認', down: '障害・緊急', attack: 'セキュリティ', off: '停止・なし' };

/** 左の一覧の種類アイコン */
export function KindGlyph({ kind }: { kind: 'case' | 'task' | 'alert' | 'request' | 'news' }) {
  return (
    <Glyph size={20}>
      <g {...S} strokeWidth={3}>
        {kind === 'case' && <path d="M-16-6h32v20h-32zM-7-6v-6h14v6" />}
        {kind === 'task' && <path d="M-14-16h28v32h-28zM-8-6l3 3 6-6M-8 8h16" />}
        {kind === 'alert' && <path d="M0-17 18 15h-36zM0-5v8M0 9v1" />}
        {kind === 'request' && <path d="M-17-13h34v22H-4l-9 8v-8h-4z" />}
        {kind === 'news' && <path d="M-16-14h26v28h-26zM10-6h6v18a2 2 0 0 1-6 0M-11-7h16M-11 0h16M-11 7h10" />}
      </g>
    </Glyph>
  );
}
