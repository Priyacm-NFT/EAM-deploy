import type { FastifyInstance } from 'fastify';
import { eq, and, desc, ilike, or } from 'drizzle-orm';
import {
  db,
  items,
  storerooms,
  inventoryBalances,
  inventoryTransactions,
  workOrders,
  audit,
} from '@eam/db';
import { requirePermission } from '../plugins/auth.js';

const readGuard = { preHandler: requirePermission('inventory:read') };
const writeGuard = { preHandler: requirePermission('inventory:write') };
const adminGuard = { preHandler: requirePermission('admin:config:manage') };

export async function inventoryRoutes(app: FastifyInstance) {
  // ─── Item Master ──────────────────────────────────────────────────────────────

  app.get('/items', readGuard, async (request) => {
    const { itemType, q, page, pageSize } = request.query as {
      itemType?: string;
      q?: string;
      page?: string;
      pageSize?: string;
    };
    const tid = request.user!.tenantId;
    const limit = Math.min(Number(pageSize ?? 50), 200);
    const offset = (Number(page ?? 1) - 1) * limit;

    const rows = await db.select().from(items).where(
      and(
        eq(items.tenantId, tid),
        eq(items.isActive, true),
        itemType ? eq(items.itemType, itemType as typeof items.$inferSelect.itemType) : undefined,
        q ? or(ilike(items.itemNum, `%${q}%`), ilike(items.description, `%${q}%`)) : undefined,
      ),
    ).orderBy(items.itemNum).limit(limit).offset(offset);

    return { data: rows, page: Number(page ?? 1), pageSize: limit };
  });

  app.post('/items', writeGuard, async (request, reply) => {
    const body = request.body as Partial<typeof items.$inferInsert>;
    const tid = request.user!.tenantId;
    const [row] = await db.insert(items).values({ tenantId: tid, ...body } as typeof items.$inferInsert).returning();
    await audit(db, { tenantId: tid, userId: request.user!.id, action: 'CREATE', resource: 'Item', resourceId: row!.id });
    return reply.code(201).send(row);
  });

  app.get('/items/:id', readGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tid = request.user!.tenantId;
    const [item] = await db.select().from(items).where(and(eq(items.id, id), eq(items.tenantId, tid))).limit(1);
    if (!item) return reply.code(404).send({ error: 'Item not found' });

    // Balances across all storerooms
    const balances = await db.select({
      storeroomId: inventoryBalances.storeroomId,
      storeroomName: storerooms.name,
      qtyOnHand: inventoryBalances.qtyOnHand,
      qtyReserved: inventoryBalances.qtyReserved,
      avgCost: inventoryBalances.avgCost,
      binLocation: inventoryBalances.binLocation,
      minQty: inventoryBalances.minQty,
      maxQty: inventoryBalances.maxQty,
    }).from(inventoryBalances)
      .leftJoin(storerooms, eq(inventoryBalances.storeroomId, storerooms.id))
      .where(eq(inventoryBalances.itemId, id));

    return { ...item, balances };
  });

  app.put('/items/:id', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<typeof items.$inferInsert>;
    const tid = request.user!.tenantId;
    const [row] = await db.update(items).set({ ...body, updatedAt: new Date() })
      .where(and(eq(items.id, id), eq(items.tenantId, tid))).returning();
    if (!row) return reply.code(404).send({ error: 'Item not found' });
    return row;
  });

  // ─── Storerooms ───────────────────────────────────────────────────────────────

  app.get('/storerooms', readGuard, async (request) => {
    const tid = request.user!.tenantId;
    return db.select().from(storerooms).where(and(eq(storerooms.tenantId, tid), eq(storerooms.isActive, true)));
  });

  app.post('/storerooms', adminGuard, async (request, reply) => {
    const body = request.body as Partial<typeof storerooms.$inferInsert>;
    const tid = request.user!.tenantId;
    const [row] = await db.insert(storerooms).values({ tenantId: tid, ...body } as typeof storerooms.$inferInsert).returning();
    return reply.code(201).send(row);
  });

  app.get('/storerooms/:id', readGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tid = request.user!.tenantId;
    const [sr] = await db.select().from(storerooms).where(and(eq(storerooms.id, id), eq(storerooms.tenantId, tid))).limit(1);
    if (!sr) return reply.code(404).send({ error: 'Storeroom not found' });

    const balances = await db.select({
      id: inventoryBalances.id,
      itemId: inventoryBalances.itemId,
      qtyOnHand: inventoryBalances.qtyOnHand,
      qtyReserved: inventoryBalances.qtyReserved,
      qtyOnOrder: inventoryBalances.qtyOnOrder,
      minQty: inventoryBalances.minQty,
      maxQty: inventoryBalances.maxQty,
      avgCost: inventoryBalances.avgCost,
      binLocation: inventoryBalances.binLocation,
      itemNum: items.itemNum,
      itemDescription: items.description,
      isHazardous: items.isHazardous,
    }).from(inventoryBalances)
      .leftJoin(items, eq(inventoryBalances.itemId, items.id))
      .where(eq(inventoryBalances.storeroomId, id));

    // Flag below-min items
    const withReorderFlag = balances.map((b) => ({
      ...b,
      belowMin: b.minQty != null && parseFloat(String(b.qtyOnHand)) <= parseFloat(String(b.minQty)),
    }));

    return { ...sr, balances: withReorderFlag };
  });

  app.put('/storerooms/:id', adminGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<typeof storerooms.$inferInsert>;
    const tid = request.user!.tenantId;
    const [row] = await db.update(storerooms).set({ ...body, updatedAt: new Date() })
      .where(and(eq(storerooms.id, id), eq(storerooms.tenantId, tid))).returning();
    if (!row) return reply.code(404).send({ error: 'Storeroom not found' });
    return row;
  });

  // ─── Inventory Transactions ───────────────────────────────────────────────────

  // Issue to WO
  app.post('/inventory/issue', writeGuard, async (request, reply) => {
    const body = request.body as {
      itemId: string;
      storeroomId: string;
      qty: string;
      woId?: string;
      notes?: string;
    };
    const tid = request.user!.tenantId;
    return executeTransaction(tid, body.itemId, body.storeroomId, 'ISSUE', body.qty, request.user!.id, {
      woId: body.woId,
      notes: body.notes,
    }, reply);
  });

  // Return from WO
  app.post('/inventory/return', writeGuard, async (request, reply) => {
    const body = request.body as { itemId: string; storeroomId: string; qty: string; woId?: string; notes?: string };
    const tid = request.user!.tenantId;
    return executeTransaction(tid, body.itemId, body.storeroomId, 'RETURN', body.qty, request.user!.id, {
      woId: body.woId,
      notes: body.notes,
    }, reply);
  });

  // Transfer between storerooms
  app.post('/inventory/transfer', writeGuard, async (request, reply) => {
    const body = request.body as {
      itemId: string;
      fromStoreroomId: string;
      toStoreroomId: string;
      qty: string;
      notes?: string;
    };
    const tid = request.user!.tenantId;

    // Debit from source
    await adjustBalance(tid, body.itemId, body.fromStoreroomId, -parseFloat(body.qty));
    // Credit to destination
    await adjustBalance(tid, body.itemId, body.toStoreroomId, parseFloat(body.qty));

    const [row] = await db.insert(inventoryTransactions).values({
      tenantId: tid,
      itemId: body.itemId,
      storeroomId: body.fromStoreroomId,
      toStoreroomId: body.toStoreroomId,
      txType: 'TRANSFER',
      qty: body.qty,
      userId: request.user!.id,
      notes: body.notes,
    }).returning();

    return reply.code(201).send(row);
  });

  // Receipt (manual — PO-based in Phase 2)
  app.post('/inventory/receipt', writeGuard, async (request, reply) => {
    const body = request.body as {
      itemId: string;
      storeroomId: string;
      qty: string;
      unitCost?: string;
      referenceNum?: string;
      notes?: string;
    };
    const tid = request.user!.tenantId;
    return executeTransaction(tid, body.itemId, body.storeroomId, 'RECEIPT', body.qty, request.user!.id, {
      unitCost: body.unitCost,
      referenceNum: body.referenceNum,
      notes: body.notes,
    }, reply);
  });

  // Adjustment
  app.post('/inventory/adjustment', writeGuard, async (request, reply) => {
    const body = request.body as {
      itemId: string;
      storeroomId: string;
      qty: string;
      notes: string;
    };
    const tid = request.user!.tenantId;
    return executeTransaction(tid, body.itemId, body.storeroomId, 'ADJUSTMENT', body.qty, request.user!.id, { notes: body.notes }, reply);
  });

  // ─── Cycle Count ──────────────────────────────────────────────────────────────

  /** Start a cycle count session — returns items in storeroom with expected qtys */
  app.post('/inventory/cycle-count/start', writeGuard, async (request) => {
    const body = request.body as { storeroomId: string };
    const tid = request.user!.tenantId;

    const balances = await db.select({
      itemId: inventoryBalances.itemId,
      qtyOnHand: inventoryBalances.qtyOnHand,
      binLocation: inventoryBalances.binLocation,
      itemNum: items.itemNum,
      description: items.description,
    }).from(inventoryBalances)
      .leftJoin(items, eq(inventoryBalances.itemId, items.id))
      .where(and(eq(inventoryBalances.storeroomId, body.storeroomId), eq(inventoryBalances.tenantId, tid)));

    return {
      storeroomId: body.storeroomId,
      startedAt: new Date(),
      items: balances.map((b) => ({ ...b, countedQty: null, variance: null })),
    };
  });

  /** Commit cycle count — records variances as adjustments */
  app.post('/inventory/cycle-count/commit', writeGuard, async (request) => {
    const body = request.body as {
      storeroomId: string;
      counts: Array<{ itemId: string; countedQty: string }>;
    };
    const tid = request.user!.tenantId;

    const results: unknown[] = [];
    for (const count of body.counts) {
      const [balance] = await db.select().from(inventoryBalances)
        .where(and(
          eq(inventoryBalances.itemId, count.itemId),
          eq(inventoryBalances.storeroomId, body.storeroomId),
        )).limit(1);

      if (!balance) continue;

      const systemQty = parseFloat(String(balance.qtyOnHand));
      const counted = parseFloat(count.countedQty);
      const variance = counted - systemQty;

      if (Math.abs(variance) > 0.001) {
        await adjustBalance(tid, count.itemId, body.storeroomId, variance);
        const [tx] = await db.insert(inventoryTransactions).values({
          tenantId: tid,
          itemId: count.itemId,
          storeroomId: body.storeroomId,
          txType: 'CYCLE_COUNT',
          qty: variance.toString(),
          userId: request.user!.id,
          notes: `Cycle count variance: system=${systemQty}, counted=${counted}`,
        }).returning();
        results.push({ itemId: count.itemId, variance, adjustment: tx });
      } else {
        results.push({ itemId: count.itemId, variance: 0 });
      }

      await db.update(inventoryBalances).set({ lastCountDate: new Date() })
        .where(and(
          eq(inventoryBalances.itemId, count.itemId),
          eq(inventoryBalances.storeroomId, body.storeroomId),
        ));
    }

    return { committed: results.length, results };
  });

  // ─── Transaction Log ──────────────────────────────────────────────────────────

  app.get('/inventory/transactions', readGuard, async (request) => {
    const { itemId, storeroomId, txType, woId, page, pageSize } = request.query as {
      itemId?: string;
      storeroomId?: string;
      txType?: string;
      woId?: string;
      page?: string;
      pageSize?: string;
    };
    const tid = request.user!.tenantId;
    const limit = Math.min(Number(pageSize ?? 50), 200);
    const offset = (Number(page ?? 1) - 1) * limit;

    const rows = await db.select({
      id: inventoryTransactions.id,
      txType: inventoryTransactions.txType,
      qty: inventoryTransactions.qty,
      unitCost: inventoryTransactions.unitCost,
      totalCost: inventoryTransactions.totalCost,
      txDate: inventoryTransactions.txDate,
      referenceNum: inventoryTransactions.referenceNum,
      notes: inventoryTransactions.notes,
      itemNum: items.itemNum,
      itemDescription: items.description,
      storeroomName: storerooms.name,
      woNum: workOrders.woNum,
    }).from(inventoryTransactions)
      .leftJoin(items, eq(inventoryTransactions.itemId, items.id))
      .leftJoin(storerooms, eq(inventoryTransactions.storeroomId, storerooms.id))
      .leftJoin(workOrders, eq(inventoryTransactions.woId, workOrders.id))
      .where(
        and(
          eq(inventoryTransactions.tenantId, tid),
          itemId ? eq(inventoryTransactions.itemId, itemId) : undefined,
          storeroomId ? eq(inventoryTransactions.storeroomId, storeroomId) : undefined,
          txType ? eq(inventoryTransactions.txType, txType as typeof inventoryTransactions.$inferSelect.txType) : undefined,
          woId ? eq(inventoryTransactions.woId, woId) : undefined,
        ),
      )
      .orderBy(desc(inventoryTransactions.txDate))
      .limit(limit)
      .offset(offset);

    return { data: rows, page: Number(page ?? 1), pageSize: limit };
  });

  // ─── Reorder suggestions ──────────────────────────────────────────────────────

  app.get('/inventory/reorder-suggestions', readGuard, async (request) => {
    const tid = request.user!.tenantId;

    const balances = await db.select({
      itemId: inventoryBalances.itemId,
      storeroomId: inventoryBalances.storeroomId,
      qtyOnHand: inventoryBalances.qtyOnHand,
      minQty: inventoryBalances.minQty,
      maxQty: inventoryBalances.maxQty,
      itemNum: items.itemNum,
      description: items.description,
      storeroomName: storerooms.name,
    }).from(inventoryBalances)
      .leftJoin(items, eq(inventoryBalances.itemId, items.id))
      .leftJoin(storerooms, eq(inventoryBalances.storeroomId, storerooms.id))
      .where(eq(inventoryBalances.tenantId, tid));

    return balances.filter((b) =>
      b.minQty != null && parseFloat(String(b.qtyOnHand)) <= parseFloat(String(b.minQty)),
    ).map((b) => ({
      ...b,
      suggestedOrderQty: b.maxQty
        ? parseFloat(String(b.maxQty)) - parseFloat(String(b.qtyOnHand))
        : parseFloat(String(b.minQty ?? '0')) * 2 - parseFloat(String(b.qtyOnHand)),
    }));
  });
}

async function executeTransaction(
  tenantId: string,
  itemId: string,
  storeroomId: string,
  txType: typeof inventoryTransactions.$inferInsert.txType,
  qty: string,
  userId: string,
  extras: { woId?: string; unitCost?: string; referenceNum?: string; notes?: string },
  reply: { code: (n: number) => { send: (b: unknown) => unknown }; send?: (b: unknown) => unknown },
): Promise<unknown> {
  const sign = txType === 'ISSUE' ? -1 : 1;
  await adjustBalance(tenantId, itemId, storeroomId, sign * parseFloat(qty));

  const unitCost = extras.unitCost ? parseFloat(extras.unitCost) : undefined;
  const totalCost = unitCost !== undefined ? (unitCost * parseFloat(qty)).toString() : undefined;

  const [row] = await db.insert(inventoryTransactions).values({
    tenantId,
    itemId,
    storeroomId,
    txType,
    qty,
    unitCost: extras.unitCost,
    totalCost,
    woId: extras.woId,
    userId,
    notes: extras.notes,
    referenceNum: extras.referenceNum,
  }).returning();

  return reply.code(201).send(row);
}

async function adjustBalance(
  tenantId: string,
  itemId: string,
  storeroomId: string,
  delta: number,
): Promise<void> {
  const [existing] = await db.select().from(inventoryBalances)
    .where(and(eq(inventoryBalances.itemId, itemId), eq(inventoryBalances.storeroomId, storeroomId))).limit(1);

  if (existing) {
    const newQty = parseFloat(String(existing.qtyOnHand)) + delta;
    await db.update(inventoryBalances)
      .set({ qtyOnHand: Math.max(0, newQty).toString(), updatedAt: new Date() })
      .where(and(eq(inventoryBalances.itemId, itemId), eq(inventoryBalances.storeroomId, storeroomId)));
  } else {
    await db.insert(inventoryBalances).values({
      tenantId,
      itemId,
      storeroomId,
      qtyOnHand: Math.max(0, delta).toString(),
    });
  }
}
