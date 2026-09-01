import type { NextFunction, Request, Response } from 'express';
import type { RegistryLookup } from '../services/magma.service.js';
import { verifyPixKey } from '../services/pix-verification.service.js';

export function createVerifyPixController(registry: RegistryLookup) {
  return async function verifyPixController(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (typeof req.body?.pixKeyType === 'string') {
        res.locals.auditKeyType = req.body.pixKeyType;
      }
      const data = await verifyPixKey(req.body, registry);
      res.locals.auditKeyType = data.keyValidation.type;
      res.locals.auditProvider = data.keyValidation.type === 'cpf' ? 'magma' : 'not_checked';
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };
}
