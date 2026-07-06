import type { FastifyInstance } from 'fastify';
import { eq, and, or, inArray } from 'drizzle-orm';
import { db, users, organisations, sites } from '@eam/db';
// FIX: import authenticate directly rather than calling
// request.server.authenticate(request). The latter only works for routes
// registered *inside* createAuthPlugin's function body (authRoutes,
// mfaRoutes) — Fastify encapsulates app.decorate() calls to the plugin
// context they're made in, and accountRoutes is registered as a sibling
// in index.ts, not a child of createAuthPlugin, so the decorator was never
// visible here. Every call below previously threw "request.server
// .authenticate is not a function", which the catch block turned into a
// 401 — and the frontend's api() helper treats any 401 as a dead session
// and force-logs-out, which is what caused the login-redirect bug.
import { authenticate } from '../plugins/auth.js';
import { hashPassword, verifyPassword, validatePasswordPolicy, DEFAULT_PASSWORD_POLICY } from '@eam/auth';

// FIX (Gap analysis — User Profile #24-27): Maximo's "Default Information"
// and "Personal Information" screens, reached via the top-right profile
// icon menu, available to EVERY logged-in user regardless of role (not an
// admin-only screen — see screenshots: Storekeeper/Warehouse Manager
// accounts see the exact same menu). This is distinct from the
// Organisation-level admin config (admin-org.ts) which only an admin with
// admin:config:manage can touch.
//
// Two endpoints:
//   GET/PUT /account/default-info     — Default Insert Site/Org, display
//                                        filter, side-nav mode, self-service
//                                        storeroom, default app, locale.
//   GET/PUT /account/personal-info    — phone, e-mail, division/department.
//
// Both operate only on request.user!.id — a user can only ever read/edit
// their own record here. Admin-driven assignment of another user's default
// site stays in admin-identity.ts (separate concern, separate guard).

export async function accountRoutes(app: FastifyInstance) {
  // ─── Lookups for the Default Information pickers ──────────────────────
  // Any authenticated user needs to browse Sites/Orgs to set their own
  // Default Insert Site — /admin/org/sites is gated by admin:config:manage
  // and would 403 for a Storekeeper/Warehouse Manager, so this is a
  // deliberately narrow, read-only, name-only list, not a duplicate of the
  // admin CRUD endpoint.

  app.get('/account/lookups/sites', async (request, reply) => {
    try {
      await authenticate(request);
    } catch (e) {
      return reply.status(401).send(e);
    }

    // FIX (Issue: Default Site dropdown showed every Site in the tenant):
    // this picker must only offer Sites the user's Security Group actually
    // authorizes — same scope object already enforced on /assets,
    // /locations, /work-orders. A user with "Authorize for Sites: SITE001,
    // SITE002" should never be able to pick SITE005 as their Default
    // Insert Site just because it exists in the tenant. unrestricted
    // (Maximo's "Authorize Group for All Sites?") still sees everything,
    // matching how admins/unrestricted roles work elsewhere.
    const scope = request.user!.scope;
    const scopeFilter = scope?.unrestricted
      ? undefined
      : or(
          scope?.organisationIds?.length ? inArray(sites.orgId, scope.organisationIds) : undefined,
          scope?.siteIds?.length ? inArray(sites.id, scope.siteIds) : undefined,
        );

    const rows = await db
      .select({ id: sites.id, name: sites.name, siteNum: sites.siteNum, orgId: sites.orgId })
      .from(sites)
      .where(and(eq(sites.tenantId, request.user!.tenantId), eq(sites.isActive, true), scopeFilter))
      .orderBy(sites.name);
    return reply.send(rows);
  });

  app.get('/account/lookups/organisations', async (request, reply) => {
    try {
      await authenticate(request);
    } catch (e) {
      return reply.status(401).send(e);
    }

    // FIX: same scope rule as the sites lookup above — don't offer
    // Organisations the user's Security Group doesn't authorize.
    const scope = request.user!.scope;
    const scopeFilter = scope?.unrestricted
      ? undefined
      : (scope?.organisationIds?.length ? inArray(organisations.id, scope.organisationIds) : undefined);

    const rows = await db
      .select({ id: organisations.id, name: organisations.name, code: organisations.code })
      .from(organisations)
      .where(and(eq(organisations.tenantId, request.user!.tenantId), eq(organisations.isActive, true), scopeFilter))
      .orderBy(organisations.name);
    return reply.send(rows);
  });

  // ─── Default Information ───────────────────────────────────────────────

  app.get('/account/default-info', async (request, reply) => {
    try {
      await authenticate(request);
    } catch (e) {
      return reply.status(401).send(e);
    }

    const [user] = await db
      .select({
        defaultOrgId: users.defaultOrgId,
        defaultSiteId: users.defaultSiteId,
        useDefaultSiteAsFilter: users.useDefaultSiteAsFilter,
        sideNavMode: users.sideNavMode,
        storeroomSiteId: users.storeroomSiteId,
        defaultStoreroom: users.defaultStoreroom,
        userDefaultApplication: users.userDefaultApplication,
        language: users.language,
        locale: users.locale,
        timezone: users.timezone,
        calendarType: users.calendarType,
        defaultRepairFacility: users.defaultRepairFacility,
      })
      .from(users)
      .where(eq(users.id, request.user!.id))
      .limit(1);

    if (!user) return reply.status(404).send({ error: 'User not found' });

    // Resolve names for display (e.g. "L3456 — Flow Consortium") so the
    // frontend doesn't need a second round-trip just to label the lookup.
    const [site] = user.defaultSiteId
      ? await db.select({ id: sites.id, name: sites.name, siteNum: sites.siteNum })
          .from(sites).where(eq(sites.id, user.defaultSiteId)).limit(1)
      : [null];
    const [org] = user.defaultOrgId
      ? await db.select({ id: organisations.id, name: organisations.name, code: organisations.code })
          .from(organisations).where(eq(organisations.id, user.defaultOrgId)).limit(1)
      : [null];
    const [storeroomSite] = user.storeroomSiteId
      ? await db.select({ id: sites.id, name: sites.name, siteNum: sites.siteNum })
          .from(sites).where(eq(sites.id, user.storeroomSiteId)).limit(1)
      : [null];

    return reply.send({ ...user, defaultSite: site, defaultOrg: org, storeroomSite });
  });

  app.put('/account/default-info', async (request, reply) => {
    try {
      await authenticate(request);
    } catch (e) {
      return reply.status(401).send(e);
    }

    const body = request.body as {
      defaultOrgId?: string | null;
      defaultSiteId?: string | null;
      useDefaultSiteAsFilter?: boolean;
      sideNavMode?: 'DISPLAY' | 'HIDE' | 'SECURITY_GROUP';
      storeroomSiteId?: string | null;
      defaultStoreroom?: string | null;
      userDefaultApplication?: string;
      language?: string | null;
      locale?: string | null;
      timezone?: string | null;
      calendarType?: string | null;
      defaultRepairFacility?: string | null;
    };

    const tenantId = request.user!.tenantId;

    // Validate defaultSiteId / storeroomSiteId belong to this tenant before
    // saving — this is the FK check we can't do at the DB layer (see
    // identity.ts comment on the circular-import workaround).
    if (body.defaultSiteId) {
      const [s] = await db.select({ id: sites.id, orgId: sites.orgId })
        .from(sites)
        .where(and(eq(sites.id, body.defaultSiteId), eq(sites.tenantId, tenantId)))
        .limit(1);
      if (!s) return reply.status(400).send({ error: 'Default Insert Site not found for this tenant' });
      // Organisation always follows the Default Insert Site — derive from
      // the Site's owning Org on every save (not only when the client sent
      // null/omitted), so stale null defaultOrgId rows are backfilled too.
      body.defaultOrgId = s.orgId ?? null;
    }
    if (body.defaultOrgId) {
      const [o] = await db.select({ id: organisations.id })
        .from(organisations)
        .where(and(eq(organisations.id, body.defaultOrgId), eq(organisations.tenantId, tenantId)))
        .limit(1);
      if (!o) return reply.status(400).send({ error: 'Default Organisation not found for this tenant' });
    }
    if (body.storeroomSiteId) {
      const [s] = await db.select({ id: sites.id })
        .from(sites)
        .where(and(eq(sites.id, body.storeroomSiteId), eq(sites.tenantId, tenantId)))
        .limit(1);
      if (!s) return reply.status(400).send({ error: 'Storeroom Site not found for this tenant' });
    }

    const [updated] = await db
      .update(users)
      .set({
        ...(body.defaultOrgId !== undefined && { defaultOrgId: body.defaultOrgId }),
        ...(body.defaultSiteId !== undefined && { defaultSiteId: body.defaultSiteId }),
        ...(body.useDefaultSiteAsFilter !== undefined && { useDefaultSiteAsFilter: body.useDefaultSiteAsFilter }),
        ...(body.sideNavMode !== undefined && { sideNavMode: body.sideNavMode }),
        ...(body.storeroomSiteId !== undefined && { storeroomSiteId: body.storeroomSiteId }),
        ...(body.defaultStoreroom !== undefined && { defaultStoreroom: body.defaultStoreroom }),
        ...(body.userDefaultApplication !== undefined && { userDefaultApplication: body.userDefaultApplication }),
        ...(body.language !== undefined && { language: body.language }),
        ...(body.locale !== undefined && { locale: body.locale }),
        ...(body.timezone !== undefined && { timezone: body.timezone }),
        ...(body.calendarType !== undefined && { calendarType: body.calendarType }),
        ...(body.defaultRepairFacility !== undefined && { defaultRepairFacility: body.defaultRepairFacility }),
        updatedAt: new Date(),
      })
      .where(eq(users.id, request.user!.id))
      .returning();

    return reply.send(updated);
  });

  // ─── Personal Information ──────────────────────────────────────────────
  // Phone/email already exist on `users`; division/department too. This
  // mirrors the second profile-menu screen from the screenshots so both
  // tabs are covered by one route file.

  app.get('/account/personal-info', async (request, reply) => {
    try {
      await authenticate(request);
    } catch (e) {
      return reply.status(401).send(e);
    }
    const [user] = await db
      .select({
        id: users.id,
        displayName: users.displayName,
        email: users.email,
        phone: users.phone,
        department: users.department,
        defaultOrgId: users.defaultOrgId,
        defaultSiteId: users.defaultSiteId,
      })
      .from(users)
      .where(eq(users.id, request.user!.id))
      .limit(1);
    if (!user) return reply.status(404).send({ error: 'User not found' });

    // Organisation comes from Default Organisation when set, otherwise from
    // the owning Org of Default Insert Site (covers users whose defaultOrgId
    // was never backfilled when they first saved a Default Site).
    let orgId = user.defaultOrgId;
    if (!orgId && user.defaultSiteId) {
      const [site] = await db.select({ orgId: sites.orgId })
        .from(sites).where(eq(sites.id, user.defaultSiteId)).limit(1);
      orgId = site?.orgId ?? null;
    }
    const [org] = orgId
      ? await db.select({ name: organisations.name })
          .from(organisations).where(eq(organisations.id, orgId)).limit(1)
      : [null];

    return reply.send({
      id: user.id,
      phone: user.phone,
      department: user.department,
      organisationName: org?.name ?? null,
    });
  });

  app.put('/account/personal-info', async (request, reply) => {
    try {
      await authenticate(request);
    } catch (e) {
      return reply.status(401).send(e);
    }
    const body = request.body as {
      phone?: string | null;
      department?: string | null;
    };
    const [updated] = await db
      .update(users)
      .set({
        ...(body.phone !== undefined && { phone: body.phone }),
        ...(body.department !== undefined && { department: body.department }),
        updatedAt: new Date(),
      })
      .where(eq(users.id, request.user!.id))
      .returning({
        id: users.id,
        phone: users.phone,
        department: users.department,
      });
    return reply.send(updated);
  });

  // FIX (Gap analysis — "Password Information" modal was wired to call
  // this endpoint, but it never existed on the backend at all — every
  // save attempt failed silently into the modal's generic error message.
  // Requires re-entering the current password as proof of identity
  // before changing it, same as the self-service pattern used elsewhere
  // in auth.ts (see PUT /auth/password there for the equivalent
  // logged-out/reset-token flow — this is the logged-in counterpart).
  app.put('/account/password', async (request, reply) => {
    try {
      await authenticate(request);
    } catch (e) {
      return reply.status(401).send(e);
    }
    const body = request.body as { currentPassword?: string; newPassword?: string };
    if (!body.currentPassword || !body.newPassword) {
      return reply.status(400).send({ error: 'Current password and new password are required.' });
    }

    const [user] = await db.select({ passwordHash: users.passwordHash })
      .from(users).where(eq(users.id, request.user!.id)).limit(1);

    // FIX: an account with no passwordHash at all (managed externally via
    // AD/LDAP/SSO) has nothing here to verify against — tell the user to
    // change it at the source instead of letting them set a local
    // password that the login flow would never actually check.
    if (!user?.passwordHash) {
      return reply.status(400).send({
        error: 'This account is managed by an external identity provider. Change your password there instead.',
      });
    }

    const currentValid = await verifyPassword(user.passwordHash, body.currentPassword);
    if (!currentValid) {
      return reply.status(401).send({ error: 'Current password is incorrect.' });
    }

    const policyCheck = validatePasswordPolicy(body.newPassword, DEFAULT_PASSWORD_POLICY);
    if (!policyCheck.valid) {
      return reply.status(400).send({ error: policyCheck.errors.join(' ') });
    }

    const newHash = await hashPassword(body.newPassword);
    await db.update(users)
      .set({ passwordHash: newHash, passwordChangedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, request.user!.id));

    return reply.send({ ok: true });
  });

  // FIX (Gap analysis — "Set or Modify E-Signature Key" modal called
  // GET /account/esignature on load, which returned a raw Fastify 404
  // because the route never existed — this is what produced the literal
  // "Not Found" error banner shown in the modal. Both routes below are
  // new.
  app.get('/account/esignature', async (request, reply) => {
    try {
      await authenticate(request);
    } catch (e) {
      return reply.status(401).send(e);
    }
    const [user] = await db.select({ esignatureHash: users.esignatureHash, esignatureSetAt: users.esignatureSetAt })
      .from(users).where(eq(users.id, request.user!.id)).limit(1);
    if (!user) return reply.status(404).send({ error: 'User not found' });

    return reply.send({ isSet: !!user.esignatureHash, setAt: user.esignatureSetAt });
  });

  app.put('/account/esignature', async (request, reply) => {
    try {
      await authenticate(request);
    } catch (e) {
      return reply.status(401).send(e);
    }
    const body = request.body as { currentPassword?: string; newKey?: string; confirmKey?: string };
    if (!body.currentPassword || !body.newKey || !body.confirmKey) {
      return reply.status(400).send({ error: 'Your login password, the new key, and its confirmation are all required.' });
    }
    if (body.newKey !== body.confirmKey) {
      return reply.status(400).send({ error: 'E-Signature keys do not match.' });
    }

    const [user] = await db.select({ passwordHash: users.passwordHash })
      .from(users).where(eq(users.id, request.user!.id)).limit(1);

    // FIX: verifying against the LOGIN password (not any existing
    // e-signature key) is intentional — this is "prove it's really you"
    // via the credential the user already has and knows, not a re-auth
    // against the e-signature key itself (which would be circular on
    // first-time setup, when no e-signature key exists yet).
    if (!user?.passwordHash) {
      return reply.status(400).send({
        error: 'This account is managed by an external identity provider — your login password cannot be verified here.',
      });
    }
    const passwordValid = await verifyPassword(user.passwordHash, body.currentPassword);
    if (!passwordValid) {
      return reply.status(401).send({ error: 'Login password is incorrect.' });
    }

    const newHash = await hashPassword(body.newKey);
    const setAt = new Date();
    await db.update(users)
      .set({ esignatureHash: newHash, esignatureSetAt: setAt, updatedAt: new Date() })
      .where(eq(users.id, request.user!.id));

    return reply.send({ ok: true, setAt });
  });
}
