import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { AppConfig } from '../config/env.js';
import { createVerifyPixController } from '../controllers/pix.controller.js';
import type { RegistryLookup } from '../services/magma.service.js';

export function createPixRouter(config: AppConfig, registry: RegistryLookup): Router {
  const router = Router();
  const limiter = rateLimit({
    windowMs: config.rateLimitWindowMs,
    limit: config.rateLimitMax,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => {
      res.locals.auditErrorCode = 'RATE_LIMIT_EXCEEDED';
      res.status(429).json({
        success: false,
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Limite de consultas excedido. Tente novamente mais tarde.',
      });
    },
  });

  router.post('/consulta', limiter, createVerifyPixController(registry));
  return router;
}
