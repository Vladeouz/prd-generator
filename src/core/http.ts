// Helper route handler: semua error dikembalikan dengan format PRD bagian 5,
// `{ error: { code, message, details? } }`.
import type { z } from 'zod';
import { AppError } from './errors.ts';

/** Membungkus handler: `AppError` → statusnya, error lain → 500 tanpa membocorkan detail. */
export async function handle(fn: () => Promise<Response> | Response): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json(error.toBody(), { status: error.status });
    }
    console.error(error);
    const internal = new AppError('INTERNAL_ERROR', 'Terjadi kesalahan di server.');
    return Response.json(internal.toBody(), { status: internal.status });
  }
}

/**
 * Membaca body JSON lalu memvalidasinya dengan skema Zod. Body bukan JSON → `BAD_REQUEST`;
 * tidak lolos skema → `VALIDATION_ERROR` (422) dengan `details` berisi pesan pertama per field,
 * misalnya `{ idea: 'Ide wajib diisi.' }`.
 */
export async function parseBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new AppError('BAD_REQUEST', 'Body permintaan harus berupa JSON yang valid.');
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    const details: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_';
      details[key] ??= issue.message;
    }
    throw new AppError('VALIDATION_ERROR', 'Data yang dikirim tidak valid.', details);
  }
  return result.data;
}
