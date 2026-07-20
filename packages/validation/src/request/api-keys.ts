import { z } from 'zod';

export const createApiKeyDtoSchema = z.object({
    name: z.string().trim().min(1).max(80),
}).strict();

export type CreateApiKeyDto = z.infer<typeof createApiKeyDtoSchema>;

export const tenantApiKeyParamsDtoSchema = z.object({
    tenantId: z.string().uuid(),
});

export type TenantApiKeyParamsDto = z.infer<typeof tenantApiKeyParamsDtoSchema>;

export const apiKeyParamsDtoSchema = z.object({
    tenantId: z.string().uuid(),
    apiKeyId: z.string().uuid(),
});

export type ApiKeyParamsDto = z.infer<typeof apiKeyParamsDtoSchema>;
