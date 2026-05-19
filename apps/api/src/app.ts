import cors from 'cors';
import express from 'express';
import { getHealthMessage } from '@eventops/shared';
import { errorHandler } from './middleware/error-handler.js';
import { eventsRouter } from './modules/events/events.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import {tenantsRouter} from "./modules/tenants/tenants.routes";

export function createApp() {
    const app = express();

    app.use(cors());
    app.use(express.json());

    app.get(['/health', '/ready', '/live'], (_req, res) => {
        res.json({
            status: 'ok',
            service: getHealthMessage()
        });
    });

    app.use('/auth', authRouter);
    app.use('/tenants/:tenantId/events', eventsRouter);
    app.use('/tenants', tenantsRouter);
    app.use(errorHandler);

    return app;
}
