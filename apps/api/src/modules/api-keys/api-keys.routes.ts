import { Router } from 'express';
import * as apiKeyValidation from '@eventops/validation';
import { asyncHandler } from '../../middleware/async-handler.js';
import { requireAuth } from '../../middleware/require-auth.js';
import { validate } from '../../middleware/validate.js';
import { requireTenantAccess } from '../tenants/tenant-access.middleware.js';
import { createApiKey, listApiKeys, revokeApiKey } from './api-keys.controller.js';

export const apiKeysRouter = Router({ mergeParams: true });

apiKeysRouter.get(
    '/',
    requireAuth,
    validate(apiKeyValidation.tenantApiKeyParamsDtoSchema, 'params'),
    requireTenantAccess({ minimumRole: 'owner' }),
    asyncHandler(listApiKeys)
);

apiKeysRouter.post(
    '/',
    requireAuth,
    validate(apiKeyValidation.tenantApiKeyParamsDtoSchema, 'params'),
    requireTenantAccess({ minimumRole: 'owner' }),
    validate(apiKeyValidation.createApiKeyDtoSchema, 'body'),
    asyncHandler(createApiKey)
);

apiKeysRouter.delete(
    '/:apiKeyId',
    requireAuth,
    validate(apiKeyValidation.apiKeyParamsDtoSchema, 'params'),
    requireTenantAccess({ minimumRole: 'owner' }),
    asyncHandler(revokeApiKey)
);
