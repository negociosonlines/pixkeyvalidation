import { AppError } from '../shared/errors.js';
import type { RegistryLookup } from './magma.service.js';
import {
  detectPixKeyType,
  maskCpf,
  normalizePixKey,
  type PixKeyType,
  validatePixKey,
} from './pix-validation.service.js';

const allowedTypes = new Set<PixKeyType>(['cpf', 'cnpj', 'email', 'phone', 'random']);

export interface VerifyPixInput {
  pixKey: unknown;
  pixKeyType?: unknown;
}

export interface VerifyPixResponse {
  keyValidation: {
    type: PixKeyType;
    syntaxValid: true;
    normalized: string;
  };
  registryVerification: {
    checked: boolean;
    found?: boolean;
    name?: string;
    reason?: 'provider_not_supported_for_key_type';
  };
  pixOwnershipVerification: {
    verified: false;
    status: 'not_checked';
  };
}

function parseInput(input: VerifyPixInput): { value: string; type: PixKeyType } {
  if (typeof input.pixKey !== 'string' || input.pixKey.trim().length === 0 || input.pixKey.length > 320) {
    throw new AppError(400, 'INVALID_REQUEST', 'pixKey deve ser uma string entre 1 e 320 caracteres.');
  }

  if (input.pixKeyType !== undefined && (typeof input.pixKeyType !== 'string' || !allowedTypes.has(input.pixKeyType as PixKeyType))) {
    throw new AppError(400, 'INVALID_REQUEST', 'pixKeyType inválido.');
  }

  const value = input.pixKey.trim();
  const type = input.pixKeyType as PixKeyType | undefined ?? detectPixKeyType(value);
  if (!type) {
    throw new AppError(422, 'INVALID_PIX_KEY', 'Não foi possível identificar uma chave Pix válida.');
  }

  return { value, type };
}

export async function verifyPixKey(input: VerifyPixInput, registry: RegistryLookup): Promise<VerifyPixResponse> {
  const { value, type } = parseInput(input);

  if (!validatePixKey(value, type)) {
    const message = type === 'cpf' ? 'CPF inválido.' : 'Chave Pix inválida.';
    throw new AppError(422, 'INVALID_PIX_KEY', message, { type, syntaxValid: false });
  }

  const normalized = normalizePixKey(value, type);
  const keyValidation = {
    type,
    syntaxValid: true as const,
    normalized: type === 'cpf' ? maskCpf(normalized) : normalized,
  };
  const pixOwnershipVerification = {
    verified: false as const,
    status: 'not_checked' as const,
  };

  if (type !== 'cpf') {
    return {
      keyValidation,
      registryVerification: {
        checked: false,
        reason: 'provider_not_supported_for_key_type',
      },
      pixOwnershipVerification,
    };
  }

  const registryResult = await registry.lookupCpf(normalized);
  return {
    keyValidation,
    registryVerification: {
      checked: true,
      found: registryResult.found,
      ...(registryResult.name ? { name: registryResult.name } : {}),
    },
    pixOwnershipVerification,
  };
}
