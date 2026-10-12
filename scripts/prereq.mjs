#!/usr/bin/env node
// Memeriksa prasyarat lingkungan (PRD bagian 3) dan menampilkan tabel status beserta saran perbaikan.
// Script ini hanya membaca; tidak pernah membuat atau mengubah file apa pun.

import { fileURLToPath } from 'node:url';
import { FAIL, OK, prereqChecks } from './lib/prereq-checks.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

const rows = prereqChecks(root).map((check) => ({ name: check.name, ...check.run() }));

const headers = ['Prasyarat', 'Status', 'Detail'];
const table = rows.map((row) => [row.name, row.status, row.detail]);
const widths = headers.map((header, i) =>
  Math.max(header.length, ...table.map((cells) => cells[i].length)),
);
const formatRow = (cells) =>
  cells
    .map((cell, i) => cell.padEnd(widths[i]))
    .join('  ')
    .trimEnd();

console.log('\npnpm prereq: memeriksa prasyarat lingkungan\n');
console.log(formatRow(headers));
console.log(widths.map((width) => '-'.repeat(width)).join('  '));
for (const cells of table) {
  console.log(formatRow(cells));
}

const fixes = rows.filter((row) => row.status !== OK && row.fix);
if (fixes.length > 0) {
  console.log('\nPerbaikan:');
  for (const row of fixes) {
    console.log(`- [${row.status}] ${row.name}: ${row.fix}`);
  }
}

console.log(
  '\nPengingat: login Claude Code tidak diperiksa karena memakai kuota. ' +
    'Pastikan `claude` sudah login dengan menjalankannya sekali secara interaktif.',
);

const failed = rows.filter((row) => row.status === FAIL);
if (failed.length > 0) {
  console.log(`\n${failed.length} prasyarat gagal.`);
  process.exitCode = 1;
} else {
  console.log('\nSemua prasyarat terpenuhi.');
}
