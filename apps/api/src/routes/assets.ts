import type { FastifyInstance } from 'fastify';
import { eq, and, asc, desc, ilike, or, isNull, sql, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import QRCode from 'qrcode';
import { WorkflowEngine } from '@eam/workflow-engine';
import {
  db,
  assets,
  locations,
  sites,
  organisations,
  assetClassifications,
  assetClassAttributes,
  assetMeters,
  assetMeterReadings,
  locationMeters,
  locationMeterReadings,
  assetMoveHistory,
  assetDowntimeLogs,
  itemAssemblyStructure,
  assetSpares,
  failureCodes,
  workOrders,
  audit,
  statusHistory,
  recordStatusHistory,
  items,
  users,
} from '@eam/db';
import { requirePermission } from '../plugins/auth.js';
import { AUTO_RECORD_CODE_START, nextAutoRecordCode } from '@eam/shared';
import { validateCustomFields } from '../lib/entity-fields.js';

const readGuard = { preHandler: requirePermission('assets:read') };
const writeGuard = { preHandler: requirePermission('assets:write') };

/** Ascending numeric Asset Code order (10000, 10001, …). */
const assetNumAsc = asc(
  sql`CASE WHEN ${assets.assetNum} ~ '^[0-9]+$' THEN ${assets.assetNum}::bigint ELSE 2147483647 END`,
);

/** Descending numeric Asset Code order (…, 10001, 10000). */
const assetNumDesc = desc(
  sql`CASE
    WHEN ${assets.assetNum} ~ '^[0-9]+$' THEN ${assets.assetNum}::bigint
    WHEN ${assets.assetNum} ~ '^AST-[0-9]+$' THEN regexp_replace(${assets.assetNum}, '^AST-', '')::bigint
    ELSE 0
  END`,
);

/** Next sequential numeric Asset Code for a tenant (continues after migration). */
async function nextAssetNumForTenant(tid: string): Promise<string> {
  const [{ maxVal }] = await db
    .select({
      maxVal: sql<string | null>`max(
        CASE WHEN ${assets.assetNum} ~ '^[0-9]+$' THEN ${assets.assetNum}::bigint ELSE NULL END
      )`,
    })
    .from(assets)
    .where(eq(assets.tenantId, tid));
  let candidate = maxVal != null ? Number(maxVal) + 1 : AUTO_RECORD_CODE_START;
  for (;;) {
    const num = String(candidate);
    const [dup] = await db
      .select({ id: assets.id })
      .from(assets)
      .where(and(eq(assets.tenantId, tid), eq(assets.assetNum, num)))
      .limit(1);
    if (!dup) return num;
    candidate += 1;
  }
}
const adminGuard = { preHandler: requirePermission('admin:config:manage') };

// Aliases used to resolve site/org via the asset's location when the asset's
// own siteId/orgId are not set directly.
const locationSites = alias(sites, 'location_sites');
const locationOrgs = alias(organisations, 'location_orgs');
const parentAssets = alias(assets, 'parent_assets');
// FIX: alias for resolving createdByUserId -> a display name on the
// GET /assets/:id response, without colliding with any other `users`
// join this file might add later.
const creators = alias(users, 'creators');

// FIX (Sheet row 17 — Position field derived from location code): real
// Maximo derives a CM Location's position from the last segment of its
// code — e.g. "DOOR_3001_1" → position "1", disambiguating multiple
// identical-part siblings under the same parent without requiring it to
// be typed in separately. Auto-detects whichever separator the code
// actually uses (underscore or hyphen) rather than assuming one.
//
// FIX: previously this only ever looked at `code`, so an admin who
// (reasonably) typed the segmented identifier into the Name field
// instead — Code left blank or unsegmented — got no derived position at
// all, with no indication why. Now tries `code` first, then falls back
// to `name` when code has no usable separator, so the segmented value
// is picked up regardless of which of the two fields it ended up in.
function derivePosition(code: string, name?: string): string | null {
  const fromCode = derivePositionFromSegmentedString(code);
  if (fromCode) return fromCode;
  return name ? derivePositionFromSegmentedString(name) : null;
}

function derivePositionFromSegmentedString(value: string): string | null {
  const trimmed = value.trim();
  const separator = trimmed.includes('_') ? '_' : trimmed.includes('-') ? '-' : null;
  if (!separator) return null;
  const segments = trimmed.split(separator);
  const last = segments[segments.length - 1];
  return last && last.trim() ? last.trim() : null;
}

export async function assetRoutes(app: FastifyInstance) {

  // ─── Asset hierarchy: circular-reference guard ───────────────────────────────
  // Walks UP the parent chain starting from `candidateParentId`. If we ever
  // reach `assetId` itself, assigning candidateParentId as assetId's parent
  // would create a cycle (A→B→A, or a longer A→B→C→A loop) — block it.
  // Maximo doesn't limit hierarchy depth, and neither do we, but an
  // unbroken cycle would make "Move To" / "Subassemblies" navigation loop
  // forever, so this is the one structural rule we do enforce.
  async function wouldCreateCycle(
    tid: string,
    assetId: string,
    candidateParentId: string,
  ): Promise<boolean> {
    if (assetId === candidateParentId) return true; // an asset can't be its own parent

    let currentId: string | null = candidateParentId;
    const visited = new Set<string>();

    while (currentId) {
      if (currentId === assetId) return true; // found assetId while walking up — cycle
      if (visited.has(currentId)) break; // already-broken/cyclic data elsewhere — stop, don't loop forever
      visited.add(currentId);

      const [row] = await db
        .select({ parentAssetId: assets.parentAssetId })
        .from(assets)
        .where(and(eq(assets.id, currentId), eq(assets.tenantId, tid)))
        .limit(1);

      currentId = row?.parentAssetId ?? null;
    }
    return false;
  }


  app.get('/locations', readGuard, async (request) => {
    const { siteId, parentId, flat, includeInactive } = request.query as {
      siteId?: string;
      parentId?: string;
      flat?: string;
      includeInactive?: string;
    };
    const tid = request.user!.tenantId;

    // FIX: real Maximo manages Locations at the Site level — confirmed:
    // "Assets and Locations must be unique within a Site." A scoped user
    // (Security Group with Authorize for Sites/Org/Location, not "All
    // Sites") must never see Locations outside their permitted scope,
    // same rule as /assets below. This route had zero scope filtering
    // before — any user with assets:read saw every Location in the
    // tenant regardless of their Security Group's Site authorization.
    const scope = request.user!.scope;
    const scopeFilter = scope?.unrestricted
      ? undefined
      : or(
          scope?.organisationIds?.length ? inArray(locations.orgId, scope.organisationIds) : undefined,
          scope?.siteIds?.length ? inArray(locations.siteId, scope.siteIds) : undefined,
          scope?.locationIds?.length ? inArray(locations.id, scope.locationIds) : undefined,
        );

    const rows = await db
      .select()
      .from(locations)
      .where(
        and(
          eq(locations.tenantId, tid),
          // FIX: this list previously had no isActive filtering at all —
          // harmless before now since nothing could actually deactivate a
          // Location (the only DELETE route hard-deleted it outright, see
          // below), but now that Deactivate is a real soft-delete, a
          // deactivated Location needs to default to hidden here, with a
          // way back via includeInactive=true (the new "Show inactive
          // locations" toggle on the location tree page).
          includeInactive === 'true' ? undefined : eq(locations.isActive, true),
          siteId ? eq(locations.siteId, siteId) : undefined,
          parentId === 'null'
            ? isNull(locations.parentId)
            : parentId
            ? eq(locations.parentId, parentId)
            : undefined,
          scopeFilter,
        ),
      )
      .orderBy(locations.code);

    if (flat === 'true') return rows;

    // Build tree when parentId not specified
    const map = new Map<string, (typeof rows[0] & { children: unknown[] })>();
    for (const r of rows) map.set(r.id, { ...r, children: [] });
    const roots: unknown[] = [];
    for (const r of rows) {
      if (r.parentId && map.has(r.parentId)) {
        map.get(r.parentId)!.children.push(map.get(r.id)!);
      } else {
        roots.push(map.get(r.id)!);
      }
    }
    return roots;
  });

  // FIX: a Location Detail page existed in the frontend (LocationTree.tsx
  // links to /locations/:id) but no matching GET route or page ever
  // existed — clicking any location name went to a blank screen. This is
  // also what makes Sheet rows 4/5 (parent-link auto-set/reset on Move)
  // actually verifiable in the browser instead of only via SQL: shows the
  // location's own CM/position fields, its parent location, and which
  // asset(s) are currently installed there.
  app.get('/locations/:id', readGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tid = request.user!.tenantId;

    const parentLocations = alias(locations, 'parent_locations');
    const cmItems = alias(items, 'cm_items');
    const creators = alias(users, 'location_creators');

    const [location] = await db
      .select({
        id: locations.id,
        code: locations.code,
        name: locations.name,
        description: locations.description,
        type: locations.type,
        position: locations.position,
        path: locations.path,
        isCmLocation: locations.isCmLocation,
        assetRequired: locations.assetRequired,
        cmItemId: locations.cmItemId,
        cmItemNum: cmItems.itemNum,
        cmItemDescription: cmItems.description,
        glAccount: locations.glAccount,
        costCenter: locations.costCenter,
        isActive: locations.isActive,
        parentId: locations.parentId,
        parentName: parentLocations.name,
        parentCode: parentLocations.code,
        siteId: locations.siteId,
        siteName: sites.name,
        orgId: locations.orgId,
        orgName: organisations.name,
        createdAt: locations.createdAt,
        createdByName: creators.displayName,
      })
      .from(locations)
      .leftJoin(parentLocations, eq(locations.parentId, parentLocations.id))
      .leftJoin(sites, eq(locations.siteId, sites.id))
      .leftJoin(organisations, eq(locations.orgId, organisations.id))
      .leftJoin(cmItems, eq(locations.cmItemId, cmItems.id))
      .leftJoin(creators, eq(locations.createdByUserId, creators.id))
      .where(and(eq(locations.id, id), eq(locations.tenantId, tid)))
      .limit(1);

    if (!location) return reply.code(404).send({ error: 'Location not found' });

    // FIX (Sheet row 4/5 testability): which asset(s) currently sit at
    // this exact location, and at its child locations — the same lookup
    // the Move route's parent-link auto-set logic uses internally.
    const installedAssets = await db
      .select({ id: assets.id, assetNum: assets.assetNum, description: assets.description, parentAssetId: assets.parentAssetId })
      .from(assets)
      .where(and(eq(assets.locationId, id), eq(assets.tenantId, tid)))
      .orderBy(assetNumAsc);

    const childLocations = await db
      .select({ id: locations.id, code: locations.code, name: locations.name, isCmLocation: locations.isCmLocation })
      .from(locations)
      .where(and(eq(locations.parentId, id), eq(locations.tenantId, tid)))
      .orderBy(locations.code);

    return reply.send({ ...location, installedAssets, childLocations });
  });

  // FIX (Sheet row 9 — Configuration Consistency Report): real Maximo's
  // CM Locations audit — scans every CM Location for configuration
  // gaps and flags them by severity, instead of relying on someone to
  // manually notice a missing/duplicate/incomplete installation. Three
  // categories, matching the training-manual color scheme:
  //   RED    — assetRequired = true but nothing is installed there
  //   ORANGE — more than one asset is installed at the same CM Location
  //            (a configuration error — a slot should hold exactly one)
  //   YELLOW — an asset is installed but has no serialNum, or the
  //            location has isCmLocation on with no cmItemId configured
  //            (the slot's rule itself is incomplete, not enforceable yet)
  app.get('/locations/cm-consistency-report', readGuard, async (request) => {
    const tid = request.user!.tenantId;

    const cmLocations = await db
      .select({
        id: locations.id,
        code: locations.code,
        name: locations.name,
        assetRequired: locations.assetRequired,
        cmItemId: locations.cmItemId,
      })
      .from(locations)
      .where(and(eq(locations.tenantId, tid), eq(locations.isCmLocation, true)));

    const issues: {
      severity: 'RED' | 'ORANGE' | 'YELLOW';
      locationId: string;
      locationCode: string;
      locationName: string;
      message: string;
    }[] = [];

    for (const loc of cmLocations) {
      const installed = await db
        .select({ id: assets.id, assetNum: assets.assetNum, serialNum: assets.serialNum })
        .from(assets)
        .where(and(eq(assets.locationId, loc.id), eq(assets.tenantId, tid)));

      if (loc.assetRequired && installed.length === 0) {
        issues.push({
          severity: 'RED',
          locationId: loc.id, locationCode: loc.code, locationName: loc.name,
          message: 'Asset Required is set, but no asset is currently installed here.',
        });
      }
      if (installed.length > 1) {
        issues.push({
          severity: 'ORANGE',
          locationId: loc.id, locationCode: loc.code, locationName: loc.name,
          message: `${installed.length} assets are installed here (${installed.map((a) => a.assetNum).join(', ')}) — a CM Location should hold exactly one.`,
        });
      }
      for (const a of installed) {
        if (!a.serialNum) {
          issues.push({
            severity: 'YELLOW',
            locationId: loc.id, locationCode: loc.code, locationName: loc.name,
            message: `Asset ${a.assetNum} is installed here but has no serial number recorded.`,
          });
        }
      }
      if (!loc.cmItemId) {
        issues.push({
          severity: 'YELLOW',
          locationId: loc.id, locationCode: loc.code, locationName: loc.name,
          message: 'This location is flagged as a CM Location but has no Required Item configured — item-match validation is skipped here.',
        });
      }
    }

    return {
      totalCmLocations: cmLocations.length,
      totalIssues: issues.length,
      redCount: issues.filter((i) => i.severity === 'RED').length,
      orangeCount: issues.filter((i) => i.severity === 'ORANGE').length,
      yellowCount: issues.filter((i) => i.severity === 'YELLOW').length,
      issues,
    };
  });

  app.post('/locations', writeGuard, async (request, reply) => {
    const body = request.body as {
      code?: string;
      name: string;
      description?: string;
      siteId?: string;
      orgId?: string;
      parentId?: string;
      type?: string;
      glAccount?: string;
      costCenter?: string;
      // FIX (Sheet rows 2, 3): position slot identifier + real Maximo's
      // CM Location flags — see /assets/:id/move's item-match validation.
      position?: string;
      isCmLocation?: boolean;
      cmItemId?: string;
      assetRequired?: boolean;
    };
    const tid = request.user!.tenantId;

    // FIX: same gap as assets had — "Code" was a required manual text
    // field with no auto-generation, so every location required the
    // admin to invent a unique code by hand. Sequential LOC-00001,
    // LOC-00002, ... scoped per tenant, same convention as AST-00001 for
    // assets. An explicitly typed code still wins — this only fills in
    // when the field was left blank.
    let code = body.code?.trim().toUpperCase();
    if (!code) {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(locations)
        .where(eq(locations.tenantId, tid));
      code = nextAutoRecordCode(count);
    }

    // FIX (Sheet row 17): only derive when the caller didn't explicitly
    // type a position — an explicit value (even if it happens to look
    // different from what derivation would produce) always wins, since
    // the admin creating this location may know something the code
    // string alone doesn't capture.
    const position = body.position ?? derivePosition(code, body.name);

    let siteId = body.siteId;
    let orgId = body.orgId;
    const scope = request.user!.scope;
    if (!siteId && !scope?.unrestricted) {
      const [me] = await db.select({ defaultSiteId: users.defaultSiteId }).from(users)
        .where(eq(users.id, request.user!.id)).limit(1);
      if (me?.defaultSiteId) siteId = me.defaultSiteId;
    }
    if (siteId && !orgId) {
      const [site] = await db.select({ orgId: sites.orgId })
        .from(sites)
        .where(and(eq(sites.id, siteId), eq(sites.tenantId, tid)))
        .limit(1);
      orgId = site?.orgId ?? undefined;
    }

    // FIX (P1-1 gap — materialized path): resolve the parent's path (if
    // any) so this new row's own path can be written in the same insert
    // rather than left null and backfilled later. A location created
    // with a parentId that doesn't resolve to a real row (bad/stale id)
    // just falls back to being its own root — same as parentId being
    // absent — rather than failing the whole create.
    let parentPath: string | null = null;
    if (body.parentId) {
      const [parent] = await db
        .select({ path: locations.path, siteId: locations.siteId })
        .from(locations)
        .where(and(eq(locations.id, body.parentId), eq(locations.tenantId, tid)))
        .limit(1);
      if (parent && siteId && parent.siteId && parent.siteId !== siteId) {
        return reply.code(400).send({ error: 'Parent location must belong to the same Site.' });
      }
      if (!siteId && parent?.siteId) siteId = parent.siteId;
      parentPath = parent?.path ?? null;
    }

    const [row] = await db
      .insert(locations)
      .values({
        tenantId: tid,
        ...body,
        code,
        position,
        siteId,
        orgId,
        createdByUserId: request.user!.id,
        // path finalized below once we have the new row's own id — insert
        // a placeholder first since the id is generated by the DB.
        path: '',
      } as typeof locations.$inferInsert)
      .returning();

    const path = parentPath ? `${parentPath}.${row!.id}` : row!.id;
    const [finalRow] = await db
      .update(locations)
      .set({ path })
      .where(eq(locations.id, row!.id))
      .returning();

    await audit(db, {
      tenantId: tid,
      userId: request.user!.id,
      action: 'CREATE',
      resource: 'Location',
      resourceId: row!.id,
    });

    return reply.code(201).send(finalRow);
  });

  app.put('/locations/:id', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<typeof locations.$inferInsert>;
    const tid = request.user!.tenantId;

    const [existing] = await db
      .select()
      .from(locations)
      .where(and(eq(locations.id, id), eq(locations.tenantId, tid)))
      .limit(1);
    if (!existing) return reply.code(404).send({ error: 'Location not found' });

    // FIX (P1-1 gap — AC-P1-1.2): "Moving a location subtree recomputes
    // materialized path for all descendants within one transaction."
    // parentId is only present in body on an actual move (the location
    // tree's drag-and-drop UI sends it explicitly); other field-only
    // edits (name, glAccount, etc.) skip this block entirely — no path
    // work needed when the location isn't changing position in the
    // hierarchy.
    const isMove = Object.prototype.hasOwnProperty.call(body, 'parentId')
      && body.parentId !== existing.parentId;

    if (!isMove) {
      const [row] = await db
        .update(locations)
        .set({ ...body, updatedAt: new Date() })
        .where(and(eq(locations.id, id), eq(locations.tenantId, tid)))
        .returning();
      await audit(db, { tenantId: tid, userId: request.user!.id, action: 'UPDATE', resource: 'Location', resourceId: id });
      return row;
    }

    // Guard against creating a cycle: the new parent can't be this
    // location itself or any of its own descendants (detectable cheaply
    // via the old path prefix, before it's rewritten below).
    if (body.parentId === id) {
      return reply.code(400).send({ error: 'A location cannot be moved under itself' });
    }
    if (body.parentId) {
      const [newParent] = await db
        .select({ path: locations.path })
        .from(locations)
        .where(and(eq(locations.id, body.parentId), eq(locations.tenantId, tid)))
        .limit(1);
      if (!newParent) return reply.code(400).send({ error: 'Target parent location not found' });
      if (newParent.path === existing.path || newParent.path?.startsWith(`${existing.path}.`)) {
        return reply.code(400).send({ error: 'Cannot move a location under one of its own descendants' });
      }
    }

    const result = await db.transaction(async (tx) => {
      const [newParent] = body.parentId
        ? await tx
            .select({ path: locations.path })
            .from(locations)
            .where(and(eq(locations.id, body.parentId!), eq(locations.tenantId, tid)))
            .limit(1)
        : [{ path: null as string | null }];

      const newPath = newParent?.path ? `${newParent.path}.${id}` : id;
      const oldPath = existing.path ?? id;

      const [updated] = await tx
        .update(locations)
        .set({ ...body, path: newPath, updatedAt: new Date() })
        .where(and(eq(locations.id, id), eq(locations.tenantId, tid)))
        .returning();

      // Every descendant's path is prefixed with the old path; rewrite
      // that prefix to the new one in a single statement so the whole
      // subtree moves atomically with the node itself.
      await tx.execute(sql`
        UPDATE ${locations}
        SET "path" = ${newPath} || substring("path" from ${oldPath.length + 1}),
            "updated_at" = now()
        WHERE "tenant_id" = ${tid}
          AND "path" LIKE ${oldPath + '.%'}
      `);

      return updated;
    });

    await audit(db, { tenantId: tid, userId: request.user!.id, action: 'MOVE', resource: 'Location', resourceId: id });
    return result;
  });

  // FIX (P1-1 gap): PRD API surface explicitly lists
  // "GET /locations/:id/subtree — Return full descendant tree (uses
  // materialized path)". Previously there was no dedicated endpoint for
  // this — the plain GET /locations list rebuilds a tree in memory from
  // every location in scope, which doesn't scale to "give me just this
  // one branch." This is the query the materialized path column exists
  // to make fast: a single indexed prefix match instead of a recursive
  // walk.
  app.get('/locations/:id/subtree', readGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tid = request.user!.tenantId;

    const [root] = await db
      .select()
      .from(locations)
      .where(and(eq(locations.id, id), eq(locations.tenantId, tid)))
      .limit(1);
    if (!root) return reply.code(404).send({ error: 'Location not found' });

    const rootPath = root.path ?? id;
    const descendants = await db
      .select()
      .from(locations)
      .where(and(
        eq(locations.tenantId, tid),
        sql`${locations.path} LIKE ${rootPath + '.%'}`,
      ))
      .orderBy(locations.path);

    const all = [root, ...descendants];
    const map = new Map<string, (typeof all[0] & { children: unknown[] })>();
    for (const r of all) map.set(r.id, { ...r, children: [] });
    for (const r of all) {
      if (r.id !== root.id && r.parentId && map.has(r.parentId)) {
        map.get(r.parentId)!.children.push(map.get(r.id)!);
      }
    }
    return map.get(root.id);
  });

  app.delete('/locations/:id', adminGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tid = request.user!.tenantId;

    // Check for child locations or assets
    const [childLoc] = await db.select({ id: locations.id }).from(locations)
      .where(and(eq(locations.parentId, id), eq(locations.tenantId, tid), eq(locations.isActive, true))).limit(1);
    if (childLoc) return reply.code(409).send({ error: 'Cannot deactivate a location with active child locations' });

    const [childAsset] = await db.select({ id: assets.id }).from(assets)
      .where(and(eq(assets.locationId, id), eq(assets.tenantId, tid))).limit(1);
    if (childAsset) return reply.code(409).send({ error: 'Cannot deactivate a location with assets installed' });

    // FIX: this was a genuine hard `db.delete(locations)...` — the only
    // entity in this whole gap-analysis pass still doing that, while
    // Organisations/Sites/Items (see admin-org.ts, inventory.ts) all use
    // isActive soft-delete specifically so historical Work Orders/Move
    // History/audit records that reference a Location don't end up
    // pointing at a row that no longer exists. Converted to match —
    // "Deactivate" now behaves identically across every master-data
    // entity in the platform.
    const [row] = await db
      .update(locations)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(locations.id, id), eq(locations.tenantId, tid)))
      .returning();

    if (!row) return reply.code(404).send({ error: 'Location not found' });
    return reply.code(200).send(row);
  });

  app.post('/locations/:id/reactivate', adminGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tid = request.user!.tenantId;

    const [row] = await db
      .update(locations)
      .set({ isActive: true, updatedAt: new Date() })
      .where(and(eq(locations.id, id), eq(locations.tenantId, tid)))
      .returning();

    if (!row) return reply.code(404).send({ error: 'Location not found' });
    return reply.code(200).send(row);
  });

  // ─── Location Meters (Maximo parity) ────────────────────────────────────────
  // FIX: Maximo attaches meters to Locations as well as Assets. A
  // Location meter can never itself *accept* a rolldown — Maximo: "there
  // is no rolldown of meter readings between locations in the location
  // hierarchy" — so it has no acceptRolldownFrom field. It can only ever
  // be a rolldown *source*: an asset sitting at this location, whose own
  // meter of the same name has acceptRolldownFrom = 'LOCATION', receives
  // this reading automatically (see the readings route below).

  app.get('/locations/:id/meters', readGuard, async (request) => {
    const { id } = request.params as { id: string };
    return db.select().from(locationMeters)
      .where(and(eq(locationMeters.locationId, id), eq(locationMeters.isActive, true)));
  });

  app.post('/locations/:id/meters', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      name: string;
      unit: string;
      meterType?: 'GAUGE' | 'CONTINUOUS' | 'CHARACTERISTIC';
      rolloverValue?: string;
    };
    const tid = request.user!.tenantId;

    try {
      const [row] = await db.insert(locationMeters).values({
        locationId: id,
        tenantId: tid,
        name: body.name,
        unit: body.unit,
        meterType: body.meterType ?? 'CONTINUOUS',
        rolloverValue: body.rolloverValue,
      }).returning();

      return reply.code(201).send(row);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('location_meters_location_name_idx')) {
        return reply.code(409).send({
          error: `A meter named "${body.name}" already exists on this location.`,
          code: 'DUPLICATE_METER_NAME',
        });
      }
      throw err;
    }
  });

  app.put('/locations/:id/meters/:meterId', writeGuard, async (request, reply) => {
    const { id, meterId } = request.params as { id: string; meterId: string };
    const body = request.body as Partial<{
      unit: string;
      meterType: 'GAUGE' | 'CONTINUOUS' | 'CHARACTERISTIC';
      rolloverValue: string | null;
      isActive: boolean;
    }>;

    const updates: Partial<typeof locationMeters.$inferInsert> = {};
    if (body.unit != null) updates.unit = body.unit;
    if (body.meterType != null) updates.meterType = body.meterType;
    if ('rolloverValue' in body) updates.rolloverValue = body.rolloverValue ?? null;
    if (body.isActive != null) updates.isActive = body.isActive;

    const [row] = await db.update(locationMeters).set(updates)
      .where(and(eq(locationMeters.id, meterId), eq(locationMeters.locationId, id)))
      .returning();

    if (!row) return reply.code(404).send({ error: 'Meter not found' });
    return row;
  });

  app.get('/locations/:id/meters/:meterId/readings', readGuard, async (request) => {
    const { meterId } = request.params as { id: string; meterId: string };
    return db.select().from(locationMeterReadings)
      .where(eq(locationMeterReadings.meterId, meterId))
      .orderBy(desc(locationMeterReadings.readingDate));
  });

  app.post('/locations/:id/meters/:meterId/readings', writeGuard, async (request, reply) => {
    const { id, meterId } = request.params as { id: string; meterId: string };
    const body = request.body as { value: string; readingDate?: string; notes?: string; isRollover?: boolean };
    const tid = request.user!.tenantId;

    const [meter] = await db.select().from(locationMeters)
      .where(and(eq(locationMeters.id, meterId), eq(locationMeters.locationId, id))).limit(1);
    if (!meter) return reply.code(404).send({ error: 'Meter not found' });

    const prev = meter.lastReading ? parseFloat(String(meter.lastReading)) : null;
    const curr = parseFloat(body.value);
    if (Number.isNaN(curr)) {
      return reply.code(400).send({ error: 'Reading value must be a number' });
    }

    if (meter.meterType === 'CONTINUOUS' && prev !== null && curr < prev && !body.isRollover) {
      return reply.code(400).send({
        error:
          'This reading is lower than the current reading for a CONTINUOUS meter. ' +
          'If the meter genuinely rolled over, resubmit with isRollover: true.',
        currentReading: prev,
        submittedReading: curr,
      });
    }

    const rolloverOccurred = meter.meterType === 'CONTINUOUS' && prev !== null && curr < prev && body.isRollover;
    const rolloverCeiling = meter.rolloverValue ? parseFloat(String(meter.rolloverValue)) : null;
    const delta =
      prev === null
        ? null
        : rolloverOccurred
        ? (rolloverCeiling !== null ? (rolloverCeiling - prev + curr).toString() : null)
        : (curr - prev).toString();

    const [reading] = await db.insert(locationMeterReadings).values({
      meterId,
      tenantId: tid,
      value: body.value,
      delta,
      readingDate: body.readingDate ? new Date(body.readingDate) : new Date(),
      loggedByUserId: request.user!.id,
      notes: body.notes,
    }).returning();

    await db.update(locationMeters).set({
      lastReading: body.value,
      lastReadingDate: reading!.readingDate,
    }).where(eq(locationMeters.id, meterId));

    // FIX (Maximo rolldown parity): roll this reading down to every Asset
    // currently at this Location whose own meter of the same name has
    // acceptRolldownFrom = 'LOCATION' — the Location-as-source half of
    // the same model used for parent-asset rolldown in the Asset Meters
    // section below.
    const assetsAtLocation = await db
      .select({ id: assets.id })
      .from(assets)
      .where(and(eq(assets.locationId, id), eq(assets.tenantId, tid)));

    for (const asset of assetsAtLocation) {
      const [assetMeter] = await db
        .select()
        .from(assetMeters)
        .where(and(eq(assetMeters.assetId, asset.id), eq(assetMeters.name, meter.name)))
        .limit(1);
      if (!assetMeter || assetMeter.acceptRolldownFrom !== 'LOCATION') continue;

      const assetPrev = assetMeter.lastReading ? parseFloat(String(assetMeter.lastReading)) : null;
      const assetDelta = assetPrev !== null ? (curr - assetPrev).toString() : null;

      await db.insert(assetMeterReadings).values({
        meterId: assetMeter.id,
        tenantId: tid,
        value: body.value,
        delta: assetDelta,
        readingDate: reading!.readingDate,
        loggedByUserId: request.user!.id,
        notes: '(rolled down from location reading)',
      });
      await db.update(assetMeters).set({
        lastReading: body.value,
        lastReadingDate: reading!.readingDate,
      }).where(eq(assetMeters.id, assetMeter.id));
    }

    return reply.code(201).send(reading);
  });

  // ─── Asset Classifications ────────────────────────────────────────────────────

  app.get('/asset-classifications', readGuard, async (request) => {
    const tid = request.user!.tenantId;
    return db.select().from(assetClassifications)
      .where(and(eq(assetClassifications.tenantId, tid), eq(assetClassifications.isActive, true)))
      .orderBy(assetClassifications.classCode);
  });

  app.post('/asset-classifications', adminGuard, async (request, reply) => {
    const body = request.body as {
      classCode: string;
      description: string;
      parentId?: string;
    };
    const tid = request.user!.tenantId;
    const [row] = await db.insert(assetClassifications).values({ tenantId: tid, ...body }).returning();
    return reply.code(201).send(row);
  });

  app.put('/asset-classifications/:id', adminGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<typeof assetClassifications.$inferInsert>;
    const tid = request.user!.tenantId;
    const [row] = await db.update(assetClassifications).set(body)
      .where(and(eq(assetClassifications.id, id), eq(assetClassifications.tenantId, tid)))
      .returning();
    if (!row) return reply.code(404).send({ error: 'Classification not found' });
    return row;
  });

  app.get('/asset-classifications/:id/attributes', readGuard, async (request) => {
    const { id } = request.params as { id: string };
    return db.select().from(assetClassAttributes).where(eq(assetClassAttributes.classId, id));
  });

  app.post('/asset-classifications/:id/attributes', adminGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { attrName: string; attrType?: string; isRequired?: boolean; defaultValue?: string };
    const [row] = await db.insert(assetClassAttributes).values({ classId: id, ...body }).returning();
    return reply.code(201).send(row);
  });

  // ─── Failure Codes ────────────────────────────────────────────────────────────

  app.get('/failure-codes', readGuard, async (request) => {
    const { type } = request.query as { type?: string };
    const tid = request.user!.tenantId;
    return db.select().from(failureCodes).where(
      and(
        eq(failureCodes.tenantId, tid),
        eq(failureCodes.isActive, true),
        type ? eq(failureCodes.type, type as 'PROBLEM' | 'CAUSE' | 'REMEDY') : undefined,
      ),
    ).orderBy(failureCodes.type, failureCodes.code);
  });

  app.post('/failure-codes', adminGuard, async (request, reply) => {
    const body = request.body as {
      type: 'PROBLEM' | 'CAUSE' | 'REMEDY';
      code: string;
      description: string;
      parentId?: string;
    };
    const tid = request.user!.tenantId;
    const [row] = await db.insert(failureCodes).values({ tenantId: tid, ...body }).returning();
    return reply.code(201).send(row);
  });

  app.put('/failure-codes/:id', adminGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<typeof failureCodes.$inferInsert>;
    const tid = request.user!.tenantId;
    const [row] = await db.update(failureCodes).set(body)
      .where(and(eq(failureCodes.id, id), eq(failureCodes.tenantId, tid))).returning();
    if (!row) return reply.code(404).send({ error: 'Failure code not found' });
    return row;
  });

  // ─── Assets ───────────────────────────────────────────────────────────────────

  app.get('/assets', readGuard, async (request) => {
    const { status, siteId, orgId, locationId, classId, criticality, q, page, pageSize } =
      request.query as {
        status?: string;
        siteId?: string;
        orgId?: string;
        locationId?: string;
        classId?: string;
        criticality?: string;
        q?: string;
        page?: string;
        pageSize?: string;
      };
    const tid = request.user!.tenantId;
    const limit = Math.min(Number(pageSize ?? 50), 200);
    const offset = (Number(page ?? 1) - 1) * limit;

    // FIX: PRD §8.1 — "Data scoping: Roles scoped to organisation, site, or
    // location." request.user!.scope was populated by the auth plugin from
    // the JWT (see packages/auth — getEffectivePermissions /
    // computeEffectiveScope). unrestricted skips filtering entirely
    // (today's behaviour for every existing role, since they default to
    // scopeType 'ALL'). A scoped user only sees assets whose orgId/siteId/
    // locationId falls in one of their three allow-lists — OR'd together,
    // since a role can be scoped by any one of the three granularities.
    const scope = request.user!.scope;
    const scopeFilter = scope?.unrestricted
      ? undefined
      : or(
          scope?.organisationIds?.length ? inArray(assets.orgId, scope.organisationIds) : undefined,
          scope?.siteIds?.length ? inArray(assets.siteId, scope.siteIds) : undefined,
          scope?.locationIds?.length ? inArray(assets.locationId, scope.locationIds) : undefined,
        );

    const rows = await db
      .select({
        id: assets.id,
        assetNum: assets.assetNum,
        description: assets.description,
        status: assets.status,
        criticality: assets.criticality,
        manufacturer: assets.manufacturer,
        model: assets.model,
        serialNum: assets.serialNum,
        installDate: assets.installDate,
        warrantyExpiry: assets.warrantyExpiry,
        locationId: assets.locationId,
        siteId: assets.siteId,
        isRotating: assets.isRotating,
        position: assets.position,
        classId: assets.classId,
        updatedAt: assets.updatedAt,
        locationCode: locations.code,
        locationName: locations.name,
        siteNum: sql<string | null>`coalesce(${sites.siteNum}, ${locationSites.siteNum})`,
        siteName: sql<string | null>`coalesce(${sites.name}, ${locationSites.name})`,
        className: assetClassifications.description,
      })
      .from(assets)
      .leftJoin(locations, eq(assets.locationId, locations.id))
      .leftJoin(sites, eq(assets.siteId, sites.id))
      .leftJoin(locationSites, eq(locations.siteId, locationSites.id))
      .leftJoin(assetClassifications, eq(assets.classId, assetClassifications.id))
      .where(
        and(
          eq(assets.tenantId, tid),
          scopeFilter,
          status ? eq(assets.status, status as typeof assets.$inferSelect.status) : undefined,
          siteId ? or(eq(assets.siteId, siteId), eq(locations.siteId, siteId)) : undefined,
          orgId ? eq(assets.orgId, orgId) : undefined,
          locationId ? eq(assets.locationId, locationId) : undefined,
          classId ? eq(assets.classId, classId) : undefined,
          criticality ? eq(assets.criticality, criticality as Exclude<typeof assets.$inferSelect.criticality, null>) : undefined,
          q
            ? or(
                ilike(assets.assetNum, `%${q}%`),
                ilike(assets.description, `%${q}%`),
                ilike(assets.serialNum, `%${q}%`),
              )
            : undefined,
        ),
      )
      .orderBy(assetNumDesc)
      .limit(limit)
      .offset(offset);

    return { data: rows, page: Number(page ?? 1), pageSize: limit };
  });

  app.post('/assets', writeGuard, async (request, reply) => {
    const body = request.body as {
      assetNum: string;
      description: string;
      locationId?: string;
      siteId?: string;
      orgId?: string;
      classId?: string;
      parentAssetId?: string;
      // FIX: rotating-asset flag — mirrors Maximo's "rotating item" concept.
      // A rotating asset is interchangeable and trackable as it moves
      // between locations/sites; the move endpoint below uses this to
      // decide whether to also roll the asset's siteId/orgId forward.
      isRotating?: boolean;
      // FIX (Sheet row 3): which Item/part this asset represents — see
      // the item-match validation on /assets/:id/move above.
      itemId?: string;
      status?: string;
      criticality?: string;
      manufacturer?: string;
      model?: string;
      serialNum?: string;
      installDate?: string;
      warrantyExpiry?: string;
      glAccount?: string;
      costCenter?: string;
      purchaseCost?: string;
      replacementCost?: string;
      classAttributes?: Record<string, unknown>;
      customData?: Record<string, unknown>;
    };
    const tid = request.user!.tenantId;

    // FIX: the "Asset number" field's placeholder always said "Auto-generated
    // if blank", but no auto-generation code actually existed — leaving it
    // blank silently saved an empty string into asset_num. That's how a
    // record ended up with the description text sitting in the Asset #
    // column and an empty Description: the form was used as documented
    // (leave Asset # blank, fill in only Description), but the promised
    // auto-numbering never ran, and the resulting blank/garbled asset_num
    // made the list view's two columns look swapped.
    //
    // Also guard against a blank Description — Maximo requires both
    // ASSETNUM and DESCRIPTION on every asset record, and the API should
    // not accept a record that fails that requirement.
    if (!body.description || !body.description.trim()) {
      return reply.status(422).send({ error: 'Description is required.' });
    }

    let assetNum = await nextAssetNumForTenant(tid);

    // FIX: site/org auto-fill from location. The Asset Form only exposes
    // a "Location" picker — there's no separate Site field for the
    // person to fill in — so site_id/org_id were being left NULL on
    // every asset whose creator never explicitly passed them, even
    // though the Overview page LOOKS like it shows a Site (it actually
    // displays the location's site via a join, masking the fact that
    // assets.site_id itself is empty). A NULL site_id silently breaks
    // anything that filters/groups by site directly off the asset row —
    // most importantly the PRD §8.1 data-scoping filter above, which
    // checks assets.siteId and will never match a NULL. Whenever a
    // locationId is given and the caller didn't explicitly set
    // siteId/orgId, we look up the location's own site/org and copy them
    // onto the asset, so the asset's site/org is never silently empty
    // just because the form doesn't have a separate Site field.
    let siteId = body.siteId;
    let orgId = body.orgId;
    if (body.locationId && (!siteId || !orgId)) {
      const [loc] = await db
        .select({ siteId: locations.siteId, orgId: locations.orgId })
        .from(locations)
        .where(and(eq(locations.id, body.locationId), eq(locations.tenantId, tid)))
        .limit(1);
      if (loc) {
        siteId = siteId ?? loc.siteId ?? undefined;
        orgId = orgId ?? loc.orgId ?? undefined;
      }
    }

    // FIX: creation had zero connection to Security Group data scoping,
    // even though every list endpoint (GET /assets, GET /locations, GET
    // /work-orders) already enforces it. Two gaps:
    // 1) A scoped user creating an asset with no Location/Site picked at
    //    all previously just got NULL siteId — now defaults to their own
    //    "Default Insert Site" (Account → Default Information), the same
    //    per-user setting the /account/lookups/sites picker already
    //    restricts to their scope, so this default is guaranteed to be
    //    a Site they're actually authorized for.
    // 2) A scoped user who *did* explicitly pass a siteId (or one
    //    derived from locationId above) outside their Security Group's
    //    authorized Sites/Orgs/Locations was never stopped from creating
    //    an asset there — the data-scope filter only ever applied to
    //    *reading* records back, not to what could be written in the
    //    first place.
    const scope = request.user!.scope;
    if (!siteId && !scope?.unrestricted) {
      const [me] = await db.select({ defaultSiteId: users.defaultSiteId }).from(users)
        .where(eq(users.id, request.user!.id)).limit(1);
      if (me?.defaultSiteId) siteId = me.defaultSiteId;
    }
    if (siteId && !scope?.unrestricted) {
      const inScope =
        (scope?.siteIds?.length && scope.siteIds.includes(siteId)) ||
        (scope?.organisationIds?.length && orgId && scope.organisationIds.includes(orgId)) ||
        (scope?.locationIds?.length && body.locationId && scope.locationIds.includes(body.locationId));
      if (!inScope) {
        return reply.code(403).send({ error: 'You are not authorized to create assets in this Site.' });
      }
    }

    const customData = body.customData ?? {};
    const validation = await validateCustomFields(tid, 'Asset', { ...body, assetNum, ...customData }, request.user!.roles ?? []);
    if (!validation.valid) {
      return reply.status(422).send({ error: 'Validation failed', errors: validation.errors });
    }

    const [row] = await db
      .insert(assets)
      .values({ tenantId: tid, ...body, assetNum, siteId, orgId, createdByUserId: request.user!.id } as typeof assets.$inferInsert)
      .returning();

    await audit(db, { tenantId: tid, userId: request.user!.id, action: 'CREATE', resource: 'Asset', resourceId: row!.id });
    return reply.code(201).send(row);
  });

  // FIX (P1-1 gap — AC-P1-1.7): "Bulk import of 1,000 assets validates
  // against required custom fields; invalid rows reported, valid rows
  // committed." No import endpoint existed at all before this — the
  // "Bulk import wizard with validation preview" UI screen had nothing
  // to call. CSV/Excel parsing is expected to happen client-side (the
  // wizard parses the file into rows in the browser); this endpoint
  // takes the already-parsed rows so it works the same way regardless of
  // whether the source file was .csv or .xlsx.
  //
  // Deliberately row-by-row rather than one all-or-nothing transaction:
  // the whole point of "invalid rows reported, valid rows committed" is
  // that one bad row in a 1,000-row file shouldn't block the other 999.
  app.post('/assets/import', writeGuard, async (request, reply) => {
    const body = request.body as {
      rows: Array<Record<string, unknown> & { assetNum?: string; description?: string }>;
    };
    const tid = request.user!.tenantId;

    if (!Array.isArray(body.rows) || body.rows.length === 0) {
      return reply.status(422).send({ error: 'rows must be a non-empty array' });
    }
    if (body.rows.length > 5000) {
      return reply.status(422).send({ error: 'Import is limited to 5,000 rows per request' });
    }

    let nextSeq = Number(await nextAssetNumForTenant(tid));

    const errors: Array<{ row: number; assetNum?: string; errors: string[] }> = [];
    const insertedIds: string[] = [];

    for (let i = 0; i < body.rows.length; i++) {
      const raw = body.rows[i]!;
      const rowErrors: string[] = [];

      if (!raw.description || !String(raw.description).trim()) {
        rowErrors.push('Description is required.');
      }

      let siteId = raw.siteId as string | undefined;
      let orgId = raw.orgId as string | undefined;
      const locationId = raw.locationId as string | undefined;
      if (locationId && (!siteId || !orgId)) {
        const [loc] = await db
          .select({ siteId: locations.siteId, orgId: locations.orgId })
          .from(locations)
          .where(and(eq(locations.id, locationId), eq(locations.tenantId, tid)))
          .limit(1);
        if (loc) {
          siteId = siteId ?? loc.siteId ?? undefined;
          orgId = orgId ?? loc.orgId ?? undefined;
        } else {
          rowErrors.push(`locationId "${locationId}" does not exist.`);
        }
      }

      const assetNum = raw.assetNum?.toString().trim() || String(nextSeq);

      const customData = (raw.customData as Record<string, unknown>) ?? {};
      const validation = await validateCustomFields(
        tid,
        'Asset',
        { ...raw, assetNum, ...customData },
        request.user!.roles ?? [],
      );
      if (!validation.valid) {
        rowErrors.push(...validation.errors.map((e) => `${e.field_key}: ${e.message}`));
      }

      if (rowErrors.length > 0) {
        errors.push({ row: i, assetNum: raw.assetNum, errors: rowErrors });
        continue;
      }

      try {
        const [inserted] = await db
          .insert(assets)
          .values({
            tenantId: tid,
            ...raw,
            assetNum,
            siteId,
            orgId,
            createdByUserId: request.user!.id,
          } as typeof assets.$inferInsert)
          .returning({ id: assets.id });
        insertedIds.push(inserted!.id);
        if (!raw.assetNum) nextSeq += 1; // only consume an auto-number when one was actually generated
      } catch (e: unknown) {
        errors.push({ row: i, assetNum: raw.assetNum, errors: [e instanceof Error ? e.message : 'Insert failed'] });
      }
    }

    await audit(db, {
      tenantId: tid,
      userId: request.user!.id,
      action: 'BULK_IMPORT',
      resource: 'Asset',
      resourceId: null,
      metadata: { totalRows: body.rows.length, inserted: insertedIds.length, failed: errors.length },
    });

    return reply.code(errors.length > 0 && insertedIds.length === 0 ? 422 : 200).send({
      totalRows: body.rows.length,
      insertedCount: insertedIds.length,
      insertedIds,
      failedCount: errors.length,
      errors,
    });
  });

  app.get('/assets/next-code', readGuard, async (request) => {
    const tid = request.user!.tenantId;
    const assetCode = await nextAssetNumForTenant(tid);
    return { assetCode };
  });

  app.get('/assets/:id', readGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tid = request.user!.tenantId;

    const [asset] = await db
      .select({
        id: assets.id,
        assetNum: assets.assetNum,
        description: assets.description,
        status: assets.status,
        criticality: assets.criticality,
        manufacturer: assets.manufacturer,
        model: assets.model,
        serialNum: assets.serialNum,
        installDate: assets.installDate,
        warrantyExpiry: assets.warrantyExpiry,
        locationId: assets.locationId,
        siteId: sql<string | null>`coalesce(${assets.siteId}, ${locations.siteId})`,
        orgId: assets.orgId,
        parentAssetId: assets.parentAssetId,
        parentAssetNum: parentAssets.assetNum,
        parentAssetDescription: parentAssets.description,
        isRotating: assets.isRotating,
        // FIX: assetType was missing from this route's select entirely —
        // every GET /assets/:id response silently returned `undefined`
        // for it, which meant the Asset edit form (AssetForm.tsx) always
        // fell back to its 'NORMAL' default on load, even for an asset
        // that was actually STRUCTURAL in the database. Saving that form
        // without ever touching the Asset Type field would then silently
        // overwrite STRUCTURAL back to NORMAL on every edit — quietly
        // undoing the Sheet row 7 move-block rule. Also adding the Sheet
        // row 13 Linear Asset fields (isLinear/lengthUnit/totalLength),
        // which were defined on the schema but never selected or
        // surfaced anywhere in the app at all.
        assetType: assets.assetType,
        isLinear: assets.isLinear,
        lengthUnit: assets.lengthUnit,
        totalLength: assets.totalLength,
        // FIX: "who created this asset and when" — createdAt already
        // existed; createdByUserId is new, resolved here to a display
        // name so the frontend doesn't need a second round-trip.
        createdByUserId: assets.createdByUserId,
        createdByName: creators.displayName,
        // FIX: these three were missing from this route's select —
        // position silently broke the Asset Detail page's Position
        // field (the `{asset.position && (...)}` check always saw
        // undefined and never rendered, even though the value was
        // correctly stored by the Move route). itemId and
        // classAttributeOverrides are needed for the new Classification
        // tab (Sheet row 12) to show what's inherited vs locked.
        position: assets.position,
        itemId: assets.itemId,
        classAttributeOverrides: assets.classAttributeOverrides,
        classId: assets.classId,
        glAccount: assets.glAccount,
        costCenter: assets.costCenter,
        purchaseCost: assets.purchaseCost,
        replacementCost: assets.replacementCost,
        classAttributes: assets.classAttributes,
        customData: assets.customData,
        createdAt: assets.createdAt,
        updatedAt: assets.updatedAt,
        locationCode: locations.code,
        locationName: locations.name,
        siteNum: sql<string | null>`coalesce(${sites.siteNum}, ${locationSites.siteNum})`,
        siteName: sql<string | null>`coalesce(${sites.name}, ${locationSites.name})`,
        orgName: sql<string | null>`coalesce(${organisations.name}, ${locationOrgs.name})`,
        className: assetClassifications.description,
        itemNum: items.itemNum,
        itemDescription: items.description,
      })
      .from(assets)
      .leftJoin(locations, eq(assets.locationId, locations.id))
      .leftJoin(sites, eq(assets.siteId, sites.id))
      .leftJoin(organisations, eq(assets.orgId, organisations.id))
      .leftJoin(items, eq(assets.itemId, items.id))
      .leftJoin(locationSites, eq(locations.siteId, locationSites.id))
      .leftJoin(locationOrgs, eq(locations.orgId, locationOrgs.id))
      .leftJoin(assetClassifications, eq(assets.classId, assetClassifications.id))
      .leftJoin(parentAssets, eq(assets.parentAssetId, parentAssets.id))
      .leftJoin(creators, eq(assets.createdByUserId, creators.id))
      .where(and(eq(assets.id, id), eq(assets.tenantId, tid)))
      .limit(1);

    if (!asset) return reply.code(404).send({ error: 'Asset not found' });

    // Get meters
    const meters = await db.select().from(assetMeters)
      .where(and(eq(assetMeters.assetId, id), eq(assetMeters.isActive, true)));

    // Open work orders count
    const openWOs = await db.select({ id: workOrders.id, woNum: workOrders.woNum, status: workOrders.status })
      .from(workOrders)
      .where(and(
        eq(workOrders.assetId, id),
        eq(workOrders.tenantId, tid),
      ))
      .orderBy(desc(workOrders.createdAt))
      .limit(5);

    return { ...asset, meters, recentWorkOrders: openWOs };
  });

  app.put('/assets/:id', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<typeof assets.$inferInsert>;
    const tid = request.user!.tenantId;

    // FIX: same guard as POST /assets — never allow assetNum or description
    // to be cleared to blank on an edit. (Only checked when the field is
    // actually present in the request body — a partial update that doesn't
    // touch these fields at all should pass through untouched.)
    if ('assetNum' in body && (!body.assetNum || !body.assetNum.trim())) {
      return reply.status(422).send({ error: 'Asset number cannot be blank.' });
    }
    if ('description' in body && (!body.description || !body.description.trim())) {
      return reply.status(422).send({ error: 'Description cannot be blank.' });
    }

    // FIX: block assigning a parent that would create a circular hierarchy
    // (A→B→A or a longer loop). Only relevant when parentAssetId is being
    // set to a real value — clearing it (null) can never create a cycle.
    if (body.parentAssetId) {
      const cyclic = await wouldCreateCycle(tid, id, body.parentAssetId);
      if (cyclic) {
        return reply.status(422).send({
          error: 'This would create a circular asset hierarchy — the selected parent is already a descendant of this asset.',
          message: 'Invalid parent asset',
        });
      }
    }

    // Get current status before update for transition detection
    const [current] = await db.select({ status: assets.status, classAttributes: assets.classAttributes, classAttributeOverrides: assets.classAttributeOverrides })
      .from(assets).where(and(eq(assets.id, id), eq(assets.tenantId, tid))).limit(1);

    // FIX (Sheet row 12 — Classification attribute inheritance from
    // Item, with per-attribute override lock): if this update is
    // directly changing classAttributes, any attribute whose value is
    // actually different from what's currently stored gets locked
    // (classAttributeOverrides[attrName] = false) — a manual edit on the
    // asset is exactly what should stop a future Item spec change from
    // silently overwriting it. Attributes left untouched in this update
    // keep whatever lock state they already had.
    if (body.classAttributes && current) {
      const oldAttrs = (current.classAttributes ?? {}) as Record<string, unknown>;
      const oldOverrides = (current.classAttributeOverrides ?? {}) as Record<string, boolean>;
      const newOverrides = { ...oldOverrides };
      for (const [attrName, newValue] of Object.entries(body.classAttributes as Record<string, unknown>)) {
        if (JSON.stringify(oldAttrs[attrName]) !== JSON.stringify(newValue)) {
          newOverrides[attrName] = false;
        }
      }
      (body as Record<string, unknown>).classAttributeOverrides = newOverrides;
    }

    // FIX: same site/org auto-fill as POST /assets, applied on edit too.
    // If the caller is changing locationId but didn't also explicitly
    // send siteId/orgId in this same request, refresh them from the new
    // location — otherwise editing an asset's Location (the only field
    // the form actually exposes) would leave a stale or NULL site_id/
    // org_id behind, the same bug that caused "Chennai Chiller" to be
    // invisible under PRD §8.1 site-based data scoping despite its
    // Overview page displaying a Site (that display comes from a join
    // through location, not from the asset's own site_id column).
    const updateBody = { ...body };
    if (updateBody.locationId && !('siteId' in updateBody) && !('orgId' in updateBody)) {
      const [loc] = await db
        .select({ siteId: locations.siteId, orgId: locations.orgId })
        .from(locations)
        .where(and(eq(locations.id, updateBody.locationId), eq(locations.tenantId, tid)))
        .limit(1);
      if (loc) {
        updateBody.siteId = loc.siteId ?? undefined;
        updateBody.orgId = loc.orgId ?? undefined;
      }
    }

    const [row] = await db.update(assets)
      .set({ ...updateBody, updatedAt: new Date() })
      .where(and(eq(assets.id, id), eq(assets.tenantId, tid)))
      .returning();

    if (!row) return reply.code(404).send({ error: 'Asset not found' });
    await audit(db, { tenantId: tid, userId: request.user!.id, action: 'UPDATE', resource: 'Asset', resourceId: id });

    // Auto-start matching workflow on status transition
    if (body.status && current?.status && body.status !== current.status) {
      // FIX: universal status-history log — always records, regardless
      // of whether a Workflow happens to be configured for this
      // transition (the WorkflowEngine call right below only fires
      // conditionally on that). This is the "status history for all the
      // application" piece; every entity's status changes end up
      // queryable via GET /assets/:id/status-history below.
      void recordStatusHistory(db, {
        tenantId: tid,
        entityType: 'Asset',
        entityId: id,
        fromStatus: current.status,
        toStatus: body.status,
        changedByUserId: request.user!.id,
      }).catch((e: unknown) => console.warn('[status-history] Asset record failed:', e));

      const engine = new WorkflowEngine(db);
      const triggerEvent = `${current.status} → ${body.status}`;
      void engine
        .startWorkflow('Asset', id, triggerEvent, tid, {
          assetId: id,
          fromStatus: current.status,
          toStatus: body.status,
          triggeredBy: request.user!.id,
        })
        .catch((e: unknown) => console.warn('[workflow] Asset trigger failed:', e));
    }

    return row;
  });

  // FIX: "we should maintain the status history for all the
  // application" — the read side. Chronological log of every status
  // change recorded above, newest first.
  app.get('/assets/:id/status-history', readGuard, async (request) => {
    const { id } = request.params as { id: string };
    const tid = request.user!.tenantId;
    return db
      .select({
        id: statusHistory.id,
        fromStatus: statusHistory.fromStatus,
        toStatus: statusHistory.toStatus,
        changedAt: statusHistory.changedAt,
        notes: statusHistory.notes,
        changedByName: users.displayName,
      })
      .from(statusHistory)
      .leftJoin(users, eq(statusHistory.changedByUserId, users.id))
      .where(and(eq(statusHistory.entityType, 'Asset'), eq(statusHistory.entityId, id), eq(statusHistory.tenantId, tid)))
      .orderBy(desc(statusHistory.changedAt));
  });

  // Move asset to new location
  // FIX: rotating-asset behaviour. When the asset is flagged isRotating
  // (or the caller explicitly passes rotate: true), moving it to a new
  // location also rolls its siteId/orgId forward to match the new
  // location's site/org — exactly like Maximo: "the child asset locations
  // will be moved to the same location... " and more generally, a
  // rotating asset's current Site/Org is always wherever it's currently
  // installed, not a fixed home. Non-rotating assets keep the old
  // behaviour (location changes, site/org stay as they were) since they
  // are expected to stay associated with one site/org for their life.
  app.post('/assets/:id/move', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { toLocationId: string; reason?: string; rotate?: boolean };
    const tid = request.user!.tenantId;

    const [asset] = await db.select().from(assets)
      .where(and(eq(assets.id, id), eq(assets.tenantId, tid))).limit(1);
    if (!asset) return reply.code(404).send({ error: 'Asset not found' });

    // FIX (Sheet row 7 — Structural vs Normal (PBS) asset type field):
    // real Maximo — a Structural asset (building, fixed infrastructure)
    // has no Item code and can't be installed/removed; it's not a real
    // operation to "Move" one, unlike a Normal/PBS asset. Block outright
    // rather than silently running the rest of this route's logic on an
    // asset type it was never designed for.
    if (asset.assetType === 'STRUCTURAL') {
      return reply.code(409).send({
        error: 'Structural assets cannot be moved — they represent fixed infrastructure, not installable/removable equipment.',
        code: 'STRUCTURAL_ASSET_NOT_MOVABLE',
      });
    }

    const [toLocation] = await db.select({
      siteId: locations.siteId,
      orgId: locations.orgId,
      name: locations.name,
      position: locations.position,
      isCmLocation: locations.isCmLocation,
      cmItemId: locations.cmItemId,
      parentId: locations.parentId,
    })
      .from(locations)
      .where(and(eq(locations.id, body.toLocationId), eq(locations.tenantId, tid)))
      .limit(1);

    if (!toLocation) return reply.code(400).send({ error: 'Target location not found', code: 'LOCATION_NOT_FOUND' });

    // FIX (Sheet row 3 — Item-match validation on Move): real Maximo's
    // CM Location rule — a location flagged isCmLocation expects one
    // specific Item (cmItemId). Moving an asset there is blocked unless
    // the asset's own itemId matches. Two deliberate escape hatches:
    //   - target isn't a CM Location at all → no check (free-for-all,
    //     matches today's behaviour for ordinary storerooms etc.)
    //   - target is a CM Location but has no cmItemId configured, or the
    //     asset has no itemId set → nothing meaningful to compare, so the
    //     check is skipped rather than blocking every unlinked asset.
    if (toLocation.isCmLocation && toLocation.cmItemId && asset.itemId) {
      if (asset.itemId !== toLocation.cmItemId) {
        return reply.code(409).send({
          error: `This location requires a different item — the asset's item does not match this CM Location's required item.`,
          code: 'ITEM_MISMATCH',
        });
      }
    }

    // FIX (Sheet row 6 — Cross-Organisation move blocking rule): real
    // Maximo's confirmed Site/Org isolation rule — assets can move
    // between Sites within the SAME Organisation, but never across
    // Organisations. This check runs before the existing rotating-asset
    // site/org roll-forward logic below, so a rotating asset still can't
    // cross an Org boundary just because it's flagged rotating.
    //
    // FIX: the original check only fired when BOTH toLocation.orgId and
    // asset.orgId were present — an asset with org_id = NULL (created
    // without ever being installed somewhere) silently skipped the
    // check entirely and could move into any Organisation's Site. A
    // missing Org on the asset is not the same as "no restriction" — it
    // only means this is the asset's first real placement. So: if the
    // asset has never been installed anywhere (no locationId at all
    // yet), allow the move freely (first install, nothing to violate).
    // But if the asset already has a Site/Location on record and its
    // orgId is still null, that's a data gap, not a green light — block
    // and surface it clearly rather than silently letting a same-or-
    // different-Org move through unchecked.
    if (toLocation.orgId) {
      if (asset.locationId && !asset.orgId) {
        return reply.code(409).send({
          error: 'This asset is already installed somewhere but has no Organisation recorded — cannot verify the move stays within the same Organisation. Set the asset\'s Organisation first.',
          code: 'ASSET_ORG_UNKNOWN',
        });
      }
      if (asset.orgId && toLocation.orgId !== asset.orgId) {
        return reply.code(409).send({
          error: 'This move would cross Organisations — assets can only move between Sites within the same Organisation.',
          code: 'CROSS_ORG_MOVE_BLOCKED',
        });
      }
    }

    const shouldRotateSiteOrg = asset.isRotating || body.rotate === true;
    const newSiteId = shouldRotateSiteOrg ? (toLocation?.siteId ?? asset.siteId) : asset.siteId;
    const newOrgId = shouldRotateSiteOrg ? (toLocation?.orgId ?? asset.orgId) : asset.orgId;
    const siteOrgChanged = newSiteId !== asset.siteId || newOrgId !== asset.orgId;

    // FIX (Sheet row 2 — Position field): copy the target Location's
    // position onto the asset when it has one (installing into a
    // structured/CM-style slot). Deliberately do NOT clear asset.position
    // when the target location has no position of its own (e.g. moving to
    // a storeroom on uninstall) — retaining the last known position is
    // what lets the asset go back to the exact same slot later without
    // ambiguity, matching the asymmetry with parentAssetId (which DOES
    // get reset on a non-CM move — see Row 4/5 below).
    const newPosition = toLocation?.position ?? asset.position;

    // FIX (Sheet row 4 — Parent-link auto-set on install to CM Location,
    // and Sheet row 5 — Parent-link auto-reset on move to non-CM
    // location): real Maximo — installing into a CM Location auto-links
    // the asset under whatever asset already occupies that location's
    // PARENT location. Moving to an ordinary (non-CM) location — e.g.
    // uninstalling to a storeroom — does the opposite: the parent link is
    // explicitly CLEARED, since the asset is no longer part of any
    // assembly. This is the deliberate asymmetry with `position` (Row 2),
    // which is RETAINED on the same move — parentAssetId reflects "what
    // assembly am I currently part of" (nothing, once uninstalled), while
    // position reflects "what slot do I belong to" (still meaningful for
    // reinstalling later).
    let newParentAssetId: string | null = null;
    if (toLocation.isCmLocation && toLocation.parentId) {
      const [parentLocationAsset] = await db
        .select({ id: assets.id })
        .from(assets)
        .where(and(eq(assets.locationId, toLocation.parentId), eq(assets.tenantId, tid)))
        .limit(1);
      if (parentLocationAsset) {
        newParentAssetId = parentLocationAsset.id;
      }
    }

    const parentLinkChanged = newParentAssetId !== asset.parentAssetId && newParentAssetId !== id;
    const parentLinkCleared = parentLinkChanged && asset.parentAssetId !== null && newParentAssetId === null;

    await db.insert(assetMoveHistory).values({
      assetId: id,
      tenantId: tid,
      fromLocationId: asset.locationId,
      toLocationId: body.toLocationId,
      movedByUserId: request.user!.id,
      // FIX: when a rotating asset's site/org changes as part of this
      // move, say so in the reason text so the move history reads like
      // Maximo's "asset moved to a new operating location" log, not just
      // a bare location swap. Sheet row 4 adds the same kind of note when
      // the parent-link auto-set kicks in.
      reason: [
        body.reason,
        siteOrgChanged ? `(rotating asset — now in use at ${toLocation?.name ?? 'new location'}, site/org updated)` : null,
        parentLinkChanged && !parentLinkCleared ? '(parent asset auto-linked from CM Location)' : null,
        parentLinkCleared ? '(parent asset link cleared — moved to a non-CM location)' : null,
      ].filter(Boolean).join(' ') || undefined,
    });

    const [updated] = await db.update(assets)
      .set({
        locationId: body.toLocationId,
        siteId: newSiteId,
        orgId: newOrgId,
        position: newPosition,
        // FIX (Sheet row 4): never let an asset become its own parent —
        // can only happen if the asset being moved is itself the one
        // sitting at the CM Location's parent location, an edge case
        // worth guarding rather than trusting can't occur.
        parentAssetId: newParentAssetId === id ? asset.parentAssetId : newParentAssetId,
        updatedAt: new Date(),
      })
      .where(and(eq(assets.id, id), eq(assets.tenantId, tid)))
      .returning();

    await audit(db, {
      tenantId: tid,
      userId: request.user!.id,
      action: 'MOVE',
      resource: 'Asset',
      resourceId: id,
      metadata: { toLocationId: body.toLocationId, siteOrgRolledForward: siteOrgChanged },
    });

    // FIX: previously this route returned just the updated asset row,
    // with no explanation of what the parent-link/position logic
    // actually did (or didn't do) — a user moving an asset to a
    // non-CM-flagged location saw no parent change and no indication of
    // why, easy to mistake for a bug rather than expected behaviour. This
    // summary makes every outcome explicit so the frontend can show it.
    const moveSummary: string[] = [];
    if (!toLocation.isCmLocation) {
      moveSummary.push('Target location is not a CM Location — parent-link auto-set/reset rules do not apply here.');
    } else if (parentLinkChanged && !parentLinkCleared) {
      moveSummary.push('Parent asset auto-linked from the asset installed at this CM Location\'s parent location.');
    } else if (parentLinkCleared) {
      moveSummary.push('Parent asset link cleared — this location is not a CM Location.');
    } else if (toLocation.isCmLocation && !toLocation.parentId) {
      moveSummary.push('This CM Location has no parent location configured — nothing to auto-link to.');
    } else if (toLocation.isCmLocation && toLocation.parentId && !parentLinkChanged) {
      moveSummary.push('This CM Location\'s parent location has no asset installed — nothing to auto-link to yet.');
    }
    if (siteOrgChanged) {
      moveSummary.push('Site/Organisation rolled forward to match the new location (rotating asset).');
    }

    return { ...updated, moveSummary };
  });

  // Asset move history
  //
  // FIX: this used to be a plain `select()` off asset_move_history with
  // no joins at all — the table only stores fromLocationId/toLocationId
  // (raw UUIDs) and a movedByUserId, and the frontend was expecting
  // human-readable fromLocation/toLocation names plus a notes field, so
  // every row rendered as "—" for From, To, and Notes regardless of
  // what actually happened. Same fix pattern as the WO status-history
  // endpoint: join locations (twice, aliased, since one row references
  // two different locations) and users to resolve real names instead of
  // ids, and alias `reason` to the `notes` field name the frontend
  // already reads.
  app.get('/assets/:id/move-history', readGuard, async (request) => {
    const { id } = request.params as { id: string };
    const fromLoc = alias(locations, 'move_from_location');
    const toLoc = alias(locations, 'move_to_location');
    return db
      .select({
        id: assetMoveHistory.id,
        fromLocation: sql<string | null>`CASE WHEN ${fromLoc.code} IS NOT NULL AND ${fromLoc.code} <> '' THEN ${fromLoc.code} || ' - ' || ${fromLoc.name} ELSE ${fromLoc.name} END`,
        toLocation: sql<string | null>`CASE WHEN ${toLoc.code} IS NOT NULL AND ${toLoc.code} <> '' THEN ${toLoc.code} || ' - ' || ${toLoc.name} ELSE ${toLoc.name} END`,
        movedAt: assetMoveHistory.movedAt,
        notes: assetMoveHistory.reason,
        movedByName: users.displayName,
      })
      .from(assetMoveHistory)
      .leftJoin(fromLoc, eq(assetMoveHistory.fromLocationId, fromLoc.id))
      .leftJoin(toLoc, eq(assetMoveHistory.toLocationId, toLoc.id))
      .leftJoin(users, eq(assetMoveHistory.movedByUserId, users.id))
      .where(eq(assetMoveHistory.assetId, id))
      .orderBy(desc(assetMoveHistory.movedAt));
  });

  // QR code label
  app.get('/assets/:id/qrcode', readGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tid = request.user!.tenantId;

    const [asset] = await db.select({ assetNum: assets.assetNum, description: assets.description })
      .from(assets).where(and(eq(assets.id, id), eq(assets.tenantId, tid))).limit(1);
    if (!asset) return reply.code(404).send({ error: 'Asset not found' });

    const qrData = JSON.stringify({ type: 'asset', id, assetNum: asset.assetNum });
    const dataUrl = await QRCode.toDataURL(qrData, { width: 256 });
    return { assetNum: asset.assetNum, description: asset.description, qrDataUrl: dataUrl };
  });

  // ─── Asset Meters ─────────────────────────────────────────────────────────────

  app.get('/assets/:id/meters', readGuard, async (request) => {
    const { id } = request.params as { id: string };
    return db.select().from(assetMeters)
      .where(and(eq(assetMeters.assetId, id), eq(assetMeters.isActive, true)));
  });

  app.post('/assets/:id/meters', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      name: string;
      unit: string;
      meterType?: 'GAUGE' | 'CONTINUOUS' | 'CHARACTERISTIC';
      rolloverValue?: string;
      // FIX (Maximo rolldown parity): replaces the previous `rolldown`
      // boolean (which lived on the source meter) — this asset meter now
      // declares for itself whether it accepts a rolled-down reading
      // from its parent asset's meter of the same name, from its
      // location's meter of the same name, or neither.
      acceptRolldownFrom?: 'NONE' | 'PARENT_ASSET' | 'LOCATION';
    };
    const tid = request.user!.tenantId;

    try {
      const [row] = await db.insert(assetMeters).values({
        assetId: id,
        tenantId: tid,
        name: body.name,
        unit: body.unit,
        meterType: body.meterType ?? 'CONTINUOUS',
        rolloverValue: body.rolloverValue,
        acceptRolldownFrom: body.acceptRolldownFrom ?? 'NONE',
      }).returning();

      return reply.code(201).send(row);
    } catch (err: unknown) {
      // FIX: surfaces the new unique constraint as a clear 409 instead of
      // a raw Postgres error reaching the frontend — this is exactly the
      // double-submit/duplicate-meter bug found during Rolldown testing,
      // now caught at creation time instead of silently breaking the
      // cascade later.
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('asset_meters_asset_name_idx')) {
        return reply.code(409).send({
          error: `A meter named "${body.name}" already exists on this asset.`,
          code: 'DUPLICATE_METER_NAME',
        });
      }
      throw err;
    }
  });

  // FIX (Maximo rolldown parity — needed once acceptRolldownFrom moved
  // onto the receiving meter): previously there was no way to edit a
  // meter after creation at all, so the old `rolldown` boolean could only
  // ever be set once, at creation, on the source meter. Now that the
  // control lives on each meter for itself, an admin needs to be able to
  // come back and flip it (or the rollover value / active flag) later.
  app.put('/assets/:id/meters/:meterId', writeGuard, async (request, reply) => {
    const { id, meterId } = request.params as { id: string; meterId: string };
    const body = request.body as Partial<{
      unit: string;
      meterType: 'GAUGE' | 'CONTINUOUS' | 'CHARACTERISTIC';
      rolloverValue: string | null;
      acceptRolldownFrom: 'NONE' | 'PARENT_ASSET' | 'LOCATION';
      isActive: boolean;
    }>;

    const updates: Partial<typeof assetMeters.$inferInsert> = {};
    if (body.unit != null) updates.unit = body.unit;
    if (body.meterType != null) updates.meterType = body.meterType;
    if ('rolloverValue' in body) updates.rolloverValue = body.rolloverValue ?? null;
    if (body.acceptRolldownFrom != null) updates.acceptRolldownFrom = body.acceptRolldownFrom;
    if (body.isActive != null) updates.isActive = body.isActive;

    const [row] = await db.update(assetMeters).set(updates)
      .where(and(eq(assetMeters.id, meterId), eq(assetMeters.assetId, id)))
      .returning();

    if (!row) return reply.code(404).send({ error: 'Meter not found' });
    return row;
  });

  app.post('/assets/:id/meters/:meterId/readings', writeGuard, async (request, reply) => {
    const { id, meterId } = request.params as { id: string; meterId: string };
    const body = request.body as {
      value: string;
      readingDate?: string;
      notes?: string;
      // FIX (P1-1 gap — AC-P1-1.4): "CONTINUOUS meter rejects a reading
      // lower than current unless rollover flag set." Previously nothing
      // checked this at all — a mistyped or out-of-order reading on a
      // CONTINUOUS (cumulative, e.g. run-hours) meter silently overwrote
      // lastReading with a smaller number, corrupting every downstream
      // delta and any meter-triggered PM relying on monotonic growth.
      // isRollover is an explicit per-reading acknowledgement from the
      // technician that this genuinely is a rollover (e.g. an odometer
      // wrapping back to 0), not a bad entry.
      isRollover?: boolean;
    };
    const tid = request.user!.tenantId;

    const [meter] = await db.select().from(assetMeters)
      .where(and(eq(assetMeters.id, meterId), eq(assetMeters.assetId, id))).limit(1);
    if (!meter) return reply.code(404).send({ error: 'Meter not found' });

    const prev = meter.lastReading ? parseFloat(String(meter.lastReading)) : null;
    const curr = parseFloat(body.value);
    if (Number.isNaN(curr)) {
      return reply.code(400).send({ error: 'Reading value must be a number' });
    }

    if (
      meter.meterType === 'CONTINUOUS' &&
      prev !== null &&
      curr < prev &&
      !body.isRollover
    ) {
      return reply.code(400).send({
        error:
          'This reading is lower than the current reading for a CONTINUOUS meter. ' +
          'If the meter genuinely rolled over, resubmit with isRollover: true.',
        currentReading: prev,
        submittedReading: curr,
      });
    }

    // On an acknowledged rollover, the delta since the previous reading
    // is the distance the meter had left to run to its rollover point
    // plus however far it's counted since wrapping — not the (negative)
    // raw difference. Without a configured rolloverValue there's no way
    // to know that distance, so the delta is left null rather than
    // reporting a misleading negative number.
    const rolloverOccurred = meter.meterType === 'CONTINUOUS' && prev !== null && curr < prev && body.isRollover;
    const rolloverCeiling = meter.rolloverValue ? parseFloat(String(meter.rolloverValue)) : null;
    const delta =
      prev === null
        ? null
        : rolloverOccurred
        ? (rolloverCeiling !== null ? (rolloverCeiling - prev + curr).toString() : null)
        : (curr - prev).toString();

    const [reading] = await db.insert(assetMeterReadings).values({
      meterId,
      tenantId: tid,
      value: body.value,
      delta,
      readingDate: body.readingDate ? new Date(body.readingDate) : new Date(),
      loggedByUserId: request.user!.id,
      notes: body.notes,
    }).returning();

    await db.update(assetMeters).set({
      lastReading: body.value,
      lastReadingDate: reading!.readingDate,
    }).where(eq(assetMeters.id, meterId));

    // FIX (Sheet row 8 — Meter Rolldown; Maximo rolldown-direction
    // parity): propagate this reading to every direct child asset (assets
    // whose parentAssetId is this asset) that has a meter with the SAME
    // NAME *and* that child meter's own acceptRolldownFrom is set to
    // 'PARENT_ASSET' — matching real Maximo, where the receiving meter
    // (not the source) declares whether it accepts a rolldown. Only
    // direct children are rolled down to (not grandchildren) — a child
    // whose own meter of that name is also set to accept from its parent
    // would cascade further on its own next reading, same as how
    // Maximo's rolldown chains through nested assemblies one level at a
    // time rather than this single insert reaching arbitrarily deep in
    // one pass.
    {
      const childAssets = await db
        .select({ id: assets.id })
        .from(assets)
        .where(and(eq(assets.parentAssetId, id), eq(assets.tenantId, tid)));

      for (const child of childAssets) {
        const [childMeter] = await db
          .select()
          .from(assetMeters)
          .where(and(eq(assetMeters.assetId, child.id), eq(assetMeters.name, meter.name)))
          .limit(1);
        if (!childMeter || childMeter.acceptRolldownFrom !== 'PARENT_ASSET') continue;

        const childPrev = childMeter.lastReading ? parseFloat(String(childMeter.lastReading)) : null;
        const childDelta = childPrev !== null ? (curr - childPrev).toString() : null;

        await db.insert(assetMeterReadings).values({
          meterId: childMeter.id,
          tenantId: tid,
          value: body.value,
          delta: childDelta,
          readingDate: reading!.readingDate,
          loggedByUserId: request.user!.id,
          notes: '(rolled down from parent asset reading)',
        });
        await db.update(assetMeters).set({
          lastReading: body.value,
          lastReadingDate: reading!.readingDate,
        }).where(eq(assetMeters.id, childMeter.id));
      }
    }

    return reply.code(201).send(reading);
  });

  app.get('/assets/:id/meters/:meterId/readings', readGuard, async (request) => {
    const { meterId } = request.params as { id: string; meterId: string };
    return db.select().from(assetMeterReadings)
      .where(eq(assetMeterReadings.meterId, meterId))
      .orderBy(desc(assetMeterReadings.readingDate))
      .limit(100);
  });

  // ─── Asset KPIs ───────────────────────────────────────────────────────────────

  app.get('/assets/:id/kpis', readGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tid = request.user!.tenantId;

    const [asset] = await db.select().from(assets)
      .where(and(eq(assets.id, id), eq(assets.tenantId, tid))).limit(1);
    if (!asset) return reply.code(404).send({ error: 'Asset not found' });

    // All closed WOs for this asset
    const closedWOs = await db.select({
      type: workOrders.type,
      downtimeHours: workOrders.downtimeHours,
      totalCost: workOrders.totalCost,
      actualStartDate: workOrders.actualStartDate,
      actualFinishDate: workOrders.actualFinishDate,
    }).from(workOrders)
      .where(and(
        eq(workOrders.assetId, id),
        eq(workOrders.tenantId, tid),
        eq(workOrders.status, 'CLOSE'),
      ));

    const cmWOs = closedWOs.filter((w) => w.type === 'CM');
    const totalDowntimeHours = cmWOs.reduce((sum, w) => sum + parseFloat(String(w.downtimeHours ?? '0')), 0);
    const totalCost = closedWOs.reduce((sum, w) => sum + parseFloat(String(w.totalCost ?? '0')), 0);

    const toMs = (d: Date | string | null | undefined) => (d ? new Date(d).getTime() : NaN);

    // MTTR = avg repair time (hours) for CM WOs
    const repairTimes = cmWOs
      .filter((w) => w.actualStartDate && w.actualFinishDate)
      .map((w) => (toMs(w.actualFinishDate) - toMs(w.actualStartDate)) / 3600000)
      .filter((h) => Number.isFinite(h) && h >= 0);
    const mttr = repairTimes.length > 0 ? repairTimes.reduce((a, b) => a + b, 0) / repairTimes.length : null;

    // MTBF: age / failure count
    const installMs = toMs(asset.installDate);
    const ageDays = Number.isFinite(installMs)
      ? (Date.now() - installMs) / 86400000
      : null;
    const mtbf = ageDays && cmWOs.length > 0 ? (ageDays * 24) / cmWOs.length : null;

    // Availability % = 1 - (downtime / operating hours)
    const operatingHours = ageDays ? ageDays * 24 : null;
    const availability =
      operatingHours && operatingHours > 0
        ? Math.max(0, (1 - totalDowntimeHours / operatingHours) * 100)
        : null;

    return {
      assetId: id,
      assetNum: asset.assetNum,
      totalMaintenanceCost: totalCost,
      totalDowntimeHours,
      cmCount: cmWOs.length,
      mttrHours: mttr,
      mtbfHours: mtbf,
      availabilityPct: availability,
      ageDays,
    };
  });

  // ─── Asset Hierarchy: Children (Subassemblies) ───────────────────────────────
  // Maximo calls these "Subassemblies" on the Spare Parts tab — the immediate
  // child assets of the current asset. The Components/Subassemblies view
  // shows only the immediate children, not grandchildren, matching Maximo's
  // behaviour (drill into a child to see ITS children).
  app.get('/assets/:id/children', readGuard, async (request) => {
    const { id } = request.params as { id: string };
    const tid = request.user!.tenantId;
    return db
      .select({
        id: assets.id,
        assetNum: assets.assetNum,
        description: assets.description,
        status: assets.status,
        criticality: assets.criticality,
      })
      .from(assets)
      .where(and(eq(assets.parentAssetId, id), eq(assets.tenantId, tid)))
      .orderBy(assetNumAsc);
  });

  // ─── Asset Spares (BOM) ─────────────────────────────────────────────────────
  // FIX (P1-1 gap): PRD data model calls for a per-asset spare-parts list
  // ("asset_spares ... BOM / spare-parts list; links to P1-7 items"),
  // separate from item_assembly_structure below (which templates how one
  // Item is built from other Items, not which Items are the recommended
  // spares for a specific installed Asset). Feeds the Asset detail page's
  // Spares/BOM tab and lets Work Order material planning look up an
  // asset's recommended spares without going through a Job Plan.

  app.get('/assets/:id/spares', readGuard, async (request) => {
    const { id } = request.params as { id: string };
    const tid = request.user!.tenantId;
    return db
      .select({
        id: assetSpares.id,
        assetId: assetSpares.assetId,
        itemId: assetSpares.itemId,
        quantity: assetSpares.quantity,
        notes: assetSpares.notes,
        createdAt: assetSpares.createdAt,
        itemNum: items.itemNum,
        itemDescription: items.description,
        unitOfIssue: items.unitOfIssue,
      })
      .from(assetSpares)
      .innerJoin(items, eq(items.id, assetSpares.itemId))
      .where(and(eq(assetSpares.assetId, id), eq(assetSpares.tenantId, tid)))
      .orderBy(items.itemNum);
  });

  app.post('/assets/:id/spares', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { itemId: string; quantity?: number; notes?: string };
    const tid = request.user!.tenantId;

    if (!body.itemId) {
      return reply.status(422).send({ error: 'itemId is required' });
    }

    const [item] = await db.select({ id: items.id }).from(items)
      .where(and(eq(items.id, body.itemId), eq(items.tenantId, tid))).limit(1);
    if (!item) return reply.status(422).send({ error: 'Item not found' });

    // Adding an already-listed spare updates its quantity instead of
    // creating a duplicate row (matches the unique (assetId, itemId)
    // index on the table).
    const [existing] = await db.select().from(assetSpares)
      .where(and(eq(assetSpares.assetId, id), eq(assetSpares.itemId, body.itemId))).limit(1);

    if (existing) {
      const [row] = await db
        .update(assetSpares)
        .set({ quantity: body.quantity ?? existing.quantity, notes: body.notes ?? existing.notes })
        .where(eq(assetSpares.id, existing.id))
        .returning();
      return row;
    }

    const [row] = await db
      .insert(assetSpares)
      .values({
        tenantId: tid,
        assetId: id,
        itemId: body.itemId,
        quantity: body.quantity ?? 1,
        notes: body.notes,
        createdByUserId: request.user!.id,
      })
      .returning();

    return reply.code(201).send(row);
  });

  app.put('/assets/:id/spares/:spareId', writeGuard, async (request, reply) => {
    const { id, spareId } = request.params as { id: string; spareId: string };
    const body = request.body as { quantity?: number; notes?: string };
    const tid = request.user!.tenantId;

    const [row] = await db
      .update(assetSpares)
      .set({ ...body })
      .where(and(eq(assetSpares.id, spareId), eq(assetSpares.assetId, id), eq(assetSpares.tenantId, tid)))
      .returning();
    if (!row) return reply.code(404).send({ error: 'Spare not found' });
    return row;
  });

  app.delete('/assets/:id/spares/:spareId', writeGuard, async (request, reply) => {
    const { id, spareId } = request.params as { id: string; spareId: string };
    const tid = request.user!.tenantId;

    const [row] = await db
      .delete(assetSpares)
      .where(and(eq(assetSpares.id, spareId), eq(assetSpares.assetId, id), eq(assetSpares.tenantId, tid)))
      .returning();
    if (!row) return reply.code(404).send({ error: 'Spare not found' });
    return reply.code(204).send();
  });

  // ─── Item Assembly Structure (Sheet row 10) ─────────────────────────────────
  // Defines, once per parent Item, the template of child Items/positions
  // a complex asset should be built from — see itemAssemblyStructure in
  // entities.ts for the full rationale.

  app.get('/items/:itemId/assembly-structure', readGuard, async (request) => {
    const { itemId } = request.params as { itemId: string };
    const tid = request.user!.tenantId;
    return db
      .select({
        id: itemAssemblyStructure.id,
        childItemId: itemAssemblyStructure.childItemId,
        childItemNum: items.itemNum,
        childItemDescription: items.description,
        position: itemAssemblyStructure.position,
        quantity: itemAssemblyStructure.quantity,
        notes: itemAssemblyStructure.notes,
      })
      .from(itemAssemblyStructure)
      .innerJoin(items, eq(itemAssemblyStructure.childItemId, items.id))
      .where(and(eq(itemAssemblyStructure.parentItemId, itemId), eq(itemAssemblyStructure.tenantId, tid)))
      .orderBy(itemAssemblyStructure.position);
  });

  app.post('/items/:itemId/assembly-structure', writeGuard, async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const body = request.body as { childItemId: string; position: string; quantity?: number; notes?: string };
    const tid = request.user!.tenantId;

    const [row] = await db.insert(itemAssemblyStructure).values({
      tenantId: tid,
      parentItemId: itemId,
      childItemId: body.childItemId,
      position: body.position,
      quantity: body.quantity ?? 1,
      notes: body.notes,
    }).returning();

    return reply.code(201).send(row);
  });

  app.delete('/items/:itemId/assembly-structure/:rowId', writeGuard, async (request, reply) => {
    const { rowId } = request.params as { itemId: string; rowId: string };
    const tid = request.user!.tenantId;
    await db.delete(itemAssemblyStructure)
      .where(and(eq(itemAssemblyStructure.id, rowId), eq(itemAssemblyStructure.tenantId, tid)));
    return reply.code(204).send();
  });

  // FIX (Sheet row 10): "create assembly from template" — given a parent
  // Item that has an IAS defined, creates the parent asset (assetNum/
  // description/locationId supplied by the caller) plus one child asset
  // per IAS row, each pre-filled with its template position and parented
  // to the new parent asset — replacing the manual one-by-one child
  // creation Maximo's IAS feature exists specifically to avoid.
  app.post('/assets/create-from-assembly', writeGuard, async (request, reply) => {
    const body = request.body as {
      parentItemId: string;
      assetNum?: string;
      description: string;
      locationId?: string;
      siteId?: string;
      orgId?: string;
    };
    const tid = request.user!.tenantId;

    if (!body.description || !body.description.trim()) {
      return reply.status(422).send({ error: 'Description is required.' });
    }

    let assetNum = await nextAssetNumForTenant(tid);
    let nextSeq = Number(assetNum) + 1;

    let siteId = body.siteId;
    let orgId = body.orgId;
    if (body.locationId && (!siteId || !orgId)) {
      const [loc] = await db.select({ siteId: locations.siteId, orgId: locations.orgId })
        .from(locations)
        .where(and(eq(locations.id, body.locationId), eq(locations.tenantId, tid)))
        .limit(1);
      if (loc) {
        siteId = siteId ?? loc.siteId ?? undefined;
        orgId = orgId ?? loc.orgId ?? undefined;
      }
    }

    const [parentAsset] = await db.insert(assets).values({
      tenantId: tid,
      assetNum,
      description: body.description,
      locationId: body.locationId,
      siteId,
      orgId,
      itemId: body.parentItemId,
    }).returning();

    const iasRows = await db
      .select()
      .from(itemAssemblyStructure)
      .where(and(eq(itemAssemblyStructure.parentItemId, body.parentItemId), eq(itemAssemblyStructure.tenantId, tid)));

    const childAssets = [];
    for (const iasRow of iasRows) {
      const [childItem] = await db.select({ description: items.description })
        .from(items).where(eq(items.id, iasRow.childItemId)).limit(1);

      const [child] = await db.insert(assets).values({
        tenantId: tid,
        assetNum: String(nextSeq),
        description: childItem?.description ?? 'Component',
        locationId: body.locationId,
        siteId,
        orgId,
        itemId: iasRow.childItemId,
        parentAssetId: parentAsset!.id,
        position: iasRow.position,
      }).returning();
      childAssets.push(child);
      nextSeq += 1;
    }

    await audit(db, { tenantId: tid, userId: request.user!.id, action: 'CREATE', resource: 'Asset', resourceId: parentAsset!.id });

    return reply.code(201).send({ parentAsset, childAssets });
  });

  // ─── Asset Downtime (Sheet row 11) ──────────────────────────────────────────

  app.get('/assets/:id/downtime', readGuard, async (request) => {
    const { id } = request.params as { id: string };
    return db.select().from(assetDowntimeLogs)
      .where(eq(assetDowntimeLogs.assetId, id))
      .orderBy(desc(assetDowntimeLogs.startTime));
  });

  app.post('/assets/:id/downtime', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { startTime: string; endTime?: string; reasonCode?: string; notes?: string; workOrderId?: string };
    const tid = request.user!.tenantId;

    const [row] = await db.insert(assetDowntimeLogs).values({
      assetId: id,
      tenantId: tid,
      startTime: new Date(body.startTime),
      endTime: body.endTime ? new Date(body.endTime) : undefined,
      reasonCode: body.reasonCode,
      notes: body.notes,
      workOrderId: body.workOrderId,
      loggedByUserId: request.user!.id,
    }).returning();

    return reply.code(201).send(row);
  });

  app.put('/assets/:id/downtime/:downtimeId', writeGuard, async (request, reply) => {
    const { downtimeId } = request.params as { id: string; downtimeId: string };
    const body = request.body as { endTime?: string; reasonCode?: string; notes?: string };
    const tid = request.user!.tenantId;

    const [row] = await db.update(assetDowntimeLogs)
      .set({
        ...(body.endTime !== undefined && { endTime: new Date(body.endTime) }),
        ...(body.reasonCode !== undefined && { reasonCode: body.reasonCode }),
        ...(body.notes !== undefined && { notes: body.notes }),
      })
      .where(and(eq(assetDowntimeLogs.id, downtimeId), eq(assetDowntimeLogs.tenantId, tid)))
      .returning();

    if (!row) return reply.code(404).send({ error: 'Downtime record not found' });
    return row;
  });

  // FIX (Sheet row 11): feeds the PRD's Asset Availability % KPI —
  // availability = (total_time - downtime) / total_time over the given
  // window. Previously this KPI had no defined data source; this is it.
  app.get('/assets/:id/availability', readGuard, async (request) => {
    const { id } = request.params as { id: string };
    const { from, to } = request.query as { from?: string; to?: string };
    const tid = request.user!.tenantId;

    const logs = await db.select().from(assetDowntimeLogs)
      .where(and(eq(assetDowntimeLogs.assetId, id), eq(assetDowntimeLogs.tenantId, tid)));

    const now = new Date();
    const windowStart = from ? new Date(from) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    // FIX: previously windowEnd was hard-pinned to "now" — a downtime
    // entry logged with a future or just-past startTime/endTime (e.g.
    // planned maintenance scheduled for tomorrow, or a window edge case
    // around midnight) fell entirely outside [windowStart, now] and got
    // silently dropped from the calculation, showing 100% availability
    // even with real downtime on record. Extending windowEnd to cover
    // the latest logged endTime (when no explicit `to` was requested)
    // means a logged period is never invisible just because of when
    // "now" happens to be relative to it.
    let windowEnd = to ? new Date(to) : now;
    if (!to) {
      for (const log of logs) {
        const logEnd = log.endTime ?? now;
        if (logEnd.getTime() > windowEnd.getTime()) windowEnd = logEnd;
      }
    }
    const totalMs = windowEnd.getTime() - windowStart.getTime();

    let downtimeMs = 0;
    for (const log of logs) {
      const start = Math.max(log.startTime.getTime(), windowStart.getTime());
      const end = Math.min((log.endTime ?? windowEnd).getTime(), windowEnd.getTime());
      if (end > start) downtimeMs += end - start;
    }

    const availabilityPct = totalMs > 0 ? Math.max(0, Math.min(100, ((totalMs - downtimeMs) / totalMs) * 100)) : 100;

    return { windowStart, windowEnd, totalMs, downtimeMs, availabilityPct };
  });

  // ─── Classification attribute inheritance (Sheet row 12) ───────────────────
  // FIX: when an asset's itemId changes (or on demand via this endpoint),
  // pull the linked Item's classification attributes into the asset's
  // classAttributes — but only for attributes not locked via
  // classAttributeOverrides[attrName] = false. Editing a classAttribute
  // value directly through PUT /assets/:id (see below) is what sets that
  // lock; this endpoint is the "(re)sync from Item" action mirroring
  // Maximo's inheritance refresh.
  app.post('/assets/:id/sync-classification-from-item', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tid = request.user!.tenantId;

    const [asset] = await db.select().from(assets)
      .where(and(eq(assets.id, id), eq(assets.tenantId, tid))).limit(1);
    if (!asset) return reply.code(404).send({ error: 'Asset not found' });
    if (!asset.itemId) return reply.code(400).send({ error: 'This asset has no linked Item to sync from.' });

    const [item] = await db.select({ customData: items.customData })
      .from(items).where(eq(items.id, asset.itemId)).limit(1);
    if (!item) return reply.code(404).send({ error: 'Linked Item not found' });

    const itemSpecs = (item.customData ?? {}) as Record<string, unknown>;
    const overrides = (asset.classAttributeOverrides ?? {}) as Record<string, boolean>;
    const currentAttrs = (asset.classAttributes ?? {}) as Record<string, unknown>;

    const mergedAttrs: Record<string, unknown> = { ...currentAttrs };
    for (const [attrName, specValue] of Object.entries(itemSpecs)) {
      // overrides[attrName] === false means explicitly locked/overridden
      // on this asset — leave it untouched. Anything else (true, or not
      // present at all) means "still inheriting" — pull the Item's value.
      if (overrides[attrName] === false) continue;
      mergedAttrs[attrName] = specValue;
    }

    const [updated] = await db.update(assets)
      .set({ classAttributes: mergedAttrs, updatedAt: new Date() })
      .where(and(eq(assets.id, id), eq(assets.tenantId, tid)))
      .returning();

    return reply.send(updated);
  });
}