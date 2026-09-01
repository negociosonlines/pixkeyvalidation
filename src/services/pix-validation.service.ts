export type PixKeyType = 'cpf' | 'cnpj' | 'email' | 'phone' | 'random';

const CPF_LENGTH = 11;
const CNPJ_LENGTH = 14;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

function hasOnlyDocumentCharacters(value: string): boolean {
  return /^[\d./-]+$/.test(value);
}

function calculateCpfDigit(base: string, factor: number): number {
  const total = [...base].reduce((sum, digit) => sum + Number(digit) * factor--, 0);
  const remainder = (total * 10) % 11;
  return remainder === 10 ? 0 : remainder;
}

export function validateCpf(value: string): boolean {
  const cpf = digitsOnly(value);
  if (!hasOnlyDocumentCharacters(value) || cpf.length !== CPF_LENGTH || /^(\d)\1{10}$/.test(cpf)) {
    return false;
  }

  const firstDigit = calculateCpfDigit(cpf.slice(0, 9), 10);
  const secondDigit = calculateCpfDigit(cpf.slice(0, 10), 11);
  return firstDigit === Number(cpf[9]) && secondDigit === Number(cpf[10]);
}

function calculateCnpjDigit(base: string, weights: number[]): number {
  const total = [...base].reduce((sum, digit, index) => sum + Number(digit) * (weights[index] ?? 0), 0);
  const remainder = total % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

export function validateCnpj(value: string): boolean {
  const cnpj = digitsOnly(value);
  if (!hasOnlyDocumentCharacters(value) || cnpj.length !== CNPJ_LENGTH || /^(\d)\1{13}$/.test(cnpj)) {
    return false;
  }

  const firstDigit = calculateCnpjDigit(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const secondDigit = calculateCnpjDigit(cnpj.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return firstDigit === Number(cnpj[12]) && secondDigit === Number(cnpj[13]);
}

export function validateEmailPixKey(value: string): boolean {
  return value.length <= 254 && EMAIL_PATTERN.test(value);
}

function normalizePhoneDigits(value: string): string | null {
  if (!/^\+?[\d\s().-]+$/.test(value)) {
    return null;
  }

  const digits = digitsOnly(value);
  const local = digits.startsWith('55') && (digits.length === 12 || digits.length === 13)
    ? digits.slice(2)
    : digits;

  if (local.length !== 10 && local.length !== 11) {
    return null;
  }

  const ddd = Number(local.slice(0, 2));
  if (ddd < 11 || ddd > 99 || local.startsWith('0')) {
    return null;
  }

  if (local.length === 11 && local[2] !== '9') {
    return null;
  }

  return `55${local}`;
}

export function validatePhonePixKey(value: string): boolean {
  return normalizePhoneDigits(value) !== null;
}

export function validateRandomPixKey(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function detectPixKeyType(value: string): PixKeyType | null {
  const trimmed = value.trim();
  const digits = digitsOnly(trimmed);

  if (validateEmailPixKey(trimmed)) {
    return 'email';
  }

  if (validateRandomPixKey(trimmed)) {
    return 'random';
  }

  if (hasOnlyDocumentCharacters(trimmed) && digits.length === CPF_LENGTH) {
    return 'cpf';
  }

  if (hasOnlyDocumentCharacters(trimmed) && digits.length === CNPJ_LENGTH) {
    return 'cnpj';
  }

  if ((trimmed.startsWith('+55') || digits.length === 10) && validatePhonePixKey(trimmed)) {
    return 'phone';
  }

  return null;
}

export function normalizePixKey(value: string, type: PixKeyType): string {
  const trimmed = value.trim();

  if (type === 'cpf' || type === 'cnpj') {
    return digitsOnly(trimmed);
  }

  if (type === 'phone') {
    const phone = normalizePhoneDigits(trimmed);
    return phone ? `+${phone}` : trimmed;
  }

  if (type === 'random') {
    return trimmed.toLowerCase();
  }

  return trimmed;
}

export function validatePixKey(value: string, type: PixKeyType): boolean {
  const validators: Record<PixKeyType, (key: string) => boolean> = {
    cpf: validateCpf,
    cnpj: validateCnpj,
    email: validateEmailPixKey,
    phone: validatePhonePixKey,
    random: validateRandomPixKey,
  };

  return validators[type](value);
}

export function maskCpf(value: string): string {
  const cpf = digitsOnly(value);
  return cpf.length === CPF_LENGTH ? `***.***.${cpf.slice(6, 9)}-${cpf.slice(9)}` : '***';
}
