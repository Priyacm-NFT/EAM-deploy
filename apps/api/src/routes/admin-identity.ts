import type { FastifyInstance } from 'fastify';
import { eq, and, inArray, desc } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import {
  hashPassword,
  validatePasswordPolicy,
  DEFAULT_PASSWORD_POLICY,
  getEffectivePermissions,
  revokeAllSessions,
  signAccessToken,
} from '@eam/auth';
import {
  db,
  users,
  groups,
  roles,
  userGroups,
  groupRoles,
  rolePermissions,
  permissions,
  sessions,
  tenants,
  audit,
  auditLogs,
} from '@eam/db';
import { requirePermission } from '../plugins/auth.js';
import { sendEmail } from '../lib/email.js';
import { storePasswordResetToken } from '../lib/auth-state.js';

const PASSWORD_RESET_TTL = 60 * 60;

export async function adminIdentityRoutes(app: FastifyInstance) {
  const guard = { preHandler: requirePermission('admin:users:manage') };

  app.get('/admin/users', guard, async (request) => {
    const list = await db
      .select({
        id: users.id,
        email: users.email,
        username: users.username,
        displayName: users.displayName,
        isActive: users.isActive,
        authSource: users.authSource,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.tenantId, request.user!.tenantId));
    return list;
  });

  app.post('/admin/users', guard, async (request, reply) => {
    const body = request.body as {
      email: string;
      username: string;
      displayName: string;
      password?: string;
    };
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, request.user!.tenantId)).limit(1);
    const policy = {
      ...DEFAULT_PASSWORD_POLICY,
      ...(tenant?.settings as { passwordPolicy?: object })?.passwordPolicy,
    };
    let passwordHash: string | null = null;
    if (body.password) {
      const validation = validatePasswordPolicy(body.password, policy as typeof DEFAULT_PASSWORD_POLICY);
      if (!validation.valid) return reply.status(400).send({ errors: validation.errors });
      passwordHash = await hashPassword(body.password);
    }
    const [user] = await db
      .insert(users)
      .values({
        tenantId: request.user!.tenantId,
        email: body.email,
        username: body.username,
        displayName: body.displayName,
        passwordHash,
        authSource: 'LOCAL',
      })
      .returning();
    await audit(db, {
      tenantId: request.user!.tenantId,
      userId: request.user!.id,
      action: 'USER_CREATED',
      resource: 'users',
      resourceId: user!.id,
    });
    return reply.status(201).send(user);
  });

  app.get('/admin/users/:id', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, id), eq(users.tenantId, request.user!.tenantId)))
      .limit(1);
    if (!user) return reply.status(404).send({ error: 'Not found' });
    const { roles: roleNames, permissions: perms } = await getEffectivePermissions(db, id);
    const memberGroups = await db
      .select({ id: groups.id, name: groups.name })
      .from(userGroups)
      .innerJoin(groups, eq(userGroups.groupId, groups.id))
      .where(eq(userGroups.userId, id));
    return { ...user, roles: roleNames, permissions: perms, groups: memberGroups };
  });

  app.put('/admin/users/:id', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      displayName?: string;
      email?: string;
      isActive?: boolean;
    };
    const [existing] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, id), eq(users.tenantId, request.user!.tenantId)))
      .limit(1);
    if (!existing) return reply.status(404).send({ error: 'Not found' });

    const [user] = await db
      .update(users)
      .set({
        displayName: body.displayName ?? existing.displayName,
        email: body.email ?? existing.email,
        isActive: body.isActive ?? existing.isActive,
      })
      .where(eq(users.id, id))
      .returning();

    if (body.isActive === false) {
      await revokeAllSessions(db, id);
    }

    await audit(db, {
      tenantId: request.user!.tenantId,
      userId: request.user!.id,
      action: 'USER_UPDATED',
      resource: 'users',
      resourceId: id,
      metadata: body,
    });
    return user;
  });

  app.delete('/admin/users/:id', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    await db
      .update(users)
      .set({ isActive: false })
      .where(and(eq(users.id, id), eq(users.tenantId, request.user!.tenantId)));
    await revokeAllSessions(db, id);
    await audit(db, {
      tenantId: request.user!.tenantId,
      userId: request.user!.id,
      action: 'USER_DEACTIVATED',
      resource: 'users',
      resourceId: id,
    });
    return reply.send({ ok: true });
  });

  app.post('/admin/users/:id/force-password-reset', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, id), eq(users.tenantId, request.user!.tenantId)))
      .limit(1);
    if (!user) return reply.status(404).send({ error: 'Not found' });

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    await storePasswordResetToken(tokenHash, user.id, PASSWORD_RESET_TTL);
    await revokeAllSessions(db, user.id);

    const baseUrl = process.env.WEB_URL ?? 'http://localhost:5173';
    const resetUrl = `${baseUrl}/reset-password?token=${rawToken}`;
    await sendEmail(user.email, 'Password reset required', `Reset your password: ${resetUrl}`);

    await audit(db, {
      tenantId: request.user!.tenantId,
      userId: request.user!.id,
      action: 'ADMIN_PASSWORD_RESET',
      resource: 'users',
      resourceId: id,
    });

    return reply.send({ ok: true, resetUrl: process.env.NODE_ENV === 'development' ? resetUrl : undefined });
  });

  app.post('/admin/users/:id/groups', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { groupId: string };
    await db.insert(userGroups).values({ userId: id, groupId: body.groupId }).onConflictDoNothing();
    await revokeAllSessions(db, id);
    await audit(db, {
      tenantId: request.user!.tenantId,
      userId: request.user!.id,
      action: 'USER_GROUP_ADDED',
      resource: 'users',
      resourceId: id,
      metadata: { groupId: body.groupId },
    });
    return reply.status(201).send({ ok: true });
  });

  app.get('/admin/users/:id/sessions', guard, async (request) => {
    const { id } = request.params as { id: string };
    const list = await db.select().from(sessions).where(eq(sessions.userId, id));
    return list;
  });

  app.delete('/admin/users/:id/sessions', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const count = await revokeAllSessions(db, id);
    await audit(db, {
      tenantId: request.user!.tenantId,
      userId: request.user!.id,
      action: 'SESSIONS_REVOKED',
      resource: 'users',
      resourceId: id,
      metadata: { count },
    });
    return reply.send({ revoked: count });
  });

  // Alias: force-logout is the same as revoking all sessions
  app.post('/admin/users/:id/force-logout', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const count = await revokeAllSessions(db, id);
    await audit(db, {
      tenantId: request.user!.tenantId,
      userId: request.user!.id,
      action: 'FORCE_LOGOUT',
      resource: 'users',
      resourceId: id,
      metadata: { count },
    });
    return reply.send({ ok: true, revoked: count, message: `All sessions terminated for this user` });
  });

  app.post('/admin/users/:id/roles', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { roleId: string };
    const groupsWithRole = await db
      .select({ groupId: groupRoles.groupId })
      .from(groupRoles)
      .innerJoin(groups, eq(groupRoles.groupId, groups.id))
      .where(and(eq(groupRoles.roleId, body.roleId), eq(groups.tenantId, request.user!.tenantId)));

    if (groupsWithRole.length === 0) {
      return reply.status(400).send({ error: 'No group mapped to this role; assign via group membership' });
    }

    for (const { groupId } of groupsWithRole) {
      await db.insert(userGroups).values({ userId: id, groupId }).onConflictDoNothing();
    }
    await revokeAllSessions(db, id);
    await audit(db, {
      tenantId: request.user!.tenantId,
      userId: request.user!.id,
      action: 'ROLE_ASSIGNED',
      resource: 'users',
      resourceId: id,
      metadata: { roleId: body.roleId },
    });
    return reply.status(201).send({ ok: true });
  });

  app.delete('/admin/users/:id/roles/:roleId', guard, async (request, reply) => {
    const { id, roleId } = request.params as { id: string; roleId: string };
    const groupsWithRole = await db
      .select({ groupId: groupRoles.groupId })
      .from(groupRoles)
      .innerJoin(groups, eq(groupRoles.groupId, groups.id))
      .where(and(eq(groupRoles.roleId, roleId), eq(groups.tenantId, request.user!.tenantId)));

    for (const { groupId } of groupsWithRole) {
      await db.delete(userGroups).where(and(eq(userGroups.groupId, groupId), eq(userGroups.userId, id)));
    }
    await revokeAllSessions(db, id);
    await audit(db, {
      tenantId: request.user!.tenantId,
      userId: request.user!.id,
      action: 'ROLE_REMOVED',
      resource: 'users',
      resourceId: id,
      metadata: { roleId },
    });
    return reply.send({ ok: true });
  });

  app.get('/admin/users/:id/effective-permissions', guard, async (request, _reply) => {
    const { id } = request.params as { id: string };
    return getEffectivePermissions(db, id);
  });

  app.post('/admin/users/:id/impersonate', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [target] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, id), eq(users.tenantId, request.user!.tenantId)))
      .limit(1);
    if (!target) return reply.status(404).send({ error: 'Not found' });

    const { roles, permissions } = await getEffectivePermissions(db, id);
    const accessToken = await signAccessToken({
      sub: target.id,
      tenantId: target.tenantId,
      email: target.email,
      roles,
      permissions,
      mfa_verified: true,
    });

    await audit(db, {
      tenantId: request.user!.tenantId,
      userId: request.user!.id,
      action: 'IMPERSONATE_START',
      resource: 'users',
      resourceId: id,
      metadata: { adminId: request.user!.id },
    });

    return reply.send({ accessToken, impersonating: target.id });
  });

  app.get('/admin/groups', guard, async (request) => {
    return db.select().from(groups).where(eq(groups.tenantId, request.user!.tenantId));
  });

  app.get('/admin/groups/:id', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [group] = await db
      .select()
      .from(groups)
      .where(and(eq(groups.id, id), eq(groups.tenantId, request.user!.tenantId)))
      .limit(1);
    if (!group) return reply.status(404).send({ error: 'Not found' });

    const members = await db
      .select({ id: users.id, email: users.email, displayName: users.displayName })
      .from(userGroups)
      .innerJoin(users, eq(userGroups.userId, users.id))
      .where(eq(userGroups.groupId, id));

    const roleRows = await db
      .select({ roleId: groupRoles.roleId })
      .from(groupRoles)
      .where(eq(groupRoles.groupId, id));

    return { ...group, members, roleIds: roleRows.map((r) => r.roleId) };
  });

  app.post('/admin/groups', guard, async (request, reply) => {
    const body = request.body as { name: string; description?: string };
    const [group] = await db
      .insert(groups)
      .values({
        tenantId: request.user!.tenantId,
        name: body.name,
        description: body.description,
        source: 'LOCAL',
      })
      .returning();
    return reply.status(201).send(group);
  });

  app.put('/admin/groups/:id', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { name?: string; description?: string; roleIds?: string[] };
    const [group] = await db
      .update(groups)
      .set({ name: body.name, description: body.description })
      .where(and(eq(groups.id, id), eq(groups.tenantId, request.user!.tenantId)))
      .returning();
    if (!group) return reply.status(404).send({ error: 'Not found' });

    if (body.roleIds) {
      await db.delete(groupRoles).where(eq(groupRoles.groupId, id));
      if (body.roleIds.length > 0) {
        await db.insert(groupRoles).values(body.roleIds.map((roleId) => ({ groupId: id, roleId })));
      }
      const members = await db.select({ userId: userGroups.userId }).from(userGroups).where(eq(userGroups.groupId, id));
      for (const m of members) {
        await revokeAllSessions(db, m.userId);
      }
    }
    return group;
  });

  app.delete('/admin/groups/:id', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const members = await db
      .select({ userId: userGroups.userId })
      .from(userGroups)
      .where(eq(userGroups.groupId, id));
    for (const m of members) {
      await revokeAllSessions(db, m.userId);
    }
    await db.delete(groups).where(and(eq(groups.id, id), eq(groups.tenantId, request.user!.tenantId)));
    return reply.send({ ok: true });
  });

  app.post('/admin/groups/:id/members', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { userId: string };
    await db.insert(userGroups).values({ groupId: id, userId: body.userId }).onConflictDoNothing();
    await revokeAllSessions(db, body.userId);
    return reply.status(201).send({ ok: true });
  });

  app.delete('/admin/groups/:id/members/:userId', guard, async (request, reply) => {
    const { id, userId } = request.params as { id: string; userId: string };
    await db.delete(userGroups).where(and(eq(userGroups.groupId, id), eq(userGroups.userId, userId)));
    await revokeAllSessions(db, userId);
    return reply.send({ ok: true });
  });

  app.get('/admin/roles', guard, async (request) => {
    return db.select().from(roles).where(eq(roles.tenantId, request.user!.tenantId));
  });

  app.get('/admin/roles/:id', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [role] = await db
      .select()
      .from(roles)
      .where(and(eq(roles.id, id), eq(roles.tenantId, request.user!.tenantId)))
      .limit(1);
    if (!role) return reply.status(404).send({ error: 'Not found' });
    return role;
  });

  app.post('/admin/roles', guard, async (request, reply) => {
    const body = request.body as { name: string; description?: string; requireMfa?: boolean };
    const [role] = await db
      .insert(roles)
      .values({
        tenantId: request.user!.tenantId,
        name: body.name,
        description: body.description,
        requireMfa: body.requireMfa ?? false,
      })
      .returning();
    return reply.status(201).send(role);
  });

  app.put('/admin/roles/:id', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { name?: string; description?: string; requireMfa?: boolean };
    const [existing] = await db
      .select()
      .from(roles)
      .where(and(eq(roles.id, id), eq(roles.tenantId, request.user!.tenantId)))
      .limit(1);
    if (!existing) return reply.status(404).send({ error: 'Not found' });

    const [role] = await db
      .update(roles)
      .set({
        name: body.name,
        description: body.description,
        requireMfa: body.requireMfa,
      })
      .where(and(eq(roles.id, id), eq(roles.tenantId, request.user!.tenantId)))
      .returning();

    if (body.requireMfa !== undefined && body.requireMfa !== existing.requireMfa) {
      const groupUsers = await db
        .select({ userId: userGroups.userId })
        .from(groupRoles)
        .innerJoin(userGroups, eq(groupRoles.groupId, userGroups.groupId))
        .where(eq(groupRoles.roleId, id));
      for (const { userId } of groupUsers) {
        await revokeAllSessions(db, userId);
      }
    }

    return role;
  });

  app.delete('/admin/roles/:id', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const groupUsers = await db
      .select({ userId: userGroups.userId })
      .from(groupRoles)
      .innerJoin(userGroups, eq(groupRoles.groupId, userGroups.groupId))
      .where(eq(groupRoles.roleId, id));
    for (const { userId } of groupUsers) {
      await revokeAllSessions(db, userId);
    }
    await db.delete(roles).where(and(eq(roles.id, id), eq(roles.tenantId, request.user!.tenantId)));
    return reply.send({ ok: true });
  });

  app.get('/admin/roles/:id/permissions', guard, async (request) => {
    const { id } = request.params as { id: string };
    return db
      .select({ id: permissions.id, resource: permissions.resource, action: permissions.action })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(rolePermissions.roleId, id));
  });

  app.put('/admin/roles/:id/permissions', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { permissionIds: string[] };
    await db.delete(rolePermissions).where(eq(rolePermissions.roleId, id));
    if (body.permissionIds.length > 0) {
      await db
        .insert(rolePermissions)
        .values(body.permissionIds.map((permissionId) => ({ roleId: id, permissionId })));
    }

    const groupUsers = await db
      .select({ userId: userGroups.userId })
      .from(groupRoles)
      .innerJoin(userGroups, eq(groupRoles.groupId, userGroups.groupId))
      .where(eq(groupRoles.roleId, id));
    const userIds = new Set(groupUsers.map((u) => u.userId));
    for (const userId of userIds) {
      await revokeAllSessions(db, userId);
    }

    return reply.send({ ok: true });
  });

  app.get('/admin/permissions', guard, async () => {
    return db.select().from(permissions);
  });

  // ── CSV bulk user import ─────────────────────────────────────────────────
  app.post('/admin/users/import-csv', guard, async (request, reply) => {
    const { csv } = request.body as { csv: string };
    if (!csv?.trim()) return reply.code(400).send({ error: 'CSV content is required' });

    const tid = request.user!.tenantId;
    const lines = csv.trim().split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return reply.code(400).send({ error: 'CSV must have a header row and at least one data row' });

    // Parse header
    const header = lines[0]!.split(',').map((h) => h.trim().toLowerCase());
    const colIdx = (name: string) => header.indexOf(name);

    const imported: number[] = [];
    const skipped: string[] = [];
    const errors: string[] = [];

    // Get All Users group
    const [allUsersGroup] = await db.select().from(groups)
      .where(and(eq(groups.tenantId, tid), eq(groups.name, 'All Users'))).limit(1);

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i]!.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      const email       = cols[colIdx('email')]?.toLowerCase();
      const username    = cols[colIdx('username')] ?? email?.split('@')[0];
      const displayName = cols[colIdx('displayname')] ?? cols[colIdx('display_name')] ?? username ?? '';
      const password    = cols[colIdx('password')] ?? 'Welcome@1234!';
      const groupName   = cols[colIdx('groupname')] ?? cols[colIdx('group_name')] ?? '';

      if (!email) { errors.push(`Row ${i + 1}: email is required`); continue; }

      // Skip if user already exists
      const [existing] = await db.select().from(users)
        .where(eq(users.email, email)).limit(1);
      if (existing) { skipped.push(email); continue; }

      try {
        const { hashPassword } = await import('@eam/auth');
        const passwordHash = await hashPassword(password);
        const now = new Date();

        const [newUser] = await db.insert(users).values({
          tenantId: tid,
          email,
          username: username ?? email.split('@')[0],
          displayName,
          passwordHash,
          authSource: 'LOCAL',
          isActive: true,
          passwordChangedAt: now,
        }).returning();

        // Add to All Users group
        if (allUsersGroup && newUser) {
          await db.insert(userGroups)
            .values({ userId: newUser.id, groupId: allUsersGroup.id })
            .onConflictDoNothing();
        }

        // Add to specified group if provided
        if (groupName.trim() && newUser) {
          const [grp] = await db.select().from(groups)
            .where(and(eq(groups.tenantId, tid), eq(groups.name, groupName.trim()))).limit(1);
          if (grp) {
            await db.insert(userGroups)
              .values({ userId: newUser.id, groupId: grp.id })
              .onConflictDoNothing();
          }
        }

        imported.push(1);
      } catch (err) {
        errors.push(`Row ${i + 1} (${email}): ${err instanceof Error ? err.message : 'Failed'}`);
      }
    }

    return {
      imported: imported.length,
      skipped: skipped.length,
      errors,
      skippedEmails: skipped,
    };
  });

  // ── 1. Schedule deactivation ────────────────────────────────────────────────
  app.post('/admin/users/:id/schedule-deactivation', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { deactivateAt: string };
    if (!body.deactivateAt) return reply.status(400).send({ error: 'deactivateAt date is required' });
    const deactivateAt = new Date(body.deactivateAt);
    if (isNaN(deactivateAt.getTime())) return reply.status(400).send({ error: 'Invalid date format' });
    if (deactivateAt <= new Date()) return reply.status(400).send({ error: 'deactivateAt must be a future date' });
    const [user] = await db.select().from(users).where(and(eq(users.id, id), eq(users.tenantId, request.user!.tenantId))).limit(1);
    if (!user) return reply.status(404).send({ error: 'User not found' });
    if (!user.isActive) return reply.status(400).send({ error: 'User is already inactive' });
    await (db as any).$client`UPDATE users SET deactivate_at = ${deactivateAt} WHERE id = ${id}`;
    await audit(db, { tenantId: request.user!.tenantId, userId: request.user!.id, action: 'USER_DEACTIVATION_SCHEDULED', resource: 'users', resourceId: id, metadata: { deactivateAt: deactivateAt.toISOString() } });
    return reply.send({ ok: true, message: `User will be deactivated on ${deactivateAt.toLocaleDateString()}`, deactivateAt: deactivateAt.toISOString() });
  });

  app.delete('/admin/users/:id/schedule-deactivation', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [user] = await db.select().from(users).where(and(eq(users.id, id), eq(users.tenantId, request.user!.tenantId))).limit(1);
    if (!user) return reply.status(404).send({ error: 'User not found' });
    await (db as any).$client`UPDATE users SET deactivate_at = NULL WHERE id = ${id}`;
    await audit(db, { tenantId: request.user!.tenantId, userId: request.user!.id, action: 'USER_DEACTIVATION_CANCELLED', resource: 'users', resourceId: id });
    return reply.send({ ok: true, message: 'Scheduled deactivation cancelled' });
  });

  // ── 2. Reactivate user ───────────────────────────────────────────────────────
  app.post('/admin/users/:id/reactivate', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [user] = await db.select().from(users).where(and(eq(users.id, id), eq(users.tenantId, request.user!.tenantId))).limit(1);
    if (!user) return reply.status(404).send({ error: 'User not found' });
    if (user.isActive) return reply.status(400).send({ error: 'User is already active' });
    await db.update(users).set({ isActive: true }).where(eq(users.id, id));
    await (db as any).$client`UPDATE users SET deactivate_at = NULL WHERE id = ${id}`;
    await audit(db, { tenantId: request.user!.tenantId, userId: request.user!.id, action: 'USER_REACTIVATED', resource: 'users', resourceId: id });
    return reply.send({ ok: true, message: 'User reactivated successfully' });
  });

  // ── 3. GDPR delete ───────────────────────────────────────────────────────────
  app.post('/admin/users/:id/gdpr-delete', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (id === request.user!.id) return reply.status(400).send({ error: 'You cannot delete your own account' });
    const [user] = await db.select().from(users).where(and(eq(users.id, id), eq(users.tenantId, request.user!.tenantId))).limit(1);
    if (!user) return reply.status(404).send({ error: 'User not found' });
    await db.update(users).set({
      email: `deleted-${id}@gdpr.removed`,
      username: `deleted-${id.slice(0, 8)}`,
      displayName: 'Deleted User',
      phone: null, department: null, employeeId: null,
      externalId: null, mfaSecret: null, passwordHash: null, isActive: false,
    }).where(eq(users.id, id));
    await (db as any).$client`UPDATE users SET deleted_at = NOW() WHERE id = ${id}`;
    await revokeAllSessions(db, id);
    await audit(db, { tenantId: request.user!.tenantId, userId: request.user!.id, action: 'USER_GDPR_DELETED', resource: 'users', resourceId: id, metadata: { originalEmail: user.email } });
    return reply.send({ ok: true, message: 'User data anonymised and all sessions revoked.' });
  });

  // ── Login history per user ────────────────────────────────────────────────────
  app.get('/admin/users/:id/login-history', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { limit = '50' } = request.query as { limit?: string };

    const [user] = await db
      .select({ id: users.id, tenantId: users.tenantId })
      .from(users)
      .where(and(eq(users.id, id), eq(users.tenantId, request.user!.tenantId)))
      .limit(1);
    if (!user) return reply.status(404).send({ error: 'User not found' });

    // Get audit log entries for login events
    const logs = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.resourceId, id),
          inArray(auditLogs.action, ['LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'FORCE_LOGOUT', 'MFA_SUCCESS', 'MFA_FAILED'])
        )
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(Number(limit));

    return reply.send(logs);
  });
}