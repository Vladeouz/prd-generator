// Error domain dengan kode dari format error PRD bagian 5: `{ error: { code, message, details? } }`.
// Route handler memetakan `AppError` ke status HTTP lewat `status`.

export const ERROR_STATUS = {
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION_ERROR: 422,
  INTERNAL_ERROR: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

const APP_ERROR = Symbol.for('prd-generator.AppError');

/**
 * Next.js membundel `instrumentation.ts` (yang membuat antrean job) terpisah dari route, sehingga
 * satu kelas bisa punya dua salinan dan `instanceof` biasa gagal (error 409 menjadi 500). Kelas error
 * di aplikasi ini dikenali lewat penanda `Symbol.for` agar `instanceof` tetap benar lintas bundle.
 */
export function brandedInstanceCheck(brand: symbol) {
  return (value: unknown): boolean =>
    typeof value === 'object' &&
    value !== null &&
    (value as Record<symbol, unknown>)[brand] === true;
}

export class AppError extends Error {
  static [Symbol.hasInstance] = brandedInstanceCheck(APP_ERROR);
  readonly [APP_ERROR] = true;
  readonly code: ErrorCode;
  readonly details: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }

  get status(): number {
    return ERROR_STATUS[this.code];
  }

  toBody() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details === undefined ? {} : { details: this.details }),
      },
    };
  }
}
