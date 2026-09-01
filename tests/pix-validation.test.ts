import { describe, expect, it } from 'vitest';
import {
  detectPixKeyType,
  maskCpf,
  normalizePixKey,
  validateCnpj,
  validateCpf,
  validateEmailPixKey,
  validatePhonePixKey,
  validateRandomPixKey,
} from '../src/services/pix-validation.service.js';

describe('validação de CPF', () => {
  it('aceita CPF válido com ou sem formatação', () => {
    expect(validateCpf('52998224725')).toBe(true);
    expect(validateCpf('529.982.247-25')).toBe(true);
  });

  it('rejeita dígitos verificadores inválidos e sequências repetidas', () => {
    expect(validateCpf('52998224724')).toBe(false);
    expect(validateCpf('00000000000')).toBe(false);
    expect(validateCpf('111.111.111-11')).toBe(false);
  });

  it('mascara o CPF sem expor o valor integral', () => {
    expect(maskCpf('52998224725')).toBe('***.***.247-25');
  });
});

describe('validação das demais chaves Pix', () => {
  it('valida CNPJ matematicamente', () => {
    expect(validateCnpj('11.222.333/0001-81')).toBe(true);
    expect(validateCnpj('11.222.333/0001-82')).toBe(false);
    expect(validateCnpj('11.111.111/1111-11')).toBe(false);
  });

  it('valida e-mail sem alterar seu conteúdo', () => {
    expect(validateEmailPixKey('Pessoa+pix@Exemplo.com')).toBe(true);
    expect(validateEmailPixKey('pessoa@@exemplo.com')).toBe(false);
    expect(normalizePixKey('Pessoa+pix@Exemplo.com', 'email')).toBe('Pessoa+pix@Exemplo.com');
  });

  it('valida e normaliza telefone brasileiro', () => {
    expect(validatePhonePixKey('11999999999')).toBe(true);
    expect(validatePhonePixKey('+5511999999999')).toBe(true);
    expect(validatePhonePixKey('5511999')).toBe(false);
    expect(normalizePixKey('11 99999-9999', 'phone')).toBe('+5511999999999');
  });

  it('valida UUID como chave aleatória', () => {
    const uuid = '123e4567-e89b-12d3-a456-426614174000';
    expect(validateRandomPixKey(uuid)).toBe(true);
    expect(validateRandomPixKey('123e4567-e89b-12d3-a456')).toBe(false);
    expect(normalizePixKey(uuid.toUpperCase(), 'random')).toBe(uuid);
  });
});

describe('detecção de tipo', () => {
  it.each([
    ['529.982.247-25', 'cpf'],
    ['11.222.333/0001-81', 'cnpj'],
    ['pessoa@exemplo.com', 'email'],
    ['+5511999999999', 'phone'],
    ['123e4567-e89b-12d3-a456-426614174000', 'random'],
  ] as const)('detecta %s como %s', (value, expected) => {
    expect(detectPixKeyType(value)).toBe(expected);
  });

  it('não classifica valor desconhecido', () => {
    expect(detectPixKeyType('chave-inexistente')).toBeNull();
  });
});
