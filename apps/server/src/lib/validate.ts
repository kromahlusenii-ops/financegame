import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';
import { verifyToken } from './auth.js';

export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: 'Validation error',
        details: result.error.flatten(),
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  const result = await verifyToken(token);
  if (!result) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  (req as Request & { userId: string }).userId = result.userId;
  next();
}
