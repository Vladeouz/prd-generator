// Data flowchart fitur (FR-12, D-13, `GET /api/projects/{id}/graph`), disusun dari data tersimpan
// tanpa pemanggilan `claude`:
// - Proyek → Fase → Fitur → Sub-fitur dari tahap 4, hanya fitur MVP dan rekomendasi yang diterima
//   (`featureDraft`). Rekomendasi belum punya fase, jadi dikelompokkan di bawah node sendiri;
// - setelah tahap 7a selesai, task tampil di bawah fiturnya dan fitur menyebut jumlah task-nya.
//   Task tanpa fitur (hapus notes) tampil di bawah fasenya;
// - rincian task (`files`, *done when*, langkah manual) dari tahap 7b yang berlaku, per fase.
// Posisi dihitung di sini, bukan di browser, agar sama untuk data yang sama: graf pohon dari kiri ke
// kanan, setiap daun satu baris, dan induk di tengah anak pertama dan terakhirnya.
import { eq } from 'drizzle-orm';
import type { Db } from '../core/db/client.ts';
import { projects } from '../core/db/schema.ts';
import { AppError } from '../core/errors.ts';
import { handle } from '../core/http.ts';
import { currentOutput } from '../stages/run-stage.ts';
import { type FeatureDraft, featureDraft } from '../stages/stage-4/features.ts';
import type { Stage7aOutput, Stage7aTask } from '../stages/stage-7a/validate.ts';
import type { Stage7bOutput, TaskDetail } from '../stages/stage-7b/validate.ts';

export type GraphNodeData =
  | { kind: 'project'; label: string; idea: string }
  | {
      kind: 'phase';
      label: string;
      /** Null untuk kelompok fitur rekomendasi yang diterima. */
      phase: number | null;
      goal: string;
      taskCount: number | null;
    }
  | {
      kind: 'feature';
      label: string;
      code: string;
      source: 'user' | 'fondasi' | 'rekomendasi';
      description: string;
      subFeatures: string[];
      dependsOn: string[];
      /** Null sebelum tahap 7a selesai. */
      taskCount: number | null;
    }
  | { kind: 'subfeature'; label: string; feature: string }
  | {
      kind: 'task';
      label: string;
      code: string;
      phase: number;
      layer: string;
      dependsOn: string[];
      refs: string[];
      /** Null sebelum tahap 7b fase task ini selesai. */
      detail: Omit<TaskDetail, 'id'> | null;
    };

export type GraphNodeKind = GraphNodeData['kind'];

export type GraphNode = {
  id: string;
  type: GraphNodeKind;
  position: { x: number; y: number };
  data: GraphNodeData;
};

export type GraphEdge = { id: string; source: string; target: string };

export type ProjectGraph = { nodes: GraphNode[]; edges: GraphEdge[] };

/** Jarak antarkolom (kedalaman) dan antarbaris (daun), dalam piksel graf. */
export const COLUMN_GAP = 300;
export const ROW_GAP = 88;

type Tree = { id: string; data: GraphNodeData; children: Tree[] };

export type GraphInput = {
  project: { name: string; idea: string };
  draft: FeatureDraft;
  /** Daftar task 7a yang berlaku, atau null. */
  tasks: Stage7aOutput | null;
  /** Rincian 7b yang berlaku per id task. */
  details: Map<string, TaskDetail>;
};

function taskTree(task: Stage7aTask, details: Map<string, TaskDetail>): Tree {
  const found = details.get(task.id);
  const detail = found
    ? { files: found.files, done_when: found.done_when, manual: found.manual }
    : null;
  return {
    id: `task-${task.id}`,
    data: {
      kind: 'task',
      label: task.title,
      code: task.id,
      phase: task.phase,
      layer: task.layer,
      dependsOn: task.depends_on,
      refs: task.refs,
      detail,
    },
    children: [],
  };
}

function featureTree(
  feature: {
    id: string;
    name: string;
    source: 'user' | 'fondasi' | 'rekomendasi';
    description: string;
    subFeatures: string[];
    dependsOn: string[];
  },
  { tasks, details }: Pick<GraphInput, 'tasks' | 'details'>,
): Tree {
  const own = tasks ? tasks.tasks.filter((task) => task.feature === feature.id) : [];
  return {
    id: `feature-${feature.id}`,
    data: {
      kind: 'feature',
      label: feature.name,
      code: feature.id,
      source: feature.source,
      description: feature.description,
      subFeatures: feature.subFeatures,
      dependsOn: feature.dependsOn,
      taskCount: tasks ? own.length : null,
    },
    children: [
      ...feature.subFeatures.map((label, i) => ({
        id: `sub-${feature.id}-${i + 1}`,
        data: { kind: 'subfeature' as const, label, feature: feature.id },
        children: [],
      })),
      ...own.map((task) => taskTree(task, details)),
    ],
  };
}

function graphTree({ project, draft, tasks, details }: GraphInput): Tree {
  const features = new Map(draft.mvp_features.map((feature) => [feature.id, feature]));
  const known = new Set([
    ...features.keys(),
    ...draft.accepted_recommendations.map((feature) => feature.id),
  ]);
  const phases: Tree[] = [...draft.phases]
    .sort((a, b) => a.phase - b.phase)
    .map((phase) => {
      // Task tanpa fitur tahap 4 yang dikenal (hapus notes) menggantung di fasenya.
      const loose = (tasks?.tasks ?? []).filter(
        (task) => task.phase === phase.phase && (task.feature === null || !known.has(task.feature)),
      );
      const children = phase.feature_ids.flatMap((id) => {
        const feature = features.get(id);
        if (!feature) return [];
        return [
          featureTree(
            {
              id: feature.id,
              name: feature.name,
              source: feature.source,
              description: feature.description,
              subFeatures: feature.sub_features,
              dependsOn: feature.depends_on,
            },
            { tasks, details },
          ),
        ];
      });
      return {
        id: `phase-${phase.phase}`,
        data: {
          kind: 'phase',
          label: phase.name,
          phase: phase.phase,
          goal: phase.goal,
          taskCount: tasks ? tasks.tasks.filter((task) => task.phase === phase.phase).length : null,
        },
        children: [...children, ...loose.map((task) => taskTree(task, details))],
      };
    });

  const recommended = draft.accepted_recommendations;
  if (recommended.length > 0) {
    const own = new Set(recommended.map((feature) => feature.id));
    phases.push({
      id: 'phase-rekomendasi',
      data: {
        kind: 'phase',
        label: 'Fitur rekomendasi yang diterima',
        phase: null,
        goal: 'Fitur tambahan yang kamu centang di struktur fitur. Fasenya ditentukan daftar task.',
        taskCount: tasks
          ? tasks.tasks.filter((task) => task.feature !== null && own.has(task.feature)).length
          : null,
      },
      children: recommended.map((feature) =>
        featureTree(
          {
            id: feature.id,
            name: feature.name,
            source: 'rekomendasi',
            description: feature.reason,
            subFeatures: [],
            dependsOn: [],
          },
          { tasks, details },
        ),
      ),
    });
  }

  return {
    id: 'project',
    data: { kind: 'project', label: project.name, idea: project.idea },
    children: phases,
  };
}

/** Graf pohon dengan posisi deterministik (lihat komentar modul). */
export function buildGraph(input: GraphInput): ProjectGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  let row = 0;
  // Node dicatat sebelum anaknya (urutan baca dan urutan Tab), lalu y diisi setelah anaknya
  // ditempatkan. Daun mengambil baris berikutnya.
  const place = (tree: Tree, depth: number): number => {
    const node: GraphNode = {
      id: tree.id,
      type: tree.data.kind,
      position: { x: depth * COLUMN_GAP, y: 0 },
      data: tree.data,
    };
    nodes.push(node);
    const ys = tree.children.map((child) => {
      edges.push({ id: `${tree.id}->${child.id}`, source: tree.id, target: child.id });
      return place(child, depth + 1);
    });
    const first = ys[0];
    const last = ys.at(-1);
    node.position.y =
      first === undefined || last === undefined ? row++ * ROW_GAP : (first + last) / 2;
    return node.position.y;
  };
  place(graphTree(input), 0);
  return { nodes, edges };
}

/** Graf proyek dari data tersimpan; null bila tahap 4 belum punya output yang berlaku. */
export function projectGraph({ db }: { db: Db }, projectId: string): ProjectGraph | null {
  const project = db
    .select({ name: projects.name, idea: projects.idea })
    .from(projects)
    .where(eq(projects.id, projectId))
    .get();
  if (!project) throw new AppError('NOT_FOUND', 'Proyek tidak ditemukan.');
  const draft = featureDraft(db, projectId);
  if (!draft) return null;
  const tasks = currentOutput<Stage7aOutput>(db, projectId, 'stage7a');
  const details = new Map<string, TaskDetail>();
  if (tasks) {
    for (const phase of new Set(tasks.tasks.map((task) => task.phase))) {
      const output = currentOutput<Stage7bOutput>(db, projectId, 'stage7b', String(phase));
      for (const detail of output?.tasks ?? []) details.set(detail.id, detail);
    }
  }
  return buildGraph({ project, draft, tasks, details });
}

/** Isi route handler `GET /api/projects/{id}/graph`: 200 `{ nodes, edges }`; 409 sebelum tahap 4. */
export function graphHandlers(deps: { db: Db }) {
  return {
    get: (projectId: string) =>
      handle(() => {
        const graph = projectGraph(deps, projectId);
        if (!graph) {
          throw new AppError('CONFLICT', 'Flowchart tersedia setelah struktur fitur selesai.');
        }
        return Response.json(graph);
      }),
  };
}
