import { z } from 'zod';
import { ROLE_VALUES } from './roles.js';

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
