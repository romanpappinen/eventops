import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler.js';
import { requireAuth } from '../../middleware/require-auth.js';
import { validate } from '../../middleware/validate.js';
import { getMe, register } from './auth.controller.js';
import { registerSchema } from './auth.schemas.js';

export const authRouter = Router();

authRouter.post('/register', validate(registerSchema, 'body'), asyncHandler(register));
authRouter.get('/me', requireAuth, getMe);
