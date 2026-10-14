import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppHeader } from '../../../src/components/ui/app-header.tsx';
import { Badge } from '../../../src/components/ui/badge.tsx';
import { Button } from '../../../src/components/ui/button.tsx';
import { Card } from '../../../src/components/ui/card.tsx';
import { Chip } from '../../../src/components/ui/chip.tsx';
import { Field } from '../../../src/components/ui/field.tsx';
import { MobileMenu } from '../../../src/components/ui/mobile-menu.tsx';
import { ProgressBar } from '../../../src/components/ui/progress-bar.tsx';
import { type Step, Stepper } from '../../../src/components/ui/stepper.tsx';
import { StickyActionBar } from '../../../src/components/ui/sticky-action-bar.tsx';
import { ThemeToggle } from '../../../src/components/ui/theme-toggle.tsx';

const render = renderToStaticMarkup;

describe('Button', () => {
  it('tiga varian; bawaan type="button" dan target sentuh 44 px', () => {
    const primary = render(<Button>Simpan</Button>);
    expect(primary).toMatch(/^<button type="button" class="[^"]*bg-accent[^"]*text-on-accent/);
    expect(primary).toContain('min-h-11');
    expect(render(<Button variant="secondary">B</Button>)).toContain('border-line bg-surface');
    expect(render(<Button variant="text">C</Button>)).toContain('text-ink-muted');
    expect(render(<Button size="lg">D</Button>)).toContain('min-h-12');
    expect(
      render(
        <Button type="submit" disabled>
          E
        </Button>,
      ),
    ).toMatch(/<button type="submit"[^>]*disabled="">E<\/button>/);
  });
});

describe('Chip', () => {
  it('opsi tunggal memakai radio dan opsi ganda memakai checkbox, di dalam label', () => {
    const single = render(
      <Chip kind="single" name="q1" checked readOnly>
        Admin saja
      </Chip>,
    );
    expect(single).toMatch(/^<label[^>]*><input type="radio" class="sr-only"[^>]*name="q1"/);
    expect(single).toContain('checked=""');
    expect(single).toContain('has-checked:bg-accent-soft');
    expect(single).toContain('min-h-11');
    const multi = render(
      <Chip kind="multi" name="q2-a" checked={false} readOnly>
        Ekspor
      </Chip>,
    );
    expect(multi).toContain('type="checkbox"');
    expect(multi).not.toContain('checked=""');
  });

  it('"+ Lainnya" bergaris putus-putus; nama aksesibel bisa diberi lewat aria-label', () => {
    const html = render(
      <Chip kind="single" look="dashed" name="m" aria-label="Lewati, pakai default: A" readOnly>
        Lewati
      </Chip>,
    );
    expect(html).toContain('border-dashed');
    expect(html).toContain('aria-label="Lewati, pakai default: A"');
  });
});

describe('Badge', () => {
  it('status dan keparahan: teks berwarna di atas latar warna yang sama', () => {
    expect(render(<Badge tone="success">Valid</Badge>)).toContain('bg-success-soft text-success');
    expect(render(<Badge tone="high">Tinggi</Badge>)).toContain('bg-high-soft text-high');
    expect(render(<Badge tone="medium">Sedang</Badge>)).toContain('bg-medium-soft text-medium');
    expect(render(<Badge tone="low">Rendah</Badge>)).toContain('bg-low-soft text-low');
    const dotted = render(
      <Badge tone="accent" dot>
        Tahap 3
      </Badge>,
    );
    expect(dotted).toContain('aria-hidden="true"');
    expect(dotted).toContain('Tahap 3');
  });
});

describe('Card', () => {
  it('panel 16 px, kartu utama 20 px, elemen bisa dipilih', () => {
    expect(render(<Card>x</Card>)).toMatch(/^<div class="[^"]*rounded-panel/);
    expect(
      render(
        <Card as="section" size="main" tone="medium">
          x
        </Card>,
      ),
    ).toMatch(/^<section class="[^"]*rounded-card[^"]*border-medium/);
  });
});

describe('Field', () => {
  it('label terhubung ke input; error dan keterangan lewat aria-describedby', () => {
    const html = render(<Field id="nama" label="Nama proyek" error="Wajib diisi" hint="Maks 80" />);
    expect(html).toContain('<label for="nama"');
    expect(html).toMatch(
      /<input id="nama"[^>]*aria-invalid="true"[^>]*aria-describedby="nama-hint nama-error"/,
    );
    expect(html).toContain('id="nama-error"');
    expect(html).toContain('Wajib diisi');
  });

  it('multiline memakai textarea tanpa error', () => {
    const html = render(<Field multiline id="ide" label="Ide" rows={5} />);
    expect(html).toMatch(/<textarea id="ide"[^>]*rows="5"/);
    expect(html).not.toContain('aria-invalid="');
  });
});

describe('ProgressBar', () => {
  it('nilai diketahui dan tidak tentu', () => {
    const known = render(<ProgressBar label="Progres" value={0.42} />);
    expect(known).toContain('role="progressbar"');
    expect(known).toContain('aria-valuenow="42"');
    expect(known).toContain('width:42%');
    const unknown = render(<ProgressBar label="Progres PRD" />);
    expect(unknown).toContain('aria-label="Progres PRD"');
    expect(unknown).not.toContain('aria-valuenow');
  });
});

describe('Stepper', () => {
  const steps: Step[] = [
    { number: 1, label: 'Ide', status: 'done' },
    {
      number: 2,
      label: 'Klarifikasi produk',
      status: 'done',
      tokens: '25.612 token',
      href: '/p?tahap=2',
    },
    {
      number: 3,
      label: 'Klarifikasi teknis',
      status: 'current',
      href: '/p?tahap=3',
      selected: true,
    },
    { number: 4, label: 'Struktur fitur', status: 'locked' },
    { number: 5, label: 'Review kritis', status: 'failed' },
    { number: 6, label: 'PRD', status: 'running', meta: 'Sekitar 4–5 menit' },
  ];

  it('status selalu tertulis sebagai teks, token per tahap tampil', () => {
    const html = render(<Stepper steps={steps} />);
    expect(html).toContain('<nav aria-label="Tahapan"');
    expect(html).toMatch(/data-testid="step-meta-2">Selesai · 25\.612 token</);
    expect(html).toMatch(/data-testid="step-meta-3">Aktif</);
    expect(html).toMatch(/data-testid="step-meta-4">Terkunci</);
    expect(html).toMatch(/data-testid="step-meta-5">Gagal</);
    expect(html).toMatch(/data-testid="step-meta-6">Berjalan · Sekitar 4–5 menit</);
  });

  it('tahap terbuka berupa tautan, tahap terkunci tidak; tahap yang dibuka ditandai', () => {
    const html = render(<Stepper steps={steps} />);
    expect(html).toContain('href="/p?tahap=2"');
    expect(html).toMatch(/aria-current="page" href="\/p\?tahap=3"/);
    expect(html.match(/<a /g)).toHaveLength(2);
  });

  it('centang tahap selesai berwarna hijau (success), bukan aksen', () => {
    const html = render(<Stepper steps={steps.slice(0, 1)} />);
    expect(html).toMatch(/border-success bg-success[^"]*"><svg/);
    expect(html).not.toContain('bg-accent ');
  });
});

describe('StickyActionBar', () => {
  it('menyebut tahap berikutnya tepat di samping tombol utama', () => {
    const html = render(
      <StickyActionBar summary="3 dari 4 dijawab" next="Klarifikasi teknis">
        <Button type="submit">Simpan jawaban</Button>
      </StickyActionBar>,
    );
    expect(html).toContain('sticky bottom-4');
    expect(html).toMatch(
      /Berikutnya: <span[^>]*>Klarifikasi teknis<\/span><\/span><button type="submit"[^>]*>Simpan jawaban/,
    );
    expect(html).toContain('3 dari 4 dijawab');
  });
});

describe('AppHeader', () => {
  it('logo, breadcrumb proyek, total token, status template, tombol tema', () => {
    const html = render(
      <AppHeader
        project="Membership gym"
        tokens="24.412 input · 1.521 output"
        template={{ valid: true, commit: '0416d60c04bf650c3d517eb0197adc494ce1a8eb' }}
      />,
    );
    expect(html).toMatch(
      /<a [^>]*aria-label="PRD Generator, kembali ke beranda" href="\/">.*PRD Generator<\/span><\/a>/,
    );
    expect(html).toContain('data-testid="breadcrumb-project">Membership gym<');
    expect(html).toContain('data-testid="header-tokens">24.412 input · 1.521 output<');
    expect(html).toMatch(/data-testid="template-status"[^>]*>.*template 0416d60</);
    expect(html).toMatch(/<a[^>]*href="\/settings"[^>]*>Pengaturan<\/a>/);
    expect(html).toContain('data-testid="theme-toggle"');
  });

  it('template bermasalah tertulis, tanpa breadcrumb di beranda', () => {
    const html = render(<AppHeader template={{ valid: false, commit: null }} />);
    expect(html).toContain('template bermasalah');
    expect(html).not.toContain('breadcrumb-project');
  });
});

describe('ThemeToggle', () => {
  it('tombol ikon dengan aria-label dan ikon untuk kedua tema', () => {
    const html = render(<ThemeToggle />);
    expect(html).toMatch(/<button type="button" aria-label="Ganti tema gelap atau terang"/);
    expect(html).toContain('size-11');
    expect(html).toContain('light:hidden');
    expect(html).toContain('hidden light:block');
  });
});

describe('MobileMenu', () => {
  it('di header: tombol menu hanya untuk layar sempit, navigasi lebar disembunyikan di HP', () => {
    const html = render(
      <AppHeader tokens="1 input · 2 output" template={{ valid: true, commit: 'abc1234' }} />,
    );
    expect(html).toMatch(
      /<button[^>]*aria-label="Buka menu" aria-expanded="false" aria-controls="mobile-menu"[^>]*md:hidden/,
    );
    expect(html).toMatch(/<nav aria-label="Navigasi utama" class="hidden [^"]*md:flex"/);
    expect(html).not.toContain('role="dialog"');
  });

  it('terbuka: panel samping berisi navigasi, dengan tombol tutup', () => {
    const html = render(
      <MobileMenu defaultOpen>
        <a href="/settings">Pengaturan</a>
      </MobileMenu>,
    );
    expect(html).toContain('aria-expanded="true"');
    expect(html).toMatch(/role="dialog" aria-modal="true" aria-label="Menu"/);
    expect(html).toContain('<a href="/settings">Pengaturan</a>');
    expect(html.match(/aria-label="Tutup menu"/g)).toHaveLength(2);
  });
});
