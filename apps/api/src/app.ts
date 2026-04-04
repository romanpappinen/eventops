import cors from 'cors';
import express from 'express';
import { getHealthMessage } from '@eventops/shared';

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

    return app;
}
