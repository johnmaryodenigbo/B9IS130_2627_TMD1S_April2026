import { z } from 'zod';
import { ROLE_VALUES } from './roles.js';
import { HTTP_METHODS, ENVIRONMENTS, LIMITS } from './monitorOptions.js';

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1, 'Password is required'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: password,
});

export const createUserSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email(),
  password,
  role: z.enum(ROLE_VALUES),
});

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    role: z.enum(ROLE_VALUES).optional(),
    isActive: z.boolean().optional(),
    password: password.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update');

// ---------- Monitors (inventory) ----------
  
  const monitorFields = {
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().max(500),
    url: z.url({ protocol: /^https?$/, error: 'Must be a valid http:// or https:// URL' }),
    method: z.enum(HTTP_METHODS),
    expectedStatus: z.number().int().min(100).max(599),
    intervalSeconds: z.number().int().min(LIMITS.intervalSeconds.min).max(LIMITS.intervalSeconds.max),
    timeoutMs: z.number().int().min(LIMITS.timeoutMs.min).max(LIMITS.timeoutMs.max),
    environment: z.enum(ENVIRONMENTS),
    isActive: z.boolean(),
    isPublic: z.boolean(),
  };
  
  // name + url are required; everything else falls back to the model defaults.
  export const createMonitorSchema = z.object({
    ...Object.fromEntries(Object.entries(monitorFields).map(([k, v]) => [k, v.optional()])),
    name: monitorFields.name,
    url: monitorFields.url,
  });
  
  export const updateMonitorSchema = z
    .object(Object.fromEntries(Object.entries(monitorFields).map(([k, v]) => [k, v.optional()])))
    .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update');
  