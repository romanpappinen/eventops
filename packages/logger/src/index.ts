import pino from 'pino';

function resolveLevel() {
    if (process.env.LOG_LEVEL) {
        return process.env.LOG_LEVEL;
    }

    if (process.env.NODE_ENV === 'test') {
        return 'silent';
    }

    return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

export function createLogger(service: string) {
    const isDevelopment = process.env.NODE_ENV === 'development';

    return pino({
        name: service,
        level: resolveLevel(),
        ...(isDevelopment
            ? {
                  transport: {
                      target: 'pino-pretty',
                      options: {
                          colorize: true,
                          translateTime: 'HH:MM:ss',
                          ignore: 'pid,hostname',
                      },
                  },
              }
            : {}),
    });
}

export type Logger = ReturnType<typeof createLogger>;
