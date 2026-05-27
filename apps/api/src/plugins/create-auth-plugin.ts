import type { FastifyInstance } from 'fastify';
import { authRoutes } from '../routes/auth.js';
import { mfaRoutes } from '../routes/mfa.js';
import { authenticate } from './auth.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: typeof authenticate;
  }
}

/** Registers local auth + MFA routes and JWT authentication helper. */
export async function createAuthPlugin(app: FastifyInstance): Promise<void> {
  app.decorate('authenticate', authenticate);
  await app.register(authRoutes);
  await app.register(mfaRoutes);
}
