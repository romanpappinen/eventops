import cors from 'cors';
import express from 'express';
import { getHealthMessage } from '@eventops/shared';
import {tenantsRouter} from "./modules/tenants/tenants.routes";

export function createApp() {
    const app = express();

    app.use(cors());
    app.use(express.json());

    app.get('/health', (_req, res) => {
        res.json({
            status: 'ok',
            service: getHealthMessage()
        });
    });

    app.use('/tenants', tenantsRouter);

    return app;
}
