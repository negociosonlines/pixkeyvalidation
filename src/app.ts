import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import type { AppConfig } from './config/env.js';
import { noOpAuditLogger, type AuditLogger } from './observability/audit-logger.js';
import { createPixRouter } from './routes/pix.routes.js';
import type { RegistryLookup } from './services/magma.service.js';
import { AppError } from './shared/errors.js';

export function createApp(
  config: AppConfig,
  registry: RegistryLookup,
  auditLogger: AuditLogger = noOpAuditLogger,
) {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({
    origin(origin, callback) {
      if (!origin || config.corsAllowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new AppError(403, 'CORS_ORIGIN_DENIED', 'Origin não autorizada.'));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
    maxAge: 86400,
  }));
  app.use(express.json({ limit: '10kb', strict: true }));
  app.use((req, res, next) => {
    const requestId = randomUUID();
    const requestPath = req.originalUrl.split('?')[0] ?? req.originalUrl;
    const startedAt = process.hrtime.bigint();
    res.setHeader('x-request-id', requestId);
    res.on('finish', () => {
      if (requestPath !== '/api/consulta') {
        return;
      }

      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      auditLogger.log('pix_verification_completed', {
        requestId,
        method: req.method,
        path: requestPath,
        keyType: typeof res.locals.auditKeyType === 'string' ? res.locals.auditKeyType : 'unknown',
        provider: typeof res.locals.auditProvider === 'string' ? res.locals.auditProvider : 'not_checked',
        status: res.statusCode,
        success: res.statusCode < 400,
        durationMs: Math.round(durationMs),
        ...(typeof res.locals.auditErrorCode === 'string' ? { errorCode: res.locals.auditErrorCode } : {}),
      });
    });
    next();
  });

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', magmaConfigured: Boolean(config.magmaToken) });
  });
  app.use('/api', createPixRouter(config, registry))

  app.use((_req, res) => {
    res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Endpoint não encontrado.' });
  });

  app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    void next;
    if (error instanceof AppError) {
      res.locals.auditErrorCode = error.code;
      res.status(error.status).json({
        success: false,
        code: error.code,
        message: error.message,
        ...(error.data !== undefined ? { data: error.data } : {}),
      });
      return;
    }

    if (error instanceof SyntaxError && 'status' in error && error.status === 400) {
      res.locals.auditErrorCode = 'INVALID_JSON';
      res.status(400).json({ success: false, code: 'INVALID_JSON', message: 'JSON inválido.' });
      return;
    }

    if (typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.too.large') {
      res.locals.auditErrorCode = 'PAYLOAD_TOO_LARGE';
      res.status(413).json({ success: false, code: 'PAYLOAD_TOO_LARGE', message: 'Payload excede o limite permitido.' });
      return;
    }

    res.locals.auditErrorCode = 'INTERNAL_ERROR';
    res.status(500).json({ success: false, code: 'INTERNAL_ERROR', message: 'Erro interno do servidor.' });
  });

  return app;
}