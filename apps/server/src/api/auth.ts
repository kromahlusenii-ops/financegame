import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { signUp, signIn, verifyToken } from '../lib/auth.js';
import { validateBody } from '../lib/validate.js';

const router = Router();

const AuthSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  displayName: z.string().min(1).max(100).optional(),
});

// POST /api/auth/signup
router.post('/signup', validateBody(AuthSchema), async (req: Request, res: Response) => {
  try {
    const { email, password, displayName } = req.body;
    const result = await signUp(email, password, displayName || email.split('@')[0]);
    res.status(201).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sign up failed';
    res.status(400).json({ error: message });
  }
});

// POST /api/auth/signin
router.post('/signin', validateBody(AuthSchema), async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const result = await signIn(email, password);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sign in failed';
    res.status(401).json({ error: message });
  }
});

// GET /api/auth/me
router.get('/me', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const result = await verifyToken(authHeader.slice(7));
    if (!result) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    res.json({ userId: result.userId });
  } catch {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

export { router as authRouter };
