// Status repo template untuk header (dibaca server setiap kali halaman dibuka).
import type { TemplateStatus } from '../components/ui/app-header.tsx';
import { readTemplate } from '../template/template.ts';

export async function templateStatus(
  templateDir = process.env.TEMPLATE_DIR,
): Promise<TemplateStatus> {
  const result = await readTemplate(templateDir);
  return result.ok
    ? { valid: true, commit: result.template.commit }
    : { valid: false, commit: null };
}
