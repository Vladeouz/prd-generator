// Dokumen proyek (PRD, TASKS): versi terbaru per jenis.
import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../core/db/client.ts';
import { type DOCUMENT_KINDS, documents } from '../core/db/schema.ts';
import type { Tx } from '../stages/run-stage.ts';

export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/** Bisa dibaca di dalam transaksi pencatatan output tahap. */
export function latestDocument(db: Db | Tx, projectId: string, kind: DocumentKind) {
  return (
    (db as Db)
      .select()
      .from(documents)
      .where(and(eq(documents.projectId, projectId), eq(documents.kind, kind)))
      .orderBy(desc(documents.version))
      .get() ?? null
  );
}
