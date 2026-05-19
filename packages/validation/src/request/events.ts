import { z } from 'zod';

const eventObjectSchema = z.record(z.string(), z.unknown());

export const createEventDtoSchema = z.object({
    source: z.string().trim().min(2).max(80),
    type: z.string().trim().min(2).max(120).regex(/^[a-z0-9._-]+$/),
    subject: z
        .string()
        .trim()
        .max(160)
        .optional()
        .transform((value) => (value && value.length > 0 ? value : undefined)),
    occurredAt: z.string().datetime({ offset: true }),
    payload: eventObjectSchema,
    metadata: eventObjectSchema.optional().default({}),
}).strict();

export type CreateEventDto = z.infer<typeof createEventDtoSchema>;

export const eventParamsDtoSchema = z.object({
    tenantId: z.string().uuid(),
    eventId: z.string().uuid(),
});

export type EventParamsDto = z.infer<typeof eventParamsDtoSchema>;

export const tenantEventParamsDtoSchema = z.object({
    tenantId: z.string().uuid(),
});

export type TenantEventParamsDto = z.infer<typeof tenantEventParamsDtoSchema>;

export const listEventsQueryDtoSchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
}).strict();

export type ListEventsQueryDto = z.infer<typeof listEventsQueryDtoSchema>;
