"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tenantEventParamsDtoSchema = exports.eventParamsDtoSchema = exports.createEventDtoSchema = void 0;
var zod_1 = require("zod");
var eventObjectSchema = zod_1.z.record(zod_1.z.string(), zod_1.z.unknown());
exports.createEventDtoSchema = zod_1.z.object({
    source: zod_1.z.string().trim().min(2).max(80),
    type: zod_1.z.string().trim().min(2).max(120).regex(/^[a-z0-9._-]+$/),
    subject: zod_1.z
        .string()
        .trim()
        .max(160)
        .optional()
        .transform(function (value) { return (value && value.length > 0 ? value : undefined); }),
    occurredAt: zod_1.z.string().datetime({ offset: true }),
    payload: eventObjectSchema,
    metadata: eventObjectSchema.optional().default({}),
}).strict();
exports.eventParamsDtoSchema = zod_1.z.object({
    tenantId: zod_1.z.string().uuid(),
    eventId: zod_1.z.string().uuid(),
});
exports.tenantEventParamsDtoSchema = zod_1.z.object({
    tenantId: zod_1.z.string().uuid(),
});
