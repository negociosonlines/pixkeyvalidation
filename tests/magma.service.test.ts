import { describe, expect, it, vi } from 'vitest';
import { MagmaService } from '../src/services/magma.service.js';
import { ProviderError } from '../src/shared/errors.js';

const config = {
  baseUrl: 'https://magmadatahub.com/api.php',
  token: 'server-only-token',
  timeoutMs: 50,
  realRequestsEnabled: true,
};

describe('MagmaService', () => {
  it('bloqueia chamada externa quando o opt-in real está desligado', async () => {
    const fetchMock = vi.fn();
    const service = new MagmaService({ ...config, realRequestsEnabled: false }, fetchMock);

    await expect(service.lookupCpf('52998224725')).rejects.toMatchObject({
      status: 503,
      code: 'REAL_PROVIDER_REQUESTS_DISABLED',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('envia CPF e token como query params e aplica whitelist ao retorno', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      expect(url.searchParams.get('cpf')).toBe('52998224725');
      expect(url.searchParams.get('token')).toBe('server-only-token');
      return new Response(JSON.stringify({
        cpf: '52998224725',
        nome: 'Maria da Silva',
        sexo: 'F',
        nascimento: '01/01/1990',
        nome_mae: 'Outra Pessoa',
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const service = new MagmaService(config, fetchMock);

    await expect(service.lookupCpf('52998224725')).resolves.toEqual({
      found: true,
      name: 'Maria da Silva',
    });
  });

  it('trata resposta vazia e 404 como registro não encontrado', async () => {
    const emptyService = new MagmaService(config, vi.fn(async () => new Response('{}', { status: 200 })));
    const missingService = new MagmaService(config, vi.fn(async () => new Response('{}', { status: 404 })));

    await expect(emptyService.lookupCpf('52998224725')).resolves.toEqual({ found: false });
    await expect(missingService.lookupCpf('52998224725')).resolves.toEqual({ found: false });
  });

  it.each([
    [400, 502, 'REGISTRY_PROVIDER_INTEGRATION_ERROR'],
    [403, 503, 'REGISTRY_PROVIDER_UNAVAILABLE'],
    [502, 502, 'REGISTRY_PROVIDER_ERROR'],
  ] as const)('mapeia HTTP %i do provider', async (providerStatus, status, code) => {
    const service = new MagmaService(
      config,
      vi.fn(async () => new Response('{}', { status: providerStatus })),
    );

    await expect(service.lookupCpf('52998224725')).rejects.toMatchObject({ status, code });
  });

  it('mapeia timeout sem expor detalhes internos', async () => {
    const fetchMock = vi.fn((_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const service = new MagmaService({ ...config, timeoutMs: 5 }, fetchMock);

    await expect(service.lookupCpf('52998224725')).rejects.toEqual(new ProviderError(
      504,
      'REGISTRY_PROVIDER_TIMEOUT',
      'O serviço de verificação cadastral não respondeu a tempo.',
    ));
  });

  it('mapeia JSON inválido como erro do provider', async () => {
    const service = new MagmaService(
      config,
      vi.fn(async () => new Response('não é json', { status: 200 })),
    );

    await expect(service.lookupCpf('52998224725')).rejects.toMatchObject({
      status: 502,
      code: 'REGISTRY_PROVIDER_ERROR',
    });
  });
});
