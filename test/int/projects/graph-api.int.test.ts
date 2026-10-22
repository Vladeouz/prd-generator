// `GET /api/projects/{id}/graph` (FR-12): graf dari data tahap 4 dan 7 yang tersimpan, tanpa
// pemanggilan `claude` tambahan.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Clock } from '../../../src/core/clock.ts';
import type { GraphNode, ProjectGraph } from '../../../src/projects/graph.ts';
import { graphHandlers } from '../../../src/projects/graph.ts';
import type { Stage4Output } from '../../../src/stages/stage-4/validate.ts';
import type { Stage7aOutput } from '../../../src/stages/stage-7a/validate.ts';
import { createTestDb, type TestDb } from '../../helpers/db.ts';
import {
  createFlow,
  GYM_FIXTURES as F,
  type Flow,
  insertProject,
  projectThrough,
  putRequest,
  runStage,
} from '../../helpers/stage-flow.ts';
import { createTemplateRepo, type TemplateRepo } from '../../helpers/template-repo.ts';

let t: TestDb;
let template: TemplateRepo;
let tick: number;
const clock: Clock = () => new Date(Date.UTC(2026, 9, 21, 8, 0, tick++)).toISOString();

beforeEach(() => {
  t = createTestDb();
  template = createTemplateRepo();
  tick = 0;
});
afterEach(() => {
  t.close();
  template.remove();
});

const api = () => graphHandlers({ db: t.db });
const getGraph = async (id = 'p1') => {
  const response = await api().get(id);
  return { status: response.status, body: (await response.json()) as ProjectGraph };
};
const ids = (nodes: GraphNode[], type: string) =>
  nodes.filter((n) => n.type === type).map((n) => n.id);

describe('GET /api/projects/{id}/graph', () => {
  it('404 untuk proyek yang tidak ada', async () => {
    const response = await api().get('tidak-ada');
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe('NOT_FOUND');
  });

  it('409 sebelum struktur fitur selesai', async () => {
    const flow = createFlow(t.db, clock, []);
    insertProject(flow);
    const response = await api().get('p1');
    expect(response.status).toBe(409);
    expect((await response.json()).error.message).toBe(
      'Flowchart tersedia setelah struktur fitur selesai.',
    );
  });

  it('setelah tahap 4: fitur MVP dan rekomendasi yang diterima saja, tanpa pemanggilan claude', async () => {
    const flow = createFlow(t.db, clock, [F.stage2(), F.stage3(), F.stage4()]);
    await projectThrough(flow, 'stage4');
    const stage4 = JSON.parse(F.stage4().result) as Stage4Output;
    const [, chosen] = stage4.recommended_features;
    expect((await flow.featuresApi.save(putRequest({ accepted: [chosen?.id] }), 'p1')).status).toBe(
      200,
    );
    const calls = flow.runner.prompts.length;

    const { status, body } = await getGraph();
    expect(status).toBe(200);
    expect(ids(body.nodes, 'project')).toEqual(['project']);
    expect(ids(body.nodes, 'feature')).toEqual([
      ...stage4.phases.flatMap((p) => p.feature_ids.map((id) => `feature-${id}`)),
      `feature-${chosen?.id}`,
    ]);
    expect(ids(body.nodes, 'task')).toEqual([]);
    expect(body.edges.length).toBe(body.nodes.length - 1);
    expect(flow.runner.prompts.length).toBe(calls);
  });

  it('setelah tahap 7: task dengan rincian 7b, dan graf sama di setiap permintaan', async () => {
    const flow = createFlow(
      t.db,
      clock,
      [F.stage2(), F.stage3(), F.stage4(), F.stage5(), F.stage6(), F.review2(), ...F.stage7Job()],
      { templateDir: template.dir },
    );
    await projectReadyForTasks(flow);
    await runStage(flow, 'stage7');
    const calls = flow.runner.prompts.length;

    const first = await getGraph();
    const tasks = (JSON.parse(F.stage7a().result) as Stage7aOutput).tasks;
    expect(ids(first.body.nodes, 'task')).toEqual(
      expect.arrayContaining(tasks.map((task) => `task-${task.id}`)),
    );
    const taskNodes = first.body.nodes.filter((n) => n.data.kind === 'task');
    expect(taskNodes).toHaveLength(tasks.length);
    expect(taskNodes.every((n) => n.data.kind === 'task' && n.data.detail !== null)).toBe(true);
    expect((await getGraph()).body).toEqual(first.body);
    expect(flow.runner.prompts.length).toBe(calls);
  });
});

async function projectReadyForTasks(flow: Flow) {
  await projectThrough(flow, 'stage5');
  await runStage(flow, 'stage6');
  await runStage(flow, 'review2');
  const keep = [
    { findingId: 'RV2-01', option: 'Biarkan, form edit memakai data dari daftar' },
    { findingId: 'RV2-02', option: 'Biarkan, cukup dijelaskan di task' },
  ];
  expect(
    (await flow.decisionsApi.save(putRequest({ choices: keep }), 'p1', 'review2')).status,
  ).toBe(200);
}
