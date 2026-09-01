import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import type { AppConfig } from '../src/config/env.js';
import type { RegistryLookup } from '../src/services/magma.service.js';
import { ProviderError } from '../src/shared/errors.js';

const baseConfig: AppConfig = {
  nodeEnv: 'test',
  host: '127.0.0.1',
  port: 3000,
  magmaBaseUrl: 'https://magmadatahub.com/api.php',
  magmaToken: 'configured-token',
  magmaTimeoutMs: 8000,
  corsAllowedOrigins: ['https://pv-etapas.pages.dev', 'http://localhost:5173'],
  rateLimitWindowMs: 60_000,
  rateLimitMax: 10,
  logDir: './logs',
  realProviderRequestsEnabled: false,
};

function buildRegistry(found = true): RegistryLookup {
  return {
    lookupCpf: vi.fn(async () => found ? { found: true, name: 'Maria da Silva' } : { found: false }),
  };
}

describe('POST /api/consulta', () => {
  it('valida CPF, consulta o cadastro e não afirma vínculo com Pix', async () => {
    const registry = buildRegistry();
    const app = createApp(baseConfig, registry);

    const response = await request(app)
      .post('/api/consulta')
      .send({ pixKey: '529.982.247-25', pixKeyType: 'cpf' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        keyValidation: {
          type: 'cpf',
          syntaxValid: true,
          normalized: '***.***.247-25',
        },
        registryVerification: {
          checked: true,
          found: true,
          name: 'Maria da Silva',
        },
        pixOwnershipVerification: {
          verified: false,
          status: 'not_checked',
        },
      },
    });
    expect(registry.lookupCpf).toHaveBeenCalledOnce();
    expect(registry.lookupCpf).toHaveBeenCalledWith('52998224725');
  });

  it('não consulta o provider quando o CPF é inválido', async () => {
    const registry = buildRegistry();
    const app = createApp(baseConfig, registry);

    const response = await request(app)
      .post('/api/consulta')
      .send({ pixKey: '111.111.111-11', pixKeyType: 'cpf' });

    expect(response.status).toBe(422);
    expect(response.body).toEqual({
      success: false,
      code: 'INVALID_PIX_KEY',
      message: 'CPF inválido.',
      data: { type: 'cpf', syntaxValid: false },
    });
    expect(registry.lookupCpf).not.toHaveBeenCalled();
  });

  it('detecta e valida tipos não suportados pela Magma sem consultar o provider', async () => {
    const registry = buildRegistry();
    const app = createApp(baseConfig, registry);

    const response = await request(app)
      .post('/api/consulta')
      .send({ pixKey: 'pessoa@exemplo.com' });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      keyValidation: {
        type: 'email',
        syntaxValid: true,
        normalized: 'pessoa@exemplo.com',
      },
      registryVerification: {
        checked: false,
        reason: 'provider_not_supported_for_key_type',
      },
      pixOwnershipVerification: {
        verified: false,
        status: 'not_checked',
      },
    });
    expect(registry.lookupCpf).not.toHaveBeenCalled();
  });

  it('rejeita tipo desconhecido e chave acima de 320 caracteres', async () => {
    const registry = buildRegistry();
    const app = createApp(baseConfig, registry);

    const unknownType = await request(app)
      .post('/api/consulta')
      .send({ pixKey: '52998224725', pixKeyType: 'evp' });
    const oversized = await request(app)
      .post('/api/consulta')
      .send({ pixKey: `${'a'.repeat(315)}@x.com` });

    expect(unknownType.status).toBe(400);
    expect(unknownType.body.code).toBe('INVALID_REQUEST');
    expect(oversized.status).toBe(400);
    expect(oversized.body.code).toBe('INVALID_REQUEST');
    expect(registry.lookupCpf).not.toHaveBeenCalled();
  });

  it('autoriza apenas origins configuradas', async () => {
    const app = createApp(baseConfig, buildRegistry());

    const allowed = await request(app)
      .options('/api/consulta')
      .set('Origin', 'https://pv-etapas.pages.dev')
      .set('Access-Control-Request-Method', 'POST');
    const blocked = await request(app)
      .options('/api/consulta')
      .set('Origin', 'https://malicioso.exemplo')
      .set('Access-Control-Request-Method', 'POST');

    expect(allowed.status).toBe(204);
    expect(allowed.headers['access-control-allow-origin']).toBe('https://pv-etapas.pages.dev');
    expect(blocked.status).toBe(403);
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('aplica rate limit configurável ao endpoint', async () => {
    const app = createApp({ ...baseConfig, rateLimitMax: 1 }, buildRegistry());

    const first = await request(app).post('/api/consulta').send({ pixKey: 'pessoa@exemplo.com' });
    const second = await request(app).post('/api/consulta').send({ pixKey: 'pessoa@exemplo.com' });

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(second.body.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('retorna provider desabilitado sem executar fallback', async () => {
    const registry: RegistryLookup = {
      lookupCpf: vi.fn(async () => {
        throw new ProviderError(503, 'REAL_PROVIDER_REQUESTS_DISABLED', 'As consultas reais ao provider estão desabilitadas.');
      }),
    };
    const app = createApp(baseConfig, registry);

    const response = await request(app)
      .post('/api/consulta')
      .send({ pixKey: '52998224725', pixKeyType: 'cpf' });

    expect(response.status).toBe(503);
    expect(response.body.code).toBe('REAL_PROVIDER_REQUESTS_DISABLED');
    expect(registry.lookupCpf).toHaveBeenCalledOnce();
  });

  it('mapeia erro mockado do provider', async () => {
    const registry: RegistryLookup = {
      lookupCpf: vi.fn(async () => {
        throw new ProviderError(502, 'REGISTRY_PROVIDER_ERROR', 'Não foi possível consultar a base cadastral.');
      }),
    };
    const app = createApp(baseConfig, registry);

    const response = await request(app)
      .post('/api/consulta')
      .send({ pixKey: '52998224725', pixKeyType: 'cpf' });

    expect(response.status).toBe(502);
    expect(response.body.code).toBe('REGISTRY_PROVIDER_ERROR');
    expect(registry.lookupCpf).toHaveBeenCalledOnce();
  });
});

describe('GET /health', () => {
  it('informa apenas se a integração está configurada', async () => {
    const app = createApp(baseConfig, buildRegistry());
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', magmaConfigured: true });
    expect(JSON.stringify(response.body)).not.toContain(baseConfig.magmaToken);
  });
});
