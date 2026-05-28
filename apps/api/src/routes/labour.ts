import type { FastifyInstance } from 'fastify';
import { eq, and, desc, gte, lte, sql } from 'drizzle-orm';
import {
  db,
  labourCrafts,
  labourRecords,
  crews,
  crewMembers,
  woLabour,
  workOrders,
  users,
  audit,
} from '@eam/db';
import { requirePermission } from '../plugins/auth.js';

const readGuard = { preHandler: requirePermission('work_orders:read') };
const writeGuard = { preHandler: requirePermission('work_orders:write') };

export async function labourRoutes(app: FastifyInstance) {
  // ─── Labour Crafts ────────────────────────────────────────────────────────────

  app.get('/labour-crafts', readGuard, async (request) => {
    const tid = request.user!.tenantId;
    return db.select().from(labourCrafts)
      .where(and(eq(labourCrafts.tenantId, tid), eq(labourCrafts.isActive, true)))
      .orderBy(labourCrafts.craftCode);
  });

  app.post('/labour-crafts', writeGuard, async (request, reply) => {
    const body = request.body as Partial<typeof labourCrafts.$inferInsert>;
    const tid = request.user!.tenantId;
    const [row] = await db.insert(labourCrafts).values({
      ...body,
      tenantId: tid,
    } as typeof labourCrafts.$inferInsert).returning();
    await audit(db, { tenantId: tid, userId: request.user!.id, action: 'CREATE', resource: 'LabourCraft', resourceId: row!.id });
    return reply.code(201).send(row);
  });

  app.put('/labour-crafts/:id', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<typeof labourCrafts.$inferInsert>;
    const tid = request.user!.tenantId;
    const [row] = await db.update(labourCrafts).set(body)
      .where(and(eq(labourCrafts.id, id), eq(labourCrafts.tenantId, tid))).returning();
    if (!row) return reply.code(404).send({ error: 'Labour craft not found' });
    return row;
  });

  app.delete('/labour-crafts/:id', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tid = request.user!.tenantId;
    await db.update(labourCrafts).set({ isActive: false })
      .where(and(eq(labourCrafts.id, id), eq(labourCrafts.tenantId, tid)));
    return reply.code(204).send();
  });

  // ─── Labour Records ───────────────────────────────────────────────────────────

  app.get('/labour-records', readGuard, async (request) => {
    const tid = request.user!.tenantId;
    const { craftId, isActive } = request.query as { craftId?: string; isActive?: string };

    return db.select({
      id: labourRecords.id,
      userId: labourRecords.userId,
      craftId: labourRecords.craftId,
      regularRate: labourRecords.regularRate,
      overtimeRate: labourRecords.overtimeRate,
      certifications: labourRecords.certifications,
      shiftCode: labourRecords.shiftCode,
      calendarCode: labourRecords.calendarCode,
      isActive: labourRecords.isActive,
      createdAt: labourRecords.createdAt,
      updatedAt: labourRecords.updatedAt,
      userName: users.displayName,
      userEmail: users.email,
      craftCode: labourCrafts.craftCode,
      craftDescription: labourCrafts.description,
    })
      .from(labourRecords)
      .leftJoin(users, eq(labourRecords.userId, users.id))
      .leftJoin(labourCrafts, eq(labourRecords.craftId, labourCrafts.id))
      .where(
        and(
          eq(labourRecords.tenantId, tid),
          craftId ? eq(labourRecords.craftId, craftId) : undefined,
          isActive !== undefined ? eq(labourRecords.isActive, isActive === 'true') : undefined,
        ),
      )
      .orderBy(labourRecords.updatedAt);
  });

  app.post('/labour-records', writeGuard, async (request, reply) => {
    const body = request.body as Partial<typeof labourRecords.$inferInsert>;
    const tid = request.user!.tenantId;
    const [row] = await db.insert(labourRecords).values({
      ...body,
      tenantId: tid,
    } as typeof labourRecords.$inferInsert).returning();
    await audit(db, { tenantId: tid, userId: request.user!.id, action: 'CREATE', resource: 'LabourRecord', resourceId: row!.id });
    return reply.code(201).send(row);
  });

  app.get('/labour-records/:id', readGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tid = request.user!.tenantId;
    const [row] = await db.select().from(labourRecords)
      .where(and(eq(labourRecords.id, id), eq(labourRecords.tenantId, tid))).limit(1);
    if (!row) return reply.code(404).send({ error: 'Labour record not found' });
    return row;
  });

  app.put('/labour-records/:id', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<typeof labourRecords.$inferInsert>;
    const tid = request.user!.tenantId;
    const [row] = await db.update(labourRecords).set({ ...body, updatedAt: new Date() })
      .where(and(eq(labourRecords.id, id), eq(labourRecords.tenantId, tid))).returning();
    if (!row) return reply.code(404).send({ error: 'Labour record not found' });
    return row;
  });

  // ─── Labour Availability ──────────────────────────────────────────────────────

  app.get('/labour-records/:id/availability', readGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { from, to } = request.query as { from?: string; to?: string };
    const tid = request.user!.tenantId;

    const [record] = await db.select().from(labourRecords)
      .where(and(eq(labourRecords.id, id), eq(labourRecords.tenantId, tid))).limit(1);
    if (!record) return reply.code(404).send({ error: 'Labour record not found' });

    const fromDate = from ? new Date(from) : new Date();
    const toDate = to ? new Date(to) : new Date(Date.now() + 7 * 86400000);

    const assignments = await db.select({
      woId: woLabour.woId,
      woNum: workOrders.woNum,
      workDate: woLabour.workDate,
      regularHours: woLabour.regularHours,
      overtimeHours: woLabour.overtimeHours,
    })
      .from(woLabour)
      .leftJoin(workOrders, eq(woLabour.woId, workOrders.id))
      .where(
        and(
          eq(woLabour.userId, record.userId),
          gte(woLabour.workDate, fromDate),
          lte(woLabour.workDate, toDate),
        ),
      )
      .orderBy(woLabour.workDate);

    const totalHours = assignments.reduce(
      (sum, a) => sum + parseFloat(String(a.regularHours)) + parseFloat(String(a.overtimeHours)),
      0,
    );

    return { record, assignments, totalHours, fromDate, toDate };
  });

  // ─── Crews ────────────────────────────────────────────────────────────────────

  app.get('/crews', readGuard, async (request) => {
    const tid = request.user!.tenantId;
    const { siteId } = request.query as { siteId?: string };

    return db.select().from(crews).where(
      and(
        eq(crews.tenantId, tid),
        siteId ? eq(crews.siteId, siteId) : undefined,
      ),
    ).orderBy(desc(crews.updatedAt));
  });

  app.post('/crews', writeGuard, async (request, reply) => {
    const body = request.body as Partial<typeof crews.$inferInsert>;
    const tid = request.user!.tenantId;

    const count = await db.select({ id: crews.id }).from(crews).where(eq(crews.tenantId, tid));
    const crewNum = (body as { crewNum?: string }).crewNum ?? `CREW-${String(count.length + 1).padStart(4, '0')}`;

    const [row] = await db.insert(crews).values({
      ...body,
      crewNum,
      tenantId: tid,
    } as typeof crews.$inferInsert).returning();
    await audit(db, { tenantId: tid, userId: request.user!.id, action: 'CREATE', resource: 'Crew', resourceId: row!.id });
    return reply.code(201).send(row);
  });

  app.get('/crews/:id', readGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tid = request.user!.tenantId;

    const [crew] = await db.select().from(crews)
      .where(and(eq(crews.id, id), eq(crews.tenantId, tid))).limit(1);
    if (!crew) return reply.code(404).send({ error: 'Crew not found' });

    const members = await db.select({
      id: crewMembers.id,
      userId: crewMembers.userId,
      role: crewMembers.role,
      isPrimary: crewMembers.isPrimary,
      joinedAt: crewMembers.joinedAt,
      userName: users.displayName,
      userEmail: users.email,
    })
      .from(crewMembers)
      .leftJoin(users, eq(crewMembers.userId, users.id))
      .where(eq(crewMembers.crewId, id));

    return { ...crew, members };
  });

  app.put('/crews/:id', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<typeof crews.$inferInsert>;
    const tid = request.user!.tenantId;
    const [row] = await db.update(crews).set({ ...body, updatedAt: new Date() })
      .where(and(eq(crews.id, id), eq(crews.tenantId, tid))).returning();
    if (!row) return reply.code(404).send({ error: 'Crew not found' });
    return row;
  });

  app.delete('/crews/:id', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tid = request.user!.tenantId;
    await db.update(crews).set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(crews.id, id), eq(crews.tenantId, tid)));
    return reply.code(204).send();
  });

  // ─── Crew Members ─────────────────────────────────────────────────────────────

  app.post('/crews/:id/members', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { userId: string; role?: string; isPrimary?: boolean };
    const tid = request.user!.tenantId;

    const [crew] = await db.select({ id: crews.id }).from(crews)
      .where(and(eq(crews.id, id), eq(crews.tenantId, tid))).limit(1);
    if (!crew) return reply.code(404).send({ error: 'Crew not found' });

    const [row] = await db.insert(crewMembers).values({
      crewId: id,
      userId: body.userId,
      role: body.role ?? 'MEMBER',
      isPrimary: body.isPrimary ?? false,
    }).returning();
    return reply.code(201).send(row);
  });

  app.put('/crews/:id/members/:memberId', writeGuard, async (request, reply) => {
    const { memberId } = request.params as { id: string; memberId: string };
    const body = request.body as { role?: string; isPrimary?: boolean };
    const [row] = await db.update(crewMembers).set(body)
      .where(eq(crewMembers.id, memberId)).returning();
    if (!row) return reply.code(404).send({ error: 'Member not found' });
    return row;
  });

  app.delete('/crews/:id/members/:memberId', writeGuard, async (request, reply) => {
    const { memberId } = request.params as { id: string; memberId: string };
    await db.delete(crewMembers).where(eq(crewMembers.id, memberId));
    return reply.code(204).send();
  });

  // ─── Labour Utilisation Summary ───────────────────────────────────────────────

  app.get('/labour-utilisation', readGuard, async (request) => {
    const { from, to } = request.query as { from?: string; to?: string };
    const tid = request.user!.tenantId;

    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 86400000);
    const toDate = to ? new Date(to) : new Date();

    const rows = await db.select({
      userId: woLabour.userId,
      craft: woLabour.craft,
      regularHours: sql<string>`sum(${woLabour.regularHours})`,
      overtimeHours: sql<string>`sum(${woLabour.overtimeHours})`,
      totalCost: sql<string>`sum(${woLabour.totalCost})`,
      workOrderCount: sql<number>`count(distinct ${woLabour.woId})`,
      userName: users.displayName,
    })
      .from(woLabour)
      .leftJoin(users, eq(woLabour.userId, users.id))
      .leftJoin(workOrders, eq(woLabour.woId, workOrders.id))
      .where(
        and(
          eq(woLabour.tenantId, tid),
          gte(woLabour.workDate, fromDate),
          lte(woLabour.workDate, toDate),
        ),
      )
      .groupBy(woLabour.userId, woLabour.craft, users.displayName)
      .orderBy(sql`sum(${woLabour.regularHours}) desc`);

    return { fromDate, toDate, rows };
  });
}
