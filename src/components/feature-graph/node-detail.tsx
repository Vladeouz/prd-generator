// Panel detail node flowchart (FR-12): deskripsi fitur, atau rincian task (*done when* bila tahap
// 7b selesai). Komponen murni, di-test dengan `renderToStaticMarkup`.
import type { ReactNode } from 'react';
import type { GraphNodeData } from '../../projects/graph.ts';
import { Badge } from '../ui/badge.tsx';

export const KIND_LABELS: Record<GraphNodeData['kind'], string> = {
  project: 'Proyek',
  phase: 'Fase',
  feature: 'Fitur',
  subfeature: 'Sub-fitur',
  task: 'Task',
};

export const SOURCE_LABELS = {
  user: 'Dari jawabanmu',
  fondasi: 'Fondasi',
  rekomendasi: 'Rekomendasi diterima',
} as const;

/**
 * Kode singkat sesudah label jenis node: nomor fase (`Fase 1`), `F-03`, `T-007`. Kelompok
 * rekomendasi tidak punya kode.
 */
export function nodeCode(data: GraphNodeData): string | null {
  if (data.kind === 'phase') return data.phase === null ? null : String(data.phase);
  if (data.kind === 'feature' || data.kind === 'task') return data.code;
  return null;
}

export const taskCountText = (count: number) => `${count} task`;

/** Label untuk pembaca layar: jenis, kode, judul, dan jumlah task bila ada. */
export function nodeAriaLabel(data: GraphNodeData): string {
  const parts = [KIND_LABELS[data.kind], nodeCode(data), data.label];
  if ((data.kind === 'phase' || data.kind === 'feature') && data.taskCount !== null) {
    parts.push(taskCountText(data.taskCount));
  }
  return parts.filter(Boolean).join(', ');
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-bold uppercase tracking-[0.06em] text-ink-muted">{label}</dt>
      <dd className="text-sm text-ink-secondary">{children}</dd>
    </div>
  );
}

function List({ items, mono = false }: { items: string[]; mono?: boolean }) {
  return (
    <ul className={`flex list-disc flex-col gap-1 pl-4.5 ${mono ? 'font-mono text-[13px]' : ''}`}>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

const codes = (items: string[]) => (items.length > 0 ? items.join(', ') : 'Tidak ada');

function Body({ data }: { data: GraphNodeData }) {
  switch (data.kind) {
    case 'project':
      return (
        <Field label="Ide">
          <span className="whitespace-pre-wrap">{data.idea}</span>
        </Field>
      );
    case 'phase':
      return (
        <>
          <Field label="Tujuan">{data.goal}</Field>
          {data.taskCount !== null && <Field label="Task">{taskCountText(data.taskCount)}</Field>}
        </>
      );
    case 'feature':
      return (
        <>
          <Field label={data.source === 'rekomendasi' ? 'Alasan' : 'Deskripsi'}>
            {data.description}
          </Field>
          {data.subFeatures.length > 0 && (
            <Field label="Sub-fitur">
              <List items={data.subFeatures} />
            </Field>
          )}
          <Field label="Bergantung pada">{codes(data.dependsOn)}</Field>
          <Field label="Task">
            {data.taskCount === null
              ? 'Task tampil setelah daftar task (tahap 7) selesai.'
              : taskCountText(data.taskCount)}
          </Field>
        </>
      );
    case 'subfeature':
      return <Field label="Bagian dari fitur">{data.feature}</Field>;
    case 'task':
      return (
        <>
          <Field label="Fase dan layer">
            Fase {data.phase} · <span className="font-mono">{data.layer}</span>
          </Field>
          <Field label="Bergantung pada">
            <span className="font-mono">{codes(data.dependsOn)}</span>
          </Field>
          <Field label="Rujukan">
            <span className="font-mono">{codes(data.refs)}</span>
          </Field>
          {data.detail ? (
            <>
              <Field label="File">
                <List
                  items={data.detail.files.map((file) => {
                    const note = data.detail?.file_notes?.[file];
                    return note ? `${file} — ${note}` : file;
                  })}
                  mono
                />
              </Field>
              <Field label="Done when">
                <List items={data.detail.done_when} />
              </Field>
              {data.detail.manual && (
                <Field label="Verifikasi manual">
                  <p>{data.detail.manual.criterion}</p>
                  <ol className="mt-1 flex list-decimal flex-col gap-1 pl-4.5">
                    {data.detail.manual.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </Field>
              )}
            </>
          ) : (
            <Field label="Rincian">
              <span className="text-ink-muted" data-testid="task-detail-pending">
                File dan done when tampil setelah detail fase ini (tahap 7) selesai.
              </span>
            </Field>
          )}
        </>
      );
  }
}

/** Isi panel untuk node terpilih, atau petunjuk cara memilih bila belum ada. */
export function NodeDetail({ data }: { data: GraphNodeData | null }) {
  if (!data) {
    return (
      <p className="text-sm text-ink-muted">
        Pilih node dengan klik, atau dengan Tab lalu Enter, untuk melihat detailnya.
      </p>
    );
  }
  const code = nodeCode(data);
  return (
    <div className="flex flex-col gap-3" data-testid="node-detail">
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="accent" size="sm">
            {KIND_LABELS[data.kind]}
          </Badge>
          {code && <span className="font-mono text-xs text-ink-muted">{code}</span>}
          {data.kind === 'feature' && <Badge size="sm">{SOURCE_LABELS[data.source]}</Badge>}
        </div>
        <h3 className="text-[17px] font-bold">{data.label}</h3>
      </div>
      <dl className="flex flex-col gap-3">
        <Body data={data} />
      </dl>
    </div>
  );
}
