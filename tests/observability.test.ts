import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import type { AppConfig } from '../src/config/env.js';
import { JsonAuditLogger, type AuditLogger, type AuditRecord } from '../src/observability/audit-logger.js';
import { generateVerificationReport } from '../src/observability/report.js';

const temporaryDirectories: string[] = [];

const config: AppConfig = {
  nodeEnv: 'test',
  host: '127.0.0.1',
  port: 3000,
  magmaBaseUrl: 'https://magmadatahub.com/api.php',
  magmaToken: 'configured-token',
  magmaTimeoutMs: 8000,
  corsAllowedOrigins: ['http://localhost:5173'],
  rateLimitWindowMs: 60_000,
  rateLimitMax: 10,
  logDir: './logs',
  realProviderRequestsEnabled: false,
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('audit logger', () => {
  it('persiste JSONL sem serializar campos proibidos', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pix-audit-'));
    temporaryDirectories.push(directory);
    const output: string[] = [];
    const logger = new JsonAuditLogger(directory, (line) => output.push(line));

    logger.log('pix_verification_completed', {
      requestId: 'request-1',
      keyType: 'cpf',
      status: 200,
      success: true,
      durationMs: 21,
    });

    const persisted = readFileSync(join(directory, 'audit.jsonl'), 'utf8');
    expect(persisted).toBe(output[0]);
    expect(JSON.parse(persisted)).toMatchObject({
      event: 'pix_verification_completed',
      requestId: 'request-1',
      keyType: 'cpf',
      status: 200,
      success: true,
    });
    expect(persisted).not.toMatch(/52998224725|configured-token|Maria da Silva/);
  });

  it('integra o endpoint sem registrar body, CPF, token ou nome', async () => {
    const records: AuditRecord[] = [];
    const logger: AuditLogger = { log: vi.fn((event, fields) => records.push({ timestamp: new Date().toISOString(), event, ...fields })) };
    const registry = { lookupCpf: vi.fn(async () => ({ found: true, name: 'Maria da Silva' })) };
    const app = createApp(config, registry, logger);

    const response = await request(app)
      .post('/api/consulta')
      .send({ pixKey: '52998224725', pixKeyType: 'cpf' });

    const serialized = JSON.stringify(records);
    expect(response.status).toBe(200);
    expect(records).toContainEqual(expect.objectContaining({
      event: 'pix_verification_completed',
      keyType: 'cpf',
      status: 200,
      success: true,
      provider: 'magma',
    }));
    expect(serialized).not.toContain('52998224725');
    expect(serialized).not.toContain('configured-token');
    expect(serialized).not.toContain('Maria da Silva');
    expect(serialized).not.toContain('pixKey');
  });
});

describe('relatório de verificações', () => {
  it('agrega volume, status, tipos e duração a partir do JSONL', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pix-report-'));
    temporaryDirectories.push(directory);
    const source = join(directory, 'audit.jsonl');
    const destination = join(directory, 'summary.json');
    writeFileSync(source, [
      JSON.stringify({ timestamp: '2026-09-01T10:00:00.000Z', event: 'pix_verification_completed', keyType: 'cpf', status: 200, success: true, durationMs: 100 }),
      JSON.stringify({ timestamp: '2026-09-01T10:01:00.000Z', event: 'pix_verification_completed', keyType: 'email', status: 200, success: true, durationMs: 20 }),
      JSON.stringify({ timestamp: '2026-09-01T10:02:00.000Z', event: 'pix_verification_completed', keyType: 'cpf', status: 422, success: false, durationMs: 30, errorCode: 'INVALID_PIX_KEY' }),
      JSON.stringify({ timestamp: '2026-09-01T10:03:00.000Z', event: 'health_check', status: 200, success: true, durationMs: 1 }),
    ].join('\n') + '\n');

    const report = generateVerificationReport(source, destination);

    expect(report).toEqual({
      generatedAt: expect.any(String),
      period: {
        from: '2026-09-01T10:00:00.000Z',
        to: '2026-09-01T10:02:00.000Z',
      },
      total: 3,
      successful: 2,
      failed: 1,
      averageDurationMs: 50,
      byKeyType: { cpf: 2, email: 1 },
      byStatus: { '200': 2, '422': 1 },
      byErrorCode: { INVALID_PIX_KEY: 1 },
    });
    expect(JSON.parse(readFileSync(destination, 'utf8'))).toEqual(report);
  });
});
