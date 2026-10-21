'use client';

// Node kustom flowchart: satu komponen untuk semua jenis, dibedakan lewat garis kiri dan label.
// Warna hanya dari token desain. Handle disembunyikan karena graf tidak bisa disambung user.
import { Handle, type NodeProps, Position, type Node as RfNode } from '@xyflow/react';
import type { GraphNodeData, GraphNodeKind } from '../../projects/graph.ts';
import { KIND_LABELS, nodeCode, taskCountText } from './node-detail.tsx';

export type FlowNode = RfNode<GraphNodeData, GraphNodeKind>;

const ACCENTS: Record<GraphNodeKind, string> = {
  project: 'border-l-accent',
  phase: 'border-l-accent',
  feature: 'border-l-success',
  subfeature: 'border-l-line',
  task: 'border-l-medium',
};

export function GraphNode({ data, selected }: NodeProps<FlowNode>) {
  const code = nodeCode(data);
  const count =
    (data.kind === 'phase' || data.kind === 'feature') && data.taskCount !== null
      ? data.taskCount
      : null;
  return (
    <div
      className={[
        'flex w-60 flex-col gap-1 rounded-control border border-l-4 bg-surface px-3 py-2 text-left',
        selected ? 'border-accent' : 'border-line',
        ACCENTS[data.kind],
      ].join(' ')}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} className="opacity-0" />
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="font-bold uppercase tracking-[0.06em] text-ink-muted">
          {KIND_LABELS[data.kind]}
          {code && <span className="ml-1.5 font-mono font-semibold text-accent">{code}</span>}
        </span>
        {count !== null && (
          <span className="font-mono text-ink-muted" data-testid="node-task-count">
            {taskCountText(count)}
          </span>
        )}
      </div>
      <span className="line-clamp-2 text-[13px] font-semibold leading-snug text-ink">
        {data.label}
      </span>
      <Handle type="source" position={Position.Right} isConnectable={false} className="opacity-0" />
    </div>
  );
}
