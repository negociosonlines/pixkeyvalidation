import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import type { AppConfig } from '../src/config/env.js';
import type { RegistryLookup } from '../src/services/magma.service.js';

const baseConfig: AppConfig = {
  nodeEnv: 'test',
  host: '127.0.0.1',
  port: 3000,
  magmaBaseUrl: 'https://magmadatahub.com/api.php',
  magmaToken: 'configured-token',
  magmaTimeoutMs: 8000,
  corsAllowedOrigins: ['https://frontend.exemplo.com', 'http://localhost:5173'],
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

describe('POST /api/pix/verify', () => {
  it('valida CPF, consulta o cadastro e não afirma vínculo com Pix', async () => {
    const registry = buildRegistry();
    const app = createApp(baseConfig, registry);

    const response = await request(app)
      .post('/api/pix/verify')
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
      .post('/api/pix/verify')
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
      .post('/api/pix/verify')
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
      .post('/api/pix/verify')
      .send({ pixKey: '52998224725', pixKeyType: 'evp' });
    const oversized = await request(app)
      .post('/api/pix/verify')
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
      .options('/api/pix/verify')
      .set('Origin', 'https://frontend.exemplo.com')
      .set('Access-Control-Request-Method', 'POST');
    const blocked = await request(app)
      .options('/api/pix/verify')
      .set('Origin', 'https://malicioso.exemplo')
      .set('Access-Control-Request-Method', 'POST');

    expect(allowed.status).toBe(204);
    expect(allowed.headers['access-control-allow-origin']).toBe('https://frontend.exemplo.com');
    expect(blocked.status).toBe(403);
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('aplica rate limit configurável ao endpoint', async () => {
    const app = createApp({ ...baseConfig, rateLimitMax: 1 }, buildRegistry());

    const first = await request(app).post('/api/pix/verify').send({ pixKey: 'pessoa@exemplo.com' });
    const second = await request(app).post('/api/pix/verify').send({ pixKey: 'pessoa@exemplo.com' });

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(second.body.code).toBe('RATE_LIMIT_EXCEEDED');
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
