import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  duplicatedTemplateFile,
  formatTemplateSchema,
  isGenerated,
  isNotesExample,
  migrationNumber,
  nextMigrationNumber,
  parseSchemaTables,
} from '../../../src/template/files.ts';
import {
  TEMPLATE_FILE_CONTENTS,
  TEMPLATE_MIGRATIONS,
  TEMPLATE_TABLES,
} from '../../helpers/template-repo.ts';

/** Daftar file template nyata (fixture verifikasi T-036, hasil `templateFiles()`). */
const REAL = (
  JSON.parse(
    readFileSync('test/fixtures/claude/verification/t036-template-files.json', 'utf8'),
  ) as { files: string[] }
).files;

describe('isNotesExample dan isGenerated', () => {
  it.each([
    'apps/api/src/db/schema/notes.ts',
    'apps/api/src/features/notes/http/notes.route.ts',
    'apps/api/test/int/notes/notes-schema.int.test.ts',
    'apps/app/lib/features/notes/notes_dependencies.dart',
    'apps/app/test/features/notes/data/note_mapper_test.dart',
  ])('%s → fitur contoh notes', (path) => {
    expect(isNotesExample(path)).toBe(true);
  });

  it.each([
    'apps/api/src/features/users/http/me.route.ts',
    'apps/api/test/helpers/factories.ts',
    'apps/app/lib/core/widgets/load_more_footer.dart',
    'apps/api/src/features/notifications/http/notifications.route.ts',
  ])('%s → bukan fitur contoh notes', (path) => {
    expect(isNotesExample(path)).toBe(false);
  });

  it('file hasil generate Dart dikenali', () => {
    expect(isGenerated('apps/app/lib/core/config/app_config.g.dart')).toBe(true);
    expect(isGenerated('apps/app/lib/x.freezed.dart')).toBe(true);
    expect(isGenerated('apps/app/lib/main.dart')).toBe(false);
  });
});

describe('duplicatedTemplateFile (D-15)', () => {
  it('daftar template nyata: tanpa file notes, dengan file users', () => {
    expect(REAL.some(isNotesExample)).toBe(false);
    expect(REAL).toContain('apps/api/src/features/users/http/me.route.ts');
    expect(REAL).toContain('apps/api/test/unit/features/users/http/me.route.test.ts');
  });

  it('file baru dengan peran yang sama di folder template → file template-nya', () => {
    expect(duplicatedTemplateFile('apps/api/src/features/users/http/users.route.ts', REAL)).toBe(
      'apps/api/src/features/users/http/me.route.ts',
    );
    expect(
      duplicatedTemplateFile('apps/api/test/unit/features/users/http/users.route.test.ts', REAL),
    ).toBe('apps/api/test/unit/features/users/http/me.route.test.ts');
    expect(
      duplicatedTemplateFile(
        'apps/api/src/features/users/infrastructure/pg-user-repository.ts',
        REAL,
      ),
    ).toBe('apps/api/src/features/users/infrastructure/drizzle-user-repository.ts');
  });

  it.each([
    // File template itu sendiri.
    'apps/api/src/features/users/http/me.route.ts',
    // Fitur baru (folder belum ada di template).
    'apps/api/src/features/reservations/http/reservations.route.ts',
    // Peran lain di folder template.
    'apps/api/src/features/users/usecases/update-profile.ts',
    'apps/api/test/unit/features/users/fake-user-repository.ts',
    // Folder notes tidak ada di daftar, jadi fitur baru boleh memakai pola yang sama.
    'apps/api/src/features/notes/http/notes-v2.route.ts',
  ])('%s → bukan duplikat', (path) => {
    expect(duplicatedTemplateFile(path, REAL)).toBeNull();
  });
});

describe('skema dan migrasi template (T-043)', () => {
  it('parseSchemaTables: nama kolom dari argumen kolom, atau snake_case nama properti untuk helper', () => {
    expect(
      parseSchemaTables(TEMPLATE_FILE_CONTENTS['apps/api/src/db/schema/users.ts'] ?? ''),
    ).toEqual(TEMPLATE_TABLES);
    expect(parseSchemaTables('export const x = 1;\n')).toEqual([]);
  });

  it('nomor migrasi berikutnya dari nomor terbesar, 4 digit', () => {
    expect(nextMigrationNumber(TEMPLATE_MIGRATIONS)).toBe('0003');
    expect(
      nextMigrationNumber(['apps/api/drizzle/0009_a.sql', 'apps/api/drizzle/0010_b.sql']),
    ).toBe('0011');
    expect(nextMigrationNumber([])).toBe('0000');
    expect(migrationNumber('apps/api/drizzle/0002_timestamp_precision.sql')).toBe(2);
    expect(migrationNumber('apps/api/drizzle/NNNN_users.sql')).toBeNull();
  });

  it('formatTemplateSchema: tabel, migrasi, dan nomor berikutnya', () => {
    expect(
      formatTemplateSchema({
        tables: TEMPLATE_TABLES,
        migrations: TEMPLATE_MIGRATIONS,
        nextMigration: '0003',
      }),
    ).toBe(
      [
        'Tabel dan kolom yang sudah ada (tanpa fitur contoh notes):',
        '- users: id, firebase_uid, email, display_name, last_seen_at, created_at, updated_at',
        '',
        'Migrasi yang sudah ada:',
        'apps/api/drizzle/0000_init.sql',
        'apps/api/drizzle/0001_notes.sql',
        'apps/api/drizzle/0002_timestamp_precision.sql',
        '',
        'Nomor migrasi berikutnya: 0003',
      ].join('\n'),
    );
  });
});
