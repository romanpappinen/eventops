import cors from 'cors';
import express from 'express';
import { getHealthMessage } from '@eventops/shared';
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
    app.use('/tenants', tenantsRouter);

    return app;
}
