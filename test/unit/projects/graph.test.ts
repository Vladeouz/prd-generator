import { describe, expect, it } from 'vitest';
import { loadClaudeFixture } from '../../../src/claude/fake-runner.ts';
import {
  buildGraph,
  COLUMN_GAP,
  type GraphInput,
  type GraphNode,
  type GraphNodeData,
  ROW_GAP,
} from '../../../src/projects/graph.ts';
import { buildFeatureDraft } from '../../../src/stages/stage-4/features.ts';
import type { Stage4Output } from '../../../src/stages/stage-4/validate.ts';
import type { Stage7aOutput } from '../../../src/stages/stage-7a/validate.ts';
import type { Stage7bOutput, TaskDetail } from '../../../src/stages/stage-7b/validate.ts';

const stage4 = () => JSON.parse(loadClaudeFixture('stage4').result) as Stage4Output;
const list = () => JSON.parse(loadClaudeFixture('derived/stage7a-gym').result) as Stage7aOutput;
const detail = (phase: number) =>
  JSON.parse(loadClaudeFixture(`derived/stage7b-gym-fase-${phase}`).result) as Stage7bOutput;

const project = { name: 'Gym', idea: 'Aplikasi membership untuk sebuah gym.' };

function input(overrides: Partial<GraphInput> = {}, accepted: string[] = []): GraphInput {
  return {
    project,
    draft: buildFeatureDraft(stage4(), accepted),
    tasks: null,
    details: new Map(),
    ...overrides,
  };
}

const allDetails = (phases = [0, 1, 2, 3]) =>
  new Map(phases.flatMap((p) => detail(p).tasks.map((d) => [d.id, d] as const)));

const ofKind = <K extends GraphNodeData['kind']>(nodes: GraphNode[], kind: K) =>
  nodes.filter((n) => n.type === kind) as (GraphNode & {
    data: Extract<GraphNodeData, { kind: K }>;
  })[];

const byId = (nodes: GraphNode[], id: string) => {
  const node = nodes.find((n) => n.id === id);
  if (!node) throw new Error(`node ${id} tidak ada`);
  return node;
};

const children = (graph: ReturnType<typeof buildGraph>, id: string) =>
  graph.edges.filter((e) => e.source === id).map((e) => e.target);

describe('buildGraph: setelah tahap 4', () => {
  it('Proyek → Fase → Fitur → Sub-fitur dari fitur MVP, tanpa task', () => {
    const s4 = stage4();
    const graph = buildGraph(input());
    expect(ofKind(graph.nodes, 'project')).toHaveLength(1);
    expect(ofKind(graph.nodes, 'phase').map((n) => n.data.phase)).toEqual([0, 1, 2, 3]);
    expect(ofKind(graph.nodes, 'feature').map((n) => n.data.code)).toEqual(
      s4.phases.flatMap((p) => p.feature_ids),
    );
    const subs = s4.mvp_features.reduce((sum, f) => sum + f.sub_features.length, 0);
    expect(ofKind(graph.nodes, 'subfeature')).toHaveLength(subs);
    expect(ofKind(graph.nodes, 'task')).toHaveLength(0);
    expect(ofKind(graph.nodes, 'feature').every((n) => n.data.taskCount === null)).toBe(true);

    expect(children(graph, 'project')).toEqual(['phase-0', 'phase-1', 'phase-2', 'phase-3']);
    expect(children(graph, 'phase-2')).toEqual(['feature-F-05', 'feature-F-06', 'feature-F-09']);
    const f01 = s4.mvp_features.find((f) => f.id === 'F-01');
    expect(children(graph, 'feature-F-01')).toEqual(
      f01?.sub_features.map((_, i) => `sub-F-01-${i + 1}`),
    );
    expect(byId(graph.nodes, 'sub-F-01-1').data).toEqual({
      kind: 'subfeature',
      label: f01?.sub_features[0],
      feature: 'F-01',
    });
    expect(byId(graph.nodes, 'feature-F-01').data).toMatchObject({
      label: f01?.name,
      description: f01?.description,
      source: f01?.source,
      dependsOn: f01?.depends_on,
    });
  });

  it('hanya fitur rekomendasi yang diterima, dikelompokkan di bawah node sendiri', () => {
    const s4 = stage4();
    const [first, second] = s4.recommended_features;
    const without = buildGraph(input());
    expect(without.nodes.some((n) => n.id.startsWith('feature-R-'))).toBe(false);
    expect(without.nodes.some((n) => n.id === 'phase-rekomendasi')).toBe(false);

    const graph = buildGraph(input({}, [second?.id ?? '']));
    expect(children(graph, 'project').at(-1)).toBe('phase-rekomendasi');
    expect(children(graph, 'phase-rekomendasi')).toEqual([`feature-${second?.id}`]);
    expect(graph.nodes.some((n) => n.id === `feature-${first?.id}`)).toBe(false);
    expect(byId(graph.nodes, `feature-${second?.id}`).data).toMatchObject({
      source: 'rekomendasi',
      label: second?.name,
      description: second?.reason,
      taskCount: null,
    });
  });

  it('setiap node selain proyek punya tepat satu induk, dan induk tercatat sebelum anaknya', () => {
    const graph = buildGraph(input({ tasks: list(), details: allDetails() }));
    const position = new Map(graph.nodes.map((n, i) => [n.id, i]));
    expect(position.size).toBe(graph.nodes.length);
    expect(graph.nodes[0]?.id).toBe('project');
    for (const node of graph.nodes.slice(1)) {
      const parents = graph.edges.filter((e) => e.target === node.id);
      expect(parents, node.id).toHaveLength(1);
      expect(position.get(parents[0]?.source ?? '') ?? Infinity).toBeLessThan(
        position.get(node.id) ?? -1,
      );
    }
    expect(graph.edges).toHaveLength(graph.nodes.length - 1);
  });
});

describe('buildGraph: posisi deterministik', () => {
  it('data yang sama menghasilkan graf yang sama persis', () => {
    const full = { tasks: list(), details: allDetails() };
    expect(buildGraph(input(full))).toEqual(buildGraph(input(full)));
    expect(JSON.stringify(buildGraph(input()))).toBe(JSON.stringify(buildGraph(input())));
  });

  it('kolom per kedalaman, satu baris per daun, dan induk di tengah anaknya', () => {
    const graph = buildGraph(input());
    const x = (id: string) => byId(graph.nodes, id).position.x;
    const y = (id: string) => byId(graph.nodes, id).position.y;
    expect([x('project'), x('phase-0'), x('feature-F-01'), x('sub-F-01-1')]).toEqual([
      0,
      COLUMN_GAP,
      2 * COLUMN_GAP,
      3 * COLUMN_GAP,
    ]);
    // Daun berurutan dari atas: sub-fitur F-01 menempati baris 0 dan seterusnya.
    const leaves = graph.nodes.filter((n) => !graph.edges.some((e) => e.source === n.id));
    expect(leaves.map((n) => n.position.y)).toEqual(leaves.map((_, i) => i * ROW_GAP));
    expect(y('sub-F-01-1')).toBe(0);
    const f01 = children(graph, 'feature-F-01');
    expect(y('feature-F-01')).toBe((y(f01[0] ?? '') + y(f01.at(-1) ?? '')) / 2);
    const phase0 = children(graph, 'phase-0');
    expect(y('phase-0')).toBe((y(phase0[0] ?? '') + y(phase0.at(-1) ?? '')) / 2);
    // Tidak ada dua node di kolom yang sama dengan posisi y yang sama.
    const keys = graph.nodes.map((n) => `${n.position.x}:${n.position.y}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('buildGraph: setelah tahap 7a dan 7b', () => {
  it('task di bawah fiturnya dengan jumlah task per fitur dan per fase', () => {
    const tasks = list();
    const graph = buildGraph(input({ tasks }));
    expect(ofKind(graph.nodes, 'task')).toHaveLength(tasks.tasks.length);
    for (const feature of ofKind(graph.nodes, 'feature')) {
      const own = tasks.tasks.filter((t) => t.feature === feature.data.code);
      expect(feature.data.taskCount, feature.data.code).toBe(own.length);
      expect(children(graph, feature.id).filter((id) => id.startsWith('task-'))).toEqual(
        own.map((t) => `task-${t.id}`),
      );
    }
    for (const phase of ofKind(graph.nodes, 'phase')) {
      expect(phase.data.taskCount).toBe(
        tasks.tasks.filter((t) => t.phase === phase.data.phase).length,
      );
    }
    // Sub-fitur tetap di depan task.
    const f01 = children(graph, 'feature-F-01');
    expect(f01.findIndex((id) => id.startsWith('task-'))).toBeGreaterThan(
      f01.findLastIndex((id) => id.startsWith('sub-')),
    );
  });

  it('task tanpa fitur (hapus notes) di bawah fasenya', () => {
    const tasks = list();
    const removal = tasks.tasks.find((t) => t.feature === null);
    expect(removal).toBeDefined();
    const graph = buildGraph(input({ tasks }));
    expect(children(graph, `phase-${removal?.phase}`).at(-1)).toBe(`task-${removal?.id}`);
  });

  it('rincian task dari 7b bila fasenya selesai, null bila belum', () => {
    const tasks = list();
    const graph = buildGraph(input({ tasks, details: allDetails([0]) }));
    const phase0 = tasks.tasks.find((t) => t.phase === 0);
    const phase1 = tasks.tasks.find((t) => t.phase === 1);
    const expected = detail(0).tasks.find((d) => d.id === phase0?.id) as TaskDetail;
    expect(byId(graph.nodes, `task-${phase0?.id}`).data).toEqual({
      kind: 'task',
      label: phase0?.title,
      code: phase0?.id,
      phase: 0,
      layer: phase0?.layer,
      dependsOn: phase0?.depends_on,
      refs: phase0?.refs,
      detail: { files: expected.files, done_when: expected.done_when, manual: expected.manual },
    });
    expect(byId(graph.nodes, `task-${phase1?.id}`).data).toMatchObject({ detail: null });
  });

  it('task fitur rekomendasi di bawah fitur rekomendasinya', () => {
    const tasks = list();
    const [rec] = stage4().recommended_features;
    const extra = { ...(tasks.tasks[1] as Stage7aOutput['tasks'][number]) };
    const added = { ...extra, id: 'T-099', title: 'Fitur rekomendasi', feature: rec?.id ?? null };
    const graph = buildGraph(input({ tasks: { tasks: [...tasks.tasks, added] } }, [rec?.id ?? '']));
    expect(children(graph, `feature-${rec?.id}`)).toEqual(['task-T-099']);
    expect(byId(graph.nodes, `feature-${rec?.id}`).data).toMatchObject({ taskCount: 1 });
    expect(byId(graph.nodes, 'phase-rekomendasi').data).toMatchObject({ taskCount: 1 });
  });
});
