// Template prompt berversi di prompts/<nama>.md (PRD bagian 3, D-04):
//
//   ---
//   version: 1
//   ---
//   Teks prompt dengan placeholder {{nama}}.
//
// `version` dicatat di setiap stage_runs. Mengubah isi prompt wajib menaikkan version.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const PROMPTS_DIR = join(process.cwd(), 'prompts');

export type PromptTemplate = { name: string; version: string; body: string };

export function loadPrompt(name: string, dir = PROMPTS_DIR): PromptTemplate {
  const raw = readFileSync(join(dir, `${name}.md`), 'utf8').replaceAll('\r\n', '\n');
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(`prompts/${name}.md tidak punya front matter.`);
  const version = match[1]?.match(/^version:\s*(\S+)\s*$/m)?.[1];
  if (!version) throw new Error(`prompts/${name}.md tidak punya \`version\` di front matter.`);
  return { name, version, body: (match[2] ?? '').trim() };
}

/**
 * Mengisi `{{nama}}` dengan nilai dari `values`. Placeholder tanpa nilai dan nilai yang tidak
 * dipakai sama-sama error, agar template dan kode tidak diam-diam berbeda.
 */
export function renderPrompt(template: PromptTemplate, values: Record<string, string>): string {
  const used = new Set<string>();
  const text = template.body.replaceAll(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = values[key];
    if (value === undefined) {
      throw new Error(`prompts/${template.name}.md: placeholder {{${key}}} tidak punya nilai.`);
    }
    used.add(key);
    return value;
  });
  const unused = Object.keys(values).filter((key) => !used.has(key));
  if (unused.length > 0) {
    throw new Error(`prompts/${template.name}.md: nilai tidak dipakai: ${unused.join(', ')}.`);
  }
  return text;
}
