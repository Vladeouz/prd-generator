// Isi route handler `/api/projects` dan `/api/projects/{id}`. Dependensi disuntikkan agar route
// handler bisa diuji dengan database test; file di src/app/api hanya menyambungkan `getDb()`.
import { handle, parseBody } from '../core/http.ts';
import {
  createProject,
  deleteProject,
  getProjectDetail,
  listProjects,
  type ProjectDeps,
} from './projects.ts';
import { createProjectSchema } from './schema.ts';

export function projectHandlers(deps: ProjectDeps) {
  return {
    /** GET /api/projects → 200 ProjectSummary[] (terbaru dulu). */
    list: () => handle(() => Response.json(listProjects(deps))),

    /** POST /api/projects { name, idea } → 201 Project; 422 bila tidak valid. */
    create: (request: Request) =>
      handle(async () => {
        const input = await parseBody(request, createProjectSchema);
        return Response.json(createProject(deps, input), { status: 201 });
      }),

    /** GET /api/projects/{id} → 200 ProjectDetail; 404 bila tidak ada. */
    get: (id: string) => handle(() => Response.json(getProjectDetail(deps, id))),

    /** DELETE /api/projects/{id} → 204; 409 bila ada job berjalan; 404 bila tidak ada. */
    remove: (id: string) =>
      handle(() => {
        deleteProject(deps, id);
        return new Response(null, { status: 204 });
      }),
  };
}
