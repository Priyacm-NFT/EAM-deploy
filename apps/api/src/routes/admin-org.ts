import type { FastifyInstance } from 'fastify';
import { eq, and, sql, desc } from 'drizzle-orm';
import {
  db,
  organisations,
  organisationAddresses,
  sites,
  statusSets,
  statusTransitions,
  entityScopeRegistry,
  locations,
  assets,
} from '@eam/db';
import { AUTO_RECORD_CODE_START } from '@eam/shared';
import { requirePermission } from '../plugins/auth.js';

const guard = { preHandler: requirePermission('admin:config:manage') };

// FIX: Org/Site code field rule, per the codification note ("Alpha
// numeric - UPPER case - 30 char can be ext[end]"). Same rule as the
// frontend's sanitizeCode in OrgStructure.tsx — duplicated here as a
// server-side guard so a direct API call (bypassing the form) can't save
// a code that doesn't match the convention. Strips non-alphanumeric
// characters, force-uppercases, truncates to 30.
function sanitizeCode(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 30);
}

// FIX (Org/Site numeric code parity with Assets/Locations/Items/
// Storerooms — see nextAssetNumForTenant in assets.ts for the identical
// pattern): the Organisation "code" and Site "site_num" are no longer
// admin-typed — they're auto-allocated on create, numeric, starting at
// 10000, and never editable afterward. Uses max(existing)+1 rather than a
// simple count so a soft-deleted (deactivated, not deleted) row never
// causes a collision.
async function nextOrgCodeForTenant(tid: string): Promise<string> {
  const [{ maxVal }] = await db
    .select({
      maxVal: sql<string | null>`max(
        CASE WHEN ${organisations.code} ~ '^[0-9]+$' THEN ${organisations.code}::bigint ELSE NULL END
      )`,
    })
    .from(organisations)
    .where(eq(organisations.tenantId, tid));
  let candidate = maxVal != null ? Number(maxVal) + 1 : AUTO_RECORD_CODE_START;
  for (;;) {
    const num = String(candidate);
    const [dup] = await db
      .select({ id: organisations.id })
      .from(organisations)
      .where(and(eq(organisations.tenantId, tid), eq(organisations.code, num)))
      .limit(1);
    if (!dup) return num;
    candidate += 1;
  }
}

// FIX: same as above, scoped tenant-wide (a superset of the existing
// per-Org sites_org_sitenum_idx uniqueness constraint, so a tenant-wide
// sequence is always safe).
async function nextSiteNumForTenant(tid: string): Promise<string> {
  const [{ maxVal }] = await db
    .select({
      maxVal: sql<string | null>`max(
        CASE WHEN ${sites.siteNum} ~ '^[0-9]+$' THEN ${sites.siteNum}::bigint ELSE NULL END
      )`,
    })
    .from(sites)
    .where(eq(sites.tenantId, tid));
  let candidate = maxVal != null ? Number(maxVal) + 1 : AUTO_RECORD_CODE_START;
  for (;;) {
    const num = String(candidate);
    const [dup] = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(eq(sites.tenantId, tid), eq(sites.siteNum, num)))
      .limit(1);
    if (!dup) return num;
    candidate += 1;
  }
}

export async function adminOrgRoutes(app: FastifyInstance) {
  // ─── Organisations ───────────────────────────────────────────────────────────

  app.get('/admin/org/organisations', guard, async (request) => {
    return db
      .select()
      .from(organisations)
      .where(eq(organisations.tenantId, request.user!.tenantId))
      // FIX: list newest-created first (descending), rather than
      // alphabetically by the Name field that no longer exists in the UI.
      .orderBy(desc(organisations.createdAt));
  });

  app.post('/admin/org/organisations', guard, async (request, reply) => {
    const body = request.body as {
      description?: string;
      baseCurrency?: string;
      baseCurrency2?: string;
      defaultItemStatus?: string;
      defaultStockCategory?: string;
      isActive?: boolean;
      addressLine1?: string;
      addressLine2?: string;
      city?: string;
      stateProvince?: string;
      postalCode?: string;
      country?: string;
      language?: string;
      itemSetCode?: string;
      companySetCode?: string;
    };

    // FIX: "Organisation" is now an auto-allocated numeric code (10000,
    // 10001, …), never admin-typed — see nextOrgCodeForTenant above. The
    // Name field is gone from this UI entirely; `name` (still NOT NULL,
    // still read by a couple of other screens — e.g. the Default
    // Organisation picker) is populated from Description, falling back to
    // the code itself when no Description was given, so nothing downstream
    // breaks.
    const code = await nextOrgCodeForTenant(request.user!.tenantId);

    const [row] = await db
      .insert(organisations)
      .values({
        tenantId: request.user!.tenantId,
        name: body.description?.trim() || `Organisation ${code}`,
        code,
        description: body.description,
        addressLine1: body.addressLine1,
        addressLine2: body.addressLine2,
        city: body.city,
        stateProvince: body.stateProvince,
        postalCode: body.postalCode,
        country: body.country,
        baseCurrency: body.baseCurrency?.trim()?.toUpperCase(),
        baseCurrency2: body.baseCurrency2?.trim()?.toUpperCase(),
        defaultItemStatus: body.defaultItemStatus ? sanitizeCode(body.defaultItemStatus) : undefined,
        defaultStockCategory: body.defaultStockCategory ? sanitizeCode(body.defaultStockCategory) : undefined,
        isActive: body.isActive ?? true,
        language: body.language?.trim() || 'en',
        itemSetCode: body.itemSetCode ? sanitizeCode(body.itemSetCode) : undefined,
        companySetCode: body.companySetCode ? sanitizeCode(body.companySetCode) : undefined,
        createdByUserId: request.user!.id,
      })
      .returning();

    return reply.code(201).send(row);
  });

  app.put('/admin/org/organisations/:id', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      description?: string;
      addressLine1?: string;
      addressLine2?: string;
      city?: string;
      stateProvince?: string;
      postalCode?: string;
      country?: string;
      isActive?: boolean;
      baseCurrency?: string;
      baseCurrency2?: string;
      defaultItemStatus?: string;
      defaultStockCategory?: string;
      language?: string;
      itemSetCode?: string;
      companySetCode?: string;
      glAccount?: string;
      costCenter?: string;
    };

    // FIX: "Organisation" (code) is auto-allocated once at creation and
    // never editable afterward — no code/name field accepted here anymore.
    // Description still updates `name` too, so the couple of other screens
    // that read Organisation.name (e.g. the Default Organisation picker)
    // keep showing something meaningful.
    const updates: Partial<typeof organisations.$inferInsert> = {};
    if (body.description != null) {
      updates.description = body.description;
      if (body.description.trim()) updates.name = body.description.trim();
    }
    if (body.addressLine1 != null) updates.addressLine1 = body.addressLine1;
    if (body.addressLine2 != null) updates.addressLine2 = body.addressLine2;
    if (body.city != null) updates.city = body.city;
    if (body.stateProvince != null) updates.stateProvince = body.stateProvince;
    if (body.postalCode != null) updates.postalCode = body.postalCode;
    if (body.country != null) updates.country = body.country;
    if (body.isActive != null) updates.isActive = body.isActive;
    if (body.baseCurrency != null) updates.baseCurrency = body.baseCurrency.trim().toUpperCase();
    if (body.baseCurrency2 != null) updates.baseCurrency2 = body.baseCurrency2.trim().toUpperCase();
    if (body.defaultItemStatus != null) updates.defaultItemStatus = sanitizeCode(body.defaultItemStatus);
    if (body.defaultStockCategory != null) updates.defaultStockCategory = sanitizeCode(body.defaultStockCategory);
    if (body.language != null) updates.language = body.language.trim();
    if (body.itemSetCode != null) updates.itemSetCode = sanitizeCode(body.itemSetCode);
    if (body.companySetCode != null) updates.companySetCode = sanitizeCode(body.companySetCode);
    // FIX: explicit hasOwnProperty checks instead of `!= null` — the
    // earlier version's checks were logically fine on paper, but using
    // 'in' here removes any ambiguity around undefined-vs-missing-key and
    // makes the propagation trigger condition (below) share the exact
    // same truth test as this assignment, so the two can never disagree.
    const glAccountProvided = 'glAccount' in body && body.glAccount !== undefined;
    const costCenterProvided = 'costCenter' in body && body.costCenter !== undefined;
    if (glAccountProvided) updates.glAccount = body.glAccount as string;
    if (costCenterProvided) updates.costCenter = body.costCenter as string;
    updates.updatedAt = new Date();

    const [row] = await db
      .update(organisations)
      .set(updates)
      .where(
        and(
          eq(organisations.id, id),
          eq(organisations.tenantId, request.user!.tenantId),
        ),
      )
      .returning();

    if (!row) return reply.code(404).send({ error: 'Organisation not found' });

    // FIX (Org/Site gap #5): "each Site inherits Chart of Accounts...
    // from the Organization level" — propagate a glAccount/costCenter
    // change down to every Site under this Org that's still set to
    // inherit (inheritGlAccount/inheritCostCenter = true). Sites that
    // explicitly overrode the field are left untouched. Uses the exact
    // same glAccountProvided/costCenterProvided flags computed above —
    // guarantees this only runs when the Organization tab's Save
    // actually changed the field, never on Address-tab-only saves (which
    // send a body with no glAccount key at all).
    if (glAccountProvided) {
      await db
        .update(sites)
        .set({ glAccount: row.glAccount, updatedAt: new Date() })
        .where(and(eq(sites.orgId, id), eq(sites.tenantId, request.user!.tenantId), eq(sites.inheritGlAccount, true)));
    }
    if (costCenterProvided) {
      await db
        .update(sites)
        .set({ costCenter: row.costCenter, updatedAt: new Date() })
        .where(and(eq(sites.orgId, id), eq(sites.tenantId, request.user!.tenantId), eq(sites.inheritCostCenter, true)));
    }

    return row;
  });

  app.delete('/admin/org/organisations/:id', guard, async (request, reply) => {
    const { id } = request.params as { id: string };

    // Check for dependent sites
    const [depSite] = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(eq(sites.orgId, id), eq(sites.tenantId, request.user!.tenantId)))
      .limit(1);

    if (depSite) {
      return reply.code(409).send({ error: 'Cannot delete organisation with active sites' });
    }

    // FIX (Org/Site gap #12): real Maximo — "once an Organization or Site
    // is created, it remains in Active or Inactive status... permanently
    // removing them from the database cannot be done from the user
    // interface." Soft-delete (isActive = false) instead of a hard DELETE,
    // so historical data referencing this Org (audit logs, closed Work
    // Orders, etc.) never points at a row that no longer exists.
    const [row] = await db
      .update(organisations)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(
          eq(organisations.id, id),
          eq(organisations.tenantId, request.user!.tenantId),
        ),
      )
      .returning();

    if (!row) return reply.code(404).send({ error: 'Organisation not found' });
    return reply.code(200).send(row);
  });

  // ─── Organisation Addresses (multi-address support) ────────────────────
  // FIX: an Organisation can have multiple addresses, each with its own
  // Address Code — see organisationAddresses in
  // packages/db/src/schema/entities.ts for the table definition.

  app.get('/admin/org/organisations/:id/addresses', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [org] = await db
      .select({ id: organisations.id })
      .from(organisations)
      .where(and(eq(organisations.id, id), eq(organisations.tenantId, request.user!.tenantId)))
      .limit(1);
    if (!org) return reply.code(404).send({ error: 'Organisation not found' });

    return db
      .select()
      .from(organisationAddresses)
      .where(and(eq(organisationAddresses.orgId, id), eq(organisationAddresses.tenantId, request.user!.tenantId)))
      .orderBy(organisationAddresses.addressCode);
  });

  app.post('/admin/org/organisations/:id/addresses', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      addressCode: string;
      addressLine1?: string;
      addressLine2?: string;
      city?: string;
      stateProvince?: string;
      postalCode?: string;
      country?: string;
    };

    const [org] = await db
      .select({ id: organisations.id })
      .from(organisations)
      .where(and(eq(organisations.id, id), eq(organisations.tenantId, request.user!.tenantId)))
      .limit(1);
    if (!org) return reply.code(404).send({ error: 'Organisation not found' });

    if (!body.addressCode || !sanitizeCode(body.addressCode)) {
      return reply.code(400).send({ error: 'Address Code is required', code: 'ADDRESS_CODE_REQUIRED' });
    }

    try {
      const [row] = await db
        .insert(organisationAddresses)
        .values({
          tenantId: request.user!.tenantId,
          orgId: id,
          addressCode: sanitizeCode(body.addressCode),
          addressLine1: body.addressLine1,
          addressLine2: body.addressLine2,
          city: body.city,
          stateProvince: body.stateProvince,
          postalCode: body.postalCode,
          country: body.country,
          createdByUserId: request.user!.id,
        })
        .returning();

      return reply.code(201).send(row);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('org_addresses_org_code_idx')) {
        return reply.code(409).send({
          error: `Address Code "${sanitizeCode(body.addressCode)}" already exists under this Organisation`,
          code: 'DUPLICATE_ADDRESS_CODE',
        });
      }
      throw err;
    }
  });

  app.put('/admin/org/organisations/:id/addresses/:addressId', guard, async (request, reply) => {
    const { id, addressId } = request.params as { id: string; addressId: string };
    const body = request.body as {
      addressCode?: string;
      addressLine1?: string;
      addressLine2?: string;
      city?: string;
      stateProvince?: string;
      postalCode?: string;
      country?: string;
      isActive?: boolean;
    };

    const updates: Partial<typeof organisationAddresses.$inferInsert> = {};
    if (body.addressCode != null) updates.addressCode = sanitizeCode(body.addressCode);
    if (body.addressLine1 != null) updates.addressLine1 = body.addressLine1;
    if (body.addressLine2 != null) updates.addressLine2 = body.addressLine2;
    if (body.city != null) updates.city = body.city;
    if (body.stateProvince != null) updates.stateProvince = body.stateProvince;
    if (body.postalCode != null) updates.postalCode = body.postalCode;
    if (body.country != null) updates.country = body.country;
    if (body.isActive != null) updates.isActive = body.isActive;
    updates.updatedAt = new Date();

    try {
      const [row] = await db
        .update(organisationAddresses)
        .set(updates)
        .where(
          and(
            eq(organisationAddresses.id, addressId),
            eq(organisationAddresses.orgId, id),
            eq(organisationAddresses.tenantId, request.user!.tenantId),
          ),
        )
        .returning();

      if (!row) return reply.code(404).send({ error: 'Address not found' });
      return row;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('org_addresses_org_code_idx')) {
        return reply.code(409).send({
          error: 'Address Code already exists under this Organisation',
          code: 'DUPLICATE_ADDRESS_CODE',
        });
      }
      throw err;
    }
  });

  app.delete('/admin/org/organisations/:id/addresses/:addressId', guard, async (request, reply) => {
    const { id, addressId } = request.params as { id: string; addressId: string };

    const [row] = await db
      .delete(organisationAddresses)
      .where(
        and(
          eq(organisationAddresses.id, addressId),
          eq(organisationAddresses.orgId, id),
          eq(organisationAddresses.tenantId, request.user!.tenantId),
        ),
      )
      .returning();

    if (!row) return reply.code(404).send({ error: 'Address not found' });
    return reply.code(200).send(row);
  });

  // ─── Sites ────────────────────────────────────────────────────────────────────

  app.get('/admin/org/sites', guard, async (request) => {
    return db
      .select()
      .from(sites)
      .where(eq(sites.tenantId, request.user!.tenantId))
      // FIX: newest-created first, same as the Organisations list.
      .orderBy(desc(sites.createdAt));
  });

  // FIX (Maximo "Sites" tab): real Maximo shows a Site's list nested
  // *inside* the Organization's own detail page (a "Sites" tab on the Org
  // record itself), not as a separate top-level list cross-cut by every
  // Org at once. This is that nested view — same data as the route above,
  // pre-filtered to one Org — for a future Org-detail page to call instead
  // of filtering the full list client-side.
  app.get('/admin/org/organisations/:id/sites', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [org] = await db
      .select({ id: organisations.id })
      .from(organisations)
      .where(and(eq(organisations.id, id), eq(organisations.tenantId, request.user!.tenantId)))
      .limit(1);
    if (!org) return reply.code(404).send({ error: 'Organisation not found' });

    return db
      .select()
      .from(sites)
      .where(and(eq(sites.orgId, id), eq(sites.tenantId, request.user!.tenantId)))
      .orderBy(desc(sites.createdAt));
  });

  // FIX: manual force-resync — pulls every inheriting Site's
  // glAccount/costCenter back in line with its parent Org right now,
  // regardless of how they drifted out of sync. A safety net independent
  // of the PUT-time propagation above; call this any time you want a hard
  // guarantee rather than trusting the propagation already ran correctly.
  app.post('/admin/org/organisations/:id/resync-sites', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [org] = await db
      .select()
      .from(organisations)
      .where(and(eq(organisations.id, id), eq(organisations.tenantId, request.user!.tenantId)))
      .limit(1);
    if (!org) return reply.code(404).send({ error: 'Organisation not found' });

    const updatedGl = await db
      .update(sites)
      .set({ glAccount: org.glAccount, updatedAt: new Date() })
      .where(and(eq(sites.orgId, id), eq(sites.tenantId, request.user!.tenantId), eq(sites.inheritGlAccount, true)))
      .returning({ id: sites.id });

    const updatedCc = await db
      .update(sites)
      .set({ costCenter: org.costCenter, updatedAt: new Date() })
      .where(and(eq(sites.orgId, id), eq(sites.tenantId, request.user!.tenantId), eq(sites.inheritCostCenter, true)))
      .returning({ id: sites.id });

    return reply.send({
      glAccountResynced: updatedGl.length,
      costCenterResynced: updatedCc.length,
    });
  });

  app.post('/admin/org/sites', guard, async (request, reply) => {
    const body = request.body as {
      orgId: string;
      description?: string;
      addressLine1?: string;
      addressLine2?: string;
      city?: string;
      stateProvince?: string;
      postalCode?: string;
      country?: string;
      timezone?: string;
      glAccount?: string;
      costCenter?: string;
      inheritGlAccount?: boolean;
      inheritCostCenter?: boolean;
    };

    // FIX (Org/Site gap #4): real Maximo — "a Site can only belong to one
    // Organization... there can be multiple Sites under a particular
    // Organization." A Site with no Org is the orphaned state the
    // hierarchy model never allows, so orgId is mandatory here, not
    // optional as it previously was.
    if (!body.orgId) {
      return reply.code(400).send({ error: 'orgId is required — a Site must belong to exactly one Organisation', code: 'ORG_ID_REQUIRED' });
    }

    const [org] = await db
      .select()
      .from(organisations)
      .where(and(eq(organisations.id, body.orgId), eq(organisations.tenantId, request.user!.tenantId)))
      .limit(1);
    if (!org) {
      return reply.code(400).send({ error: 'Organisation not found for this tenant', code: 'ORG_NOT_FOUND' });
    }

    const inheritGl = body.inheritGlAccount ?? true;
    const inheritCc = body.inheritCostCenter ?? true;

    // FIX: "Site" is now an auto-allocated numeric code (10000, 10001, …),
    // never admin-typed — see nextSiteNumForTenant above. The Name field is
    // gone from this UI entirely; `name` (still NOT NULL, still read by a
    // couple of other screens) is populated from Description, falling back
    // to the code itself when no Description was given.
    const siteNum = await nextSiteNumForTenant(request.user!.tenantId);

    try {
      const [row] = await db
        .insert(sites)
        .values({
          tenantId: request.user!.tenantId,
          name: body.description?.trim() || `Site ${siteNum}`,
          siteNum,
          orgId: body.orgId,
          description: body.description,
          addressLine1: body.addressLine1,
          addressLine2: body.addressLine2,
          city: body.city,
          stateProvince: body.stateProvince,
          postalCode: body.postalCode,
          country: body.country,
          timezone: body.timezone ?? 'UTC',
          // FIX (Org/Site gap #5): inheritance — when inheriting, the Site's
          // glAccount/costCenter mirror the parent Org's value at creation
          // time; an explicit override (inherit = false) uses whatever the
          // caller passed instead. Re-resolved again whenever the parent Org
          // changes — see the org-update propagation route below.
          glAccount: inheritGl ? org.glAccount : (body.glAccount ?? null),
          costCenter: inheritCc ? org.costCenter : (body.costCenter ?? null),
          inheritGlAccount: inheritGl,
          inheritCostCenter: inheritCc,
          createdByUserId: request.user!.id,
        })
        .returning();

      return reply.code(201).send(row);
    } catch (err: unknown) {
      // FIX (Org/Site gap #10): Postgres unique-constraint violation on
      // (org_id, site_num) surfaces as a generic driver error by default —
      // translate it into the same clear, structured 409 the rest of this
      // file uses, instead of leaking a raw DB error to the frontend.
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('sites_org_sitenum_idx')) {
        return reply.code(409).send({
          error: `Site "${siteNum}" already exists under this Organisation`,
          code: 'DUPLICATE_SITE_NUM',
        });
      }
      throw err;
    }
  });

  app.put('/admin/org/sites/:id', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      orgId?: string | null;
      description?: string;
      addressLine1?: string;
      addressLine2?: string;
      city?: string;
      stateProvince?: string;
      postalCode?: string;
      country?: string;
      timezone?: string;
      isActive?: boolean;
      glAccount?: string;
      costCenter?: string;
      inheritGlAccount?: boolean;
      inheritCostCenter?: boolean;
    };

    // FIX (Org/Site gap #4): a Site can never be orphaned — block any
    // attempt to clear orgId to null, even on update. Changing the Org a
    // Site belongs to is a real operation (cross-Org Site reassignment)
    // but that's a deliberate decision with its own consequences for every
    // Asset/Location under that Site — not something this PUT silently
    // allows by just nulling the field.
    if ('orgId' in body && !body.orgId) {
      return reply.code(400).send({ error: 'orgId cannot be cleared — a Site must always belong to an Organisation', code: 'ORG_ID_REQUIRED' });
    }

    let resolvedOrg: typeof organisations.$inferSelect | undefined;
    if (body.orgId) {
      const [org] = await db
        .select()
        .from(organisations)
        .where(and(eq(organisations.id, body.orgId), eq(organisations.tenantId, request.user!.tenantId)))
        .limit(1);
      if (!org) return reply.code(400).send({ error: 'Organisation not found for this tenant', code: 'ORG_NOT_FOUND' });
      resolvedOrg = org;
    }

    // FIX: Site code (site_num) is auto-allocated once at creation and
    // never editable afterward. Description still updates `name` too, so
    // the couple of other screens that read Site.name keep showing
    // something meaningful.
    const updates: Partial<typeof sites.$inferInsert> = {};
    if (body.orgId != null) updates.orgId = body.orgId;
    if (body.description != null) {
      updates.description = body.description;
      if (body.description.trim()) updates.name = body.description.trim();
    }
    if (body.addressLine1 != null) updates.addressLine1 = body.addressLine1;
    if (body.addressLine2 != null) updates.addressLine2 = body.addressLine2;
    if (body.city != null) updates.city = body.city;
    if (body.stateProvince != null) updates.stateProvince = body.stateProvince;
    if (body.postalCode != null) updates.postalCode = body.postalCode;
    if (body.country != null) updates.country = body.country;
    if (body.timezone != null) updates.timezone = body.timezone;
    if (body.isActive != null) updates.isActive = body.isActive;

    // FIX (Org/Site gap #5): re-resolve glAccount/costCenter whenever the
    // caller flips inheritance back on, or explicitly supplies an override
    // value while inheritance is off. If inheritGlAccount/inheritCostCenter
    // aren't mentioned at all, leave the existing values untouched.
    if (body.inheritGlAccount != null) {
      updates.inheritGlAccount = body.inheritGlAccount;
      if (body.inheritGlAccount && resolvedOrg) updates.glAccount = resolvedOrg.glAccount;
    }
    if (body.inheritCostCenter != null) {
      updates.inheritCostCenter = body.inheritCostCenter;
      if (body.inheritCostCenter && resolvedOrg) updates.costCenter = resolvedOrg.costCenter;
    }
    if (body.glAccount != null && body.inheritGlAccount !== true) updates.glAccount = body.glAccount;
    if (body.costCenter != null && body.inheritCostCenter !== true) updates.costCenter = body.costCenter;

    updates.updatedAt = new Date();

    try {
      const [row] = await db
        .update(sites)
        .set(updates)
        .where(
          and(
            eq(sites.id, id),
            eq(sites.tenantId, request.user!.tenantId),
          ),
        )
        .returning();

      if (!row) return reply.code(404).send({ error: 'Site not found' });
      return row;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('sites_org_sitenum_idx')) {
        return reply.code(409).send({
          error: 'Site Number already exists under this Organisation',
          code: 'DUPLICATE_SITE_NUM',
        });
      }
      throw err;
    }
  });

  app.delete('/admin/org/sites/:id', guard, async (request, reply) => {
    const { id } = request.params as { id: string };

    // FIX (Org/Site gap #9, extends the existing Org→Site guard pattern):
    // block deleting a Site that still has Locations or Assets under it —
    // same protective logic as the Organisation delete route above, just
    // one level down the hierarchy.
    const [depLocation] = await db
      .select({ id: locations.id })
      .from(locations)
      .where(and(eq(locations.siteId, id), eq(locations.tenantId, request.user!.tenantId)))
      .limit(1);
    if (depLocation) {
      return reply.code(409).send({ error: 'Cannot delete site with active locations', code: 'HAS_DEPENDENT_LOCATIONS' });
    }

    const [depAsset] = await db
      .select({ id: assets.id })
      .from(assets)
      .where(and(eq(assets.siteId, id), eq(assets.tenantId, request.user!.tenantId)))
      .limit(1);
    if (depAsset) {
      return reply.code(409).send({ error: 'Cannot delete site with active assets', code: 'HAS_DEPENDENT_ASSETS' });
    }

    // FIX (Org/Site gap #12): soft-delete, same rationale as Organisation
    // delete above — Sites are foundational records too.
    const [row] = await db
      .update(sites)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(
          eq(sites.id, id),
          eq(sites.tenantId, request.user!.tenantId),
        ),
      )
      .returning();

    if (!row) return reply.code(404).send({ error: 'Site not found' });
    return reply.code(200).send(row);
  });

  // ─── Entity Scope Registry (Org-level vs Site-level) ───────────────────────────
  // FIX (Org/Site gap #6, #7): read-only lookup so the frontend (and any
  // future admin screen) can show "this entity is managed at Org level /
  // Site level" without hardcoding the list — see entityScopeRegistry in
  // packages/db/src/schema/entities.ts for the full rationale and the
  // seeded values in migration 0012.

  app.get('/admin/org/entity-scope-registry', guard, async () => {
    return db.select().from(entityScopeRegistry).orderBy(entityScopeRegistry.scopeLevel, entityScopeRegistry.entityName);
  });

  // ─── Status Sets ──────────────────────────────────────────────────────────────

  app.get('/admin/org/status-sets', guard, async (request) => {
    const sets = await db
      .select()
      .from(statusSets)
      .where(eq(statusSets.tenantId, request.user!.tenantId))
      .orderBy(statusSets.name);

    // Attach transition counts
    const result = await Promise.all(
      sets.map(async (s: typeof sets[0]) => {
        const transitions = await db
          .select()
          .from(statusTransitions)
          .where(eq(statusTransitions.statusSetId, s.id));
        return { ...s, transitionCount: transitions.length };
      }),
    );

    return result;
  });

  app.post('/admin/org/status-sets', guard, async (request, reply) => {
    const body = request.body as {
      name: string;
      label: string;
      entityType: string;
      description?: string;
    };

    const [row] = await db
      .insert(statusSets)
      .values({
        tenantId: request.user!.tenantId,
        name: body.name,
        label: body.label,
        entityType: body.entityType,
        description: body.description,
      })
      .returning();

    return reply.code(201).send(row);
  });

  app.put('/admin/org/status-sets/:id', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      name?: string;
      label?: string;
      description?: string;
      isActive?: boolean;
    };

    const updates: Partial<typeof statusSets.$inferInsert> = {};
    if (body.name != null) updates.name = body.name;
    if (body.label != null) updates.label = body.label;
    if (body.description != null) updates.description = body.description;
    if (body.isActive != null) updates.isActive = body.isActive;
    updates.updatedAt = new Date();

    const [row] = await db
      .update(statusSets)
      .set(updates)
      .where(
        and(
          eq(statusSets.id, id),
          eq(statusSets.tenantId, request.user!.tenantId),
        ),
      )
      .returning();

    if (!row) return reply.code(404).send({ error: 'Status set not found' });
    return row;
  });

  app.delete('/admin/org/status-sets/:id', guard, async (request, reply) => {
    const { id } = request.params as { id: string };

    const [ss] = await db
      .select()
      .from(statusSets)
      .where(
        and(
          eq(statusSets.id, id),
          eq(statusSets.tenantId, request.user!.tenantId),
        ),
      )
      .limit(1);

    if (!ss) return reply.code(404).send({ error: 'Status set not found' });
    if (ss.isSystem) return reply.code(403).send({ error: 'System status sets cannot be deleted' });

    // Cascade deletes transitions via FK
    await db.delete(statusSets).where(eq(statusSets.id, id));
    return reply.code(204).send();
  });

  // ─── Status Transitions ───────────────────────────────────────────────────────

  app.get('/admin/org/status-sets/:id/transitions', guard, async (request, reply) => {
    const { id } = request.params as { id: string };

    const [ss] = await db
      .select()
      .from(statusSets)
      .where(
        and(
          eq(statusSets.id, id),
          eq(statusSets.tenantId, request.user!.tenantId),
        ),
      )
      .limit(1);

    if (!ss) return reply.code(404).send({ error: 'Status set not found' });

    return db
      .select()
      .from(statusTransitions)
      .where(eq(statusTransitions.statusSetId, id))
      .orderBy(statusTransitions.fromStatus);
  });

  app.post('/admin/org/status-sets/:id/transitions', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      fromStatus: string;
      toStatus: string;
      label?: string;
      requiresComment?: boolean;
      requiredRole?: string;
      notifyRoles?: string[];
      conditionExpression?: string;
    };

    const [row] = await db
      .insert(statusTransitions)
      .values({
        statusSetId: id,
        fromStatus: body.fromStatus,
        toStatus: body.toStatus,
        label: body.label,
        requiresComment: body.requiresComment ?? false,
        requiredRole: body.requiredRole,
        notifyRoles: body.notifyRoles ?? [],
        conditionExpression: body.conditionExpression,
      })
      .returning();

    return reply.code(201).send(row);
  });

  app.put('/admin/org/status-sets/:id/transitions/:transId', guard, async (request, reply) => {
    const { transId } = request.params as { id: string; transId: string };
    const body = request.body as {
      fromStatus?: string;
      toStatus?: string;
      label?: string;
      requiresComment?: boolean;
      requiredRole?: string;
      notifyRoles?: string[];
      conditionExpression?: string;
    };

    const updates: Partial<typeof statusTransitions.$inferInsert> = {};
    if (body.fromStatus != null) updates.fromStatus = body.fromStatus;
    if (body.toStatus != null) updates.toStatus = body.toStatus;
    if (body.label != null) updates.label = body.label;
    if (body.requiresComment != null) updates.requiresComment = body.requiresComment;
    if (body.requiredRole != null) updates.requiredRole = body.requiredRole;
    if (body.notifyRoles != null) updates.notifyRoles = body.notifyRoles;
    if (body.conditionExpression != null) updates.conditionExpression = body.conditionExpression;

    const [row] = await db
      .update(statusTransitions)
      .set(updates)
      .where(eq(statusTransitions.id, transId))
      .returning();

    if (!row) return reply.code(404).send({ error: 'Transition not found' });
    return row;
  });

  app.delete('/admin/org/status-sets/:id/transitions/:transId', guard, async (request, reply) => {
    const { transId } = request.params as { id: string; transId: string };
    await db.delete(statusTransitions).where(eq(statusTransitions.id, transId));
    return reply.code(204).send();
  });
}
