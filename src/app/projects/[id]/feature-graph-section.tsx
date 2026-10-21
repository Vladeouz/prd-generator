import { FeatureGraph } from '../../../components/feature-graph/feature-graph.tsx';
import type { ProjectGraph } from '../../../projects/graph.ts';

/** Flowchart fitur (FR-12) di layar tahap 4 dan 7; tidak tampil sebelum tahap 4 selesai. */
export function FeatureGraphSection({
  graph,
  description,
}: {
  graph: ProjectGraph | null | undefined;
  description: string;
}) {
  if (!graph) return null;
  return (
    <section
      aria-labelledby="graph-title"
      className="flex flex-col gap-3"
      data-testid="graph-section"
    >
      <div className="flex flex-col gap-1">
        <h2 id="graph-title" className="text-lg font-bold">
          Flowchart fitur
        </h2>
        <p className="text-sm text-ink-muted">{description}</p>
      </div>
      <FeatureGraph graph={graph} />
    </section>
  );
}

export const hasTasks = (graph: ProjectGraph | null | undefined) =>
  graph?.nodes.some((node) => node.type === 'task') ?? false;
