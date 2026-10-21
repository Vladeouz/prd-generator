import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  FeatureGraphSection,
  hasTasks,
} from '../../../src/app/projects/[id]/feature-graph-section.tsx';
import { NodeDetail, nodeAriaLabel } from '../../../src/components/feature-graph/node-detail.tsx';
import type { GraphNodeData } from '../../../src/projects/graph.ts';

const feature: GraphNodeData = {
  kind: 'feature',
  label: 'Registrasi member',
  code: 'F-01',
  source: 'user',
  description: 'Member mendaftar lewat aplikasi.',
  subFeatures: ['Form pendaftaran', 'Verifikasi email'],
  dependsOn: [],
  taskCount: 3,
};

const task = (detail: Extract<GraphNodeData, { kind: 'task' }>['detail']): GraphNodeData => ({
  kind: 'task',
  label: 'API registrasi member',
  code: 'T-004',
  phase: 0,
  layer: 'api',
  dependsOn: ['T-001'],
  refs: ['FR-01'],
  detail,
});

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('NodeDetail', () => {
  it('tanpa node terpilih: petunjuk klik atau keyboard', () => {
    expect(renderToStaticMarkup(<NodeDetail data={null} />)).toContain(
      'Pilih node dengan klik, atau dengan Tab lalu Enter, untuk melihat detailnya.',
    );
  });

  it('fitur: deskripsi, sub-fitur, dependensi, dan jumlah task', () => {
    const html = text(renderToStaticMarkup(<NodeDetail data={feature} />));
    expect(html).toContain('Fitur F-01 Dari jawabanmu Registrasi member');
    expect(html).toContain('Deskripsi Member mendaftar lewat aplikasi.');
    expect(html).toContain('Sub-fitur Form pendaftaran Verifikasi email');
    expect(html).toContain('Bergantung pada Tidak ada');
    expect(html).toContain('Task 3 task');
  });

  it('fitur sebelum tahap 7a: task belum ada', () => {
    const html = renderToStaticMarkup(<NodeDetail data={{ ...feature, taskCount: null }} />);
    expect(html).toContain('Task tampil setelah daftar task (tahap 7) selesai.');
  });

  it('task dengan rincian 7b: file, done when, dan langkah manual', () => {
    const html = text(
      renderToStaticMarkup(
        <NodeDetail
          data={task({
            files: ['apps/api/src/members/**'],
            done_when: ['POST /members mengembalikan 201', 'email duplikat ditolak 409'],
            manual: { criterion: 'Daftar dari aplikasi', steps: ['Buka halaman daftar'] },
          })}
        />,
      ),
    );
    expect(html).toContain('Task T-004 API registrasi member');
    expect(html).toContain('Fase dan layer Fase 0 · api');
    expect(html).toContain('Bergantung pada T-001');
    expect(html).toContain('Rujukan FR-01');
    expect(html).toContain('File apps/api/src/members/**');
    expect(html).toContain('Done when POST /members mengembalikan 201 email duplikat ditolak 409');
    expect(html).toContain('Verifikasi manual Daftar dari aplikasi Buka halaman daftar');
  });

  it('task sebelum 7b fasenya selesai', () => {
    const html = renderToStaticMarkup(<NodeDetail data={task(null)} />);
    expect(html).toContain('data-testid="task-detail-pending"');
    expect(html).not.toContain('Done when');
  });

  it('label pembaca layar menyebut jenis, kode, judul, dan jumlah task', () => {
    expect(nodeAriaLabel(feature)).toBe('Fitur, F-01, Registrasi member, 3 task');
    expect(
      nodeAriaLabel({ kind: 'phase', label: 'Fondasi', phase: 0, goal: '', taskCount: null }),
    ).toBe('Fase, FASE 0, Fondasi');
    expect(nodeAriaLabel(task(null))).toBe('Task, T-004, API registrasi member');
  });
});

describe('FeatureGraphSection', () => {
  it('tidak tampil sebelum tahap 4 selesai', () => {
    expect(renderToStaticMarkup(<FeatureGraphSection graph={null} description="x" />)).toBe('');
  });

  it('hasTasks hanya bila ada node task', () => {
    const node = (type: GraphNodeData['kind']) => ({
      id: type,
      type,
      position: { x: 0, y: 0 },
      data: feature,
    });
    expect(hasTasks(null)).toBe(false);
    expect(hasTasks({ nodes: [node('feature')], edges: [] })).toBe(false);
    expect(hasTasks({ nodes: [node('feature'), node('task')], edges: [] })).toBe(true);
  });
});
