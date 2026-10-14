// Dokumen proyek (PRD, TASKS): versi terbaru per jenis.
import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../core/db/client.ts';
import { type DOCUMENT_KINDS, documents } from '../core/db/schema.ts';

export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export function latestDocument(db: Db, projectId: string, kind: DocumentKind) {
  return (
    db
      .select()
      .from(documents)
      .where(and(eq(documents.projectId, projectId), eq(documents.kind, kind)))
      .orderBy(desc(documents.version))
      .get() ?? null
  );
}
