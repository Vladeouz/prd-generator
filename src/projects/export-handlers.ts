// Isi route handler `POST /api/projects/{id}/export` dan `GET /api/projects/{id}/documents/{kind}`.
import type { Db } from '../core/db/client.ts';
import { handle, parseBody } from '../core/http.ts';
import { documentForDownload, exportSchema, exportToProject } from './export.ts';

export function exportHandlers(deps: { db: Db }) {
  return {
    /** → 200 `{ written }`; 422 bila folder bukan turunan template; 409 bila PRD bukan placeholder. */
    export: (request: Request, projectId: string) =>
      handle(async () => {
        const input = await parseBody(request, exportSchema);
        return Response.json(exportToProject(deps, projectId, input));
      }),

    /** → 200 Markdown; `download=1` sebagai lampiran `PRD.md` atau `TASKS.md`. */
    document: (request: Request, projectId: string, kind: string) =>
      handle(() => {
        const { filename, content } = documentForDownload(deps, projectId, kind);
        const download = new URL(request.url).searchParams.get('download') === '1';
        return new Response(content, {
          headers: {
            'content-type': 'text/markdown; charset=utf-8',
            ...(download ? { 'content-disposition': `attachment; filename="${filename}"` } : {}),
          },
        });
      }),
  };
}
