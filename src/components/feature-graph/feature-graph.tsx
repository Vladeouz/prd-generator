'use client';

// Flowchart fitur (FR-12, D-13) dengan React Flow. Data dan posisi dari `projectGraph` (server),
// jadi komponen ini hanya menampilkan: geser dan zoom, tombol "Pas ke layar", dan panel detail
// untuk node yang dipilih dengan klik atau keyboard (Tab ke node, lalu Enter atau Spasi; Escape
// membatalkan pilihan).
import '@xyflow/react/dist/style.css';
import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  type OnSelectionChangeFunc,
  ReactFlow,
} from '@xyflow/react';
import { useCallback, useMemo, useState } from 'react';
import type { GraphNodeData, ProjectGraph } from '../../projects/graph.ts';
import { Card } from '../ui/card.tsx';
import { type FlowNode, GraphNode } from './graph-node.tsx';
import { NodeDetail, nodeAriaLabel } from './node-detail.tsx';

const NODE_TYPES = {
  project: GraphNode,
  phase: GraphNode,
  feature: GraphNode,
  subfeature: GraphNode,
  task: GraphNode,
};

const ARIA_LABELS = {
  'node.a11yDescription.default':
    'Tekan Enter atau Spasi untuk memilih node dan melihat detailnya. Tekan Escape untuk membatalkan.',
  'node.a11yDescription.keyboardDisabled':
    'Tekan Enter atau Spasi untuk memilih node dan melihat detailnya.',
  'edge.a11yDescription.default': 'Garis penghubung node.',
  'controls.ariaLabel': 'Kontrol flowchart',
  'controls.zoomIn.ariaLabel': 'Perbesar',
  'controls.zoomOut.ariaLabel': 'Perkecil',
  'controls.fitView.ariaLabel': 'Pas ke layar',
};

export function FeatureGraph({ graph }: { graph: ProjectGraph }) {
  const nodes = useMemo<FlowNode[]>(
    () =>
      graph.nodes.map((node) => ({
        ...node,
        ariaLabel: nodeAriaLabel(node.data),
        draggable: false,
        connectable: false,
      })),
    [graph],
  );
  const edges = useMemo<Edge[]>(
    () => graph.edges.map((edge) => ({ ...edge, type: 'smoothstep', focusable: false })),
    [graph],
  );
  const [selected, setSelected] = useState<GraphNodeData | null>(null);
  // Wajib stabil (dokumentasi React Flow), karena dipasang sebagai listener store.
  const onSelectionChange = useCallback<OnSelectionChangeFunc<FlowNode>>(({ nodes }) => {
    setSelected(nodes[0]?.data ?? null);
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <div
        className="h-[440px] overflow-hidden rounded-panel border border-line-subtle sm:h-[560px]"
        data-testid="feature-graph"
      >
        <ReactFlow<FlowNode>
          defaultNodes={nodes}
          defaultEdges={edges}
          nodeTypes={NODE_TYPES}
          onSelectionChange={onSelectionChange}
          nodesDraggable={false}
          nodesConnectable={false}
          edgesFocusable={false}
          multiSelectionKeyCode={null}
          selectionKeyCode={null}
          deleteKeyCode={null}
          minZoom={0.1}
          fitView
          ariaLabelConfig={ARIA_LABELS}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} />
          <Controls showInteractive={false} position="top-right" />
        </ReactFlow>
      </div>
      <Card as="section" aria-label="Detail node" aria-live="polite">
        <NodeDetail data={selected} />
      </Card>
    </div>
  );
}
