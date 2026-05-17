import { Router } from 'express';
import { requireAuth } from '../../middleware/require-auth.js';
import { getMe, register } from './auth.controller.js';

export const authRouter = Router();

authRouter.post('/register', register);
authRouter.get('/me', requireAuth, getMe);
