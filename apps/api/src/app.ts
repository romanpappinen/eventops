import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express from 'express';
import pinoHttp from 'pino-http';
import { createLogger } from '@eventops/logger';
import { getHealthMessage } from '@eventops/shared';
import { errorHandler } from './middleware/error-handler.js';
import { createRateLimiter } from './middleware/rate-limit.js';
import { eventsRouter } from './modules/events/events.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { invitationsRouter } from './modules/invitations/invitations.routes.js';
import {tenantsRouter} from "./modules/tenants/tenants.routes";

export function createApp() {
    const app = express();

    app.use(
        pinoHttp({
            logger: createLogger('api'),
            genReqId: (req, res) => {
                const header = req.headers['x-request-id'];
                const id = typeof header === 'string' && header.trim() ? header.trim() : randomUUID();
                res.setHeader('X-Request-Id', id);
                return id;
            },
        })
    );

    app.use(cors());
    app.use(express.json());

    app.get(['/health', '/ready', '/live'], (_req, res) => {
        res.json({
            status: 'ok',
            service: getHealthMessage()
        });
    });

    const authRegisterLimiter = createRateLimiter({
        windowMs: 15 * 60 * 1000,
        max: 20,
        message: 'Too many registration attempts. Try again later.',
    });
    const invitationAcceptLimiter = createRateLimiter({
        windowMs: 15 * 60 * 1000,
        max: 30,
        message: 'Too many invitation requests. Try again later.',
    });
    const invitationResendLimiter = createRateLimiter({
        windowMs: 15 * 60 * 1000,
        max: 10,
        message: 'Too many resend requests. Try again later.',
    });

    app.use('/auth/register', authRegisterLimiter);
    app.use('/invitations/accept', invitationAcceptLimiter);
    app.use('/tenants/:tenantId/invitations/:invitationId/resend', invitationResendLimiter);

    app.use('/auth', authRouter);
    app.use('/invitations', invitationsRouter);
    app.use('/tenants/:tenantId/events', eventsRouter);
    app.use('/tenants', tenantsRouter);
    app.use(errorHandler);

    return app;
}
