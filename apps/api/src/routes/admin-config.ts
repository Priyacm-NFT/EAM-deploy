import type { FastifyInstance } from 'fastify';
import { eq, and, asc, desc } from 'drizzle-orm';
import {
  db,
  entityDefinitions,
  fieldDefinitions,
  fieldRules,
  formLayouts,
  picklistDefinitions,
  picklistValues,
  tableViews,
  configVersions,
  schemaMigrations,
} from '@eam/db';
import { requirePermission } from '../plugins/auth.js';
import { SchemaExtensionService } from '@eam/config-engine';

const FIELD_TYPE_TO_PG: Record<string, 'TEXT' | 'INTEGER' | 'NUMERIC' | 'BOOLEAN' | 'DATE' | 'TIMESTAMPTZ' | 'JSONB'> = {
  TEXT: 'TEXT',
  NUMBER: 'NUMERIC',
  DATE: 'DATE',
  DATETIME: 'TIMESTAMPTZ',
  BOOLEAN: 'BOOLEAN',
  EMAIL: 'TEXT',
  URL: 'TEXT',
  PHONE: 'TEXT',
  PICKLIST: 'TEXT',
  MULTI_SELECT: 'JSONB',
  LOOKUP: 'TEXT',
  FORMULA: 'TEXT',
  ATTACHMENT: 'TEXT',
};

export async function adminConfigRoutes(app: FastifyInstance) {
  const guard = { preHandler: requirePermission('admin:config:manage') };

  app.get('/admin/config/entities/:entityId/fields', guard, async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    const [entity] = await db
      .select()
      .from(entityDefinitions)
      .where(
        and(
          eq(entityDefinitions.id, entityId),
          eq(entityDefinitions.tenantId, request.user!.tenantId),
        ),
      )
      .limit(1);
    if (!entity) return reply.status(404).send({ error: 'Entity not found' });

    return db
      .select()
      .from(fieldDefinitions)
      .where(
        and(
          eq(fieldDefinitions.entityId, entityId),
          eq(fieldDefinitions.tenantId, request.user!.tenantId),
        ),
      )
      .orderBy(asc(fieldDefinitions.displayOrder));
  });

  app.post('/admin/config/entities/:entityId/fields', guard, async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    const body = request.body as {
      fieldKey: string;
      label: string;
      fieldType: string;
      isRequiredGlobal?: boolean;
      isSearchable?: boolean;
      validationRules?: Record<string, unknown>;
      placeholder?: string;
      helpText?: string;
      displayOrder?: number;
      pgType?: 'TEXT';
    };

    const [entity] = await db
      .select()
      .from(entityDefinitions)
      .where(
        and(
          eq(entityDefinitions.id, entityId),
          eq(entityDefinitions.tenantId, request.user!.tenantId),
        ),
      )
      .limit(1);
    if (!entity) return reply.status(404).send({ error: 'Entity not found' });

    const pgType = body.pgType ?? FIELD_TYPE_TO_PG[body.fieldType] ?? 'TEXT';

    const [field] = await db
      .insert(fieldDefinitions)
      .values({
        tenantId: request.user!.tenantId,
        entityId,
        fieldKey: body.fieldKey,
        label: body.label,
        fieldType: body.fieldType as 'TEXT',
        isRequiredGlobal: body.isRequiredGlobal ?? false,
        isSearchable: body.isSearchable ?? false,
        validationRules: body.validationRules ?? {},
        placeholder: body.placeholder,
        helpText: body.helpText,
        displayOrder: body.displayOrder ?? 0,
      })
      .returning();

    const ext = new SchemaExtensionService(db);
    const migration = await ext.addColumn({
      tableName: entity.tableName,
      columnName: body.fieldKey,
      pgType,
      addIndex: body.isSearchable,
      tenantId: request.user!.tenantId,
      adminUserId: request.user!.id,
    });

    if (!migration.success) {
      await db.delete(fieldDefinitions).where(eq(fieldDefinitions.id, field!.id));
      return reply.status(500).send({ error: migration.error ?? 'Schema migration failed' });
    }

    return reply.status(201).send(field);
  });

  app.put('/admin/config/entities/:entityId/fields/:fieldId', guard, async (request, reply) => {
    const { entityId, fieldId } = request.params as { entityId: string; fieldId: string };
    const body = request.body as {
      fieldKey?: string;
      label?: string;
      fieldType?: string;
      isRequiredGlobal?: boolean;
      isSearchable?: boolean;
      validationRules?: Record<string, unknown>;
      placeholder?: string;
      helpText?: string;
      displayOrder?: number;
      isActive?: boolean;
    };

    const [entity] = await db
      .select()
      .from(entityDefinitions)
      .where(
        and(
          eq(entityDefinitions.id, entityId),
          eq(entityDefinitions.tenantId, request.user!.tenantId),
        ),
      )
      .limit(1);
    if (!entity) return reply.status(404).send({ error: 'Entity not found' });

    const [existing] = await db
      .select()
      .from(fieldDefinitions)
      .where(
        and(
          eq(fieldDefinitions.id, fieldId),
          eq(fieldDefinitions.entityId, entityId),
          eq(fieldDefinitions.tenantId, request.user!.tenantId),
        ),
      )
      .limit(1);
    if (!existing) return reply.status(404).send({ error: 'Field not found' });
    if (existing.isSystem) return reply.status(403).send({ error: 'System fields cannot be modified' });

    if (body.fieldKey && body.fieldKey !== existing.fieldKey) {
      const ext = new SchemaExtensionService(db);
      const migration = await ext.renameColumn({
        tableName: entity.tableName,
        fromColumnName: existing.fieldKey,
        toColumnName: body.fieldKey,
        tenantId: request.user!.tenantId,
        adminUserId: request.user!.id,
      });
      if (!migration.success) {
        return reply.status(500).send({ error: migration.error ?? 'Column rename failed' });
      }
    }

    const updates: Partial<typeof fieldDefinitions.$inferInsert> = {};
    if (body.fieldKey != null) updates.fieldKey = body.fieldKey;
    if (body.label != null) updates.label = body.label;
    if (body.fieldType != null) updates.fieldType = body.fieldType as 'TEXT';
    if (body.isRequiredGlobal != null) updates.isRequiredGlobal = body.isRequiredGlobal;
    if (body.isSearchable != null) updates.isSearchable = body.isSearchable;
    if (body.validationRules != null) updates.validationRules = body.validationRules;
    if (body.placeholder != null) updates.placeholder = body.placeholder;
    if (body.helpText != null) updates.helpText = body.helpText;
    if (body.displayOrder != null) updates.displayOrder = body.displayOrder;
    if (body.isActive != null) updates.isActive = body.isActive;
    updates.updatedAt = new Date();

    const [field] = await db
      .update(fieldDefinitions)
      .set(updates)
      .where(eq(fieldDefinitions.id, fieldId))
      .returning();

    return field;
  });

  app.delete('/admin/config/entities/:entityId/fields/:fieldId', guard, async (request, reply) => {
    const { entityId, fieldId } = request.params as { entityId: string; fieldId: string };

    const [entity] = await db
      .select()
      .from(entityDefinitions)
      .where(
        and(
          eq(entityDefinitions.id, entityId),
          eq(entityDefinitions.tenantId, request.user!.tenantId),
        ),
      )
      .limit(1);
    if (!entity) return reply.status(404).send({ error: 'Entity not found' });

    const [existing] = await db
      .select()
      .from(fieldDefinitions)
      .where(
        and(
          eq(fieldDefinitions.id, fieldId),
          eq(fieldDefinitions.entityId, entityId),
          eq(fieldDefinitions.tenantId, request.user!.tenantId),
        ),
      )
      .limit(1);
    if (!existing) return reply.status(404).send({ error: 'Field not found' });
    if (existing.isSystem) return reply.status(403).send({ error: 'System fields cannot be deleted' });

    if (!existing.isSystem) {
      const ext = new SchemaExtensionService(db);
      const migration = await ext.dropColumn({
        tableName: entity.tableName,
        columnName: existing.fieldKey,
        tenantId: request.user!.tenantId,
        adminUserId: request.user!.id,
      });
      if (!migration.success) {
        return reply.status(500).send({ error: migration.error ?? 'Column drop failed' });
      }
    }

    await db.delete(fieldDefinitions).where(eq(fieldDefinitions.id, fieldId));
    return reply.status(204).send();
  });

  app.get('/admin/config/entities/:entityId/forms', guard, async (request) => {
    const { entityId } = request.params as { entityId: string };
    return db
      .select()
      .from(formLayouts)
      .where(
        and(
          eq(formLayouts.entityId, entityId),
          eq(formLayouts.tenantId, request.user!.tenantId),
        ),
      );
  });

  app.post('/admin/config/entities/:entityId/forms', guard, async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    const body = request.body as {
      name: string;
      definition?: Record<string, unknown>;
      roleId?: string;
    };

    const [form] = await db
      .insert(formLayouts)
      .values({
        tenantId: request.user!.tenantId,
        entityId,
        name: body.name,
        definition: body.definition ?? { sections: [] },
        roleId: body.roleId,
      })
      .returning();

    return reply.status(201).send(form);
  });

  app.put('/admin/config/entities/:entityId/forms/:formId', guard, async (request, reply) => {
    const { entityId, formId } = request.params as { entityId: string; formId: string };
    const body = request.body as {
      name?: string;
      definition?: Record<string, unknown>;
      isActive?: boolean;
    };

    const [form] = await db
      .update(formLayouts)
      .set({
        ...(body.name != null ? { name: body.name } : {}),
        ...(body.definition != null ? { definition: body.definition } : {}),
        ...(body.isActive != null ? { isActive: body.isActive } : {}),
      })
      .where(
        and(
          eq(formLayouts.id, formId),
          eq(formLayouts.entityId, entityId),
          eq(formLayouts.tenantId, request.user!.tenantId),
        ),
      )
      .returning();

    if (!form) return reply.status(404).send({ error: 'Form layout not found' });
    return form;
  });

  app.delete('/admin/config/entities/:entityId/forms/:formId', guard, async (request, reply) => {
    const { entityId, formId } = request.params as { entityId: string; formId: string };
    await db
      .delete(formLayouts)
      .where(
        and(
          eq(formLayouts.id, formId),
          eq(formLayouts.entityId, entityId),
          eq(formLayouts.tenantId, request.user!.tenantId),
        ),
      );
    return reply.status(204).send();
  });

  app.get('/admin/config/entities/:entityId/rules', guard, async (request) => {
    const { entityId } = request.params as { entityId: string };
    return db
      .select()
      .from(fieldRules)
      .where(
        and(eq(fieldRules.entityId, entityId), eq(fieldRules.tenantId, request.user!.tenantId)),
      );
  });

  app.post('/admin/config/entities/:entityId/rules', guard, async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    const body = request.body as {
      fieldKey: string;
      ruleType: 'REQUIRED' | 'READONLY' | 'HIDDEN' | 'VISIBLE';
      conditionExpression?: string;
      roleId?: string;
      statusCondition?: string;
    };
    const [rule] = await db
      .insert(fieldRules)
      .values({
        tenantId: request.user!.tenantId,
        entityId,
        fieldKey: body.fieldKey,
        ruleType: body.ruleType,
        conditionExpression: body.conditionExpression,
        roleId: body.roleId,
        statusCondition: body.statusCondition,
      })
      .returning();
    return reply.status(201).send(rule);
  });

  app.delete('/admin/config/entities/:entityId/rules/:ruleId', guard, async (request, reply) => {
    const { ruleId } = request.params as { entityId: string; ruleId: string };
    await db.delete(fieldRules).where(eq(fieldRules.id, ruleId));
    return reply.status(204).send();
  });

  // ─── Table Views ──────────────────────────────────────────────────────────────

  app.get('/admin/config/entities/:entityId/views', guard, async (request) => {
    const { entityId } = request.params as { entityId: string };
    return db
      .select()
      .from(tableViews)
      .where(
        and(
          eq(tableViews.entityId, entityId),
          eq(tableViews.tenantId, request.user!.tenantId),
        ),
      );
  });

  app.post('/admin/config/entities/:entityId/views', guard, async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    const body = request.body as {
      name: string;
      columnConfig?: unknown[];
      defaultSort?: string;
      defaultFilter?: Record<string, unknown>;
      roleId?: string;
      isDefault?: boolean;
    };

    const [view] = await db
      .insert(tableViews)
      .values({
        tenantId: request.user!.tenantId,
        entityId,
        name: body.name,
        columnConfig: body.columnConfig ?? [],
        defaultSort: body.defaultSort,
        defaultFilter: body.defaultFilter,
        roleId: body.roleId,
        isDefault: body.isDefault ?? false,
      })
      .returning();

    return reply.status(201).send(view);
  });

  app.put('/admin/config/entities/:entityId/views/:viewId', guard, async (request, reply) => {
    const { entityId, viewId } = request.params as { entityId: string; viewId: string };
    const body = request.body as {
      name?: string;
      columnConfig?: unknown[];
      defaultSort?: string;
      defaultFilter?: Record<string, unknown>;
      isDefault?: boolean;
    };

    const updates: Partial<typeof tableViews.$inferInsert> = {};
    if (body.name != null) updates.name = body.name;
    if (body.columnConfig != null) updates.columnConfig = body.columnConfig;
    if (body.defaultSort != null) updates.defaultSort = body.defaultSort;
    if (body.defaultFilter != null) updates.defaultFilter = body.defaultFilter;
    if (body.isDefault != null) updates.isDefault = body.isDefault;

    const [view] = await db
      .update(tableViews)
      .set(updates)
      .where(
        and(
          eq(tableViews.id, viewId),
          eq(tableViews.entityId, entityId),
          eq(tableViews.tenantId, request.user!.tenantId),
        ),
      )
      .returning();

    if (!view) return reply.status(404).send({ error: 'View not found' });
    return view;
  });

  app.delete('/admin/config/entities/:entityId/views/:viewId', guard, async (request, reply) => {
    const { entityId, viewId } = request.params as { entityId: string; viewId: string };
    await db
      .delete(tableViews)
      .where(
        and(
          eq(tableViews.id, viewId),
          eq(tableViews.entityId, entityId),
          eq(tableViews.tenantId, request.user!.tenantId),
        ),
      );
    return reply.status(204).send();
  });

  // ─── Picklist Definitions ─────────────────────────────────────────────────────

  app.get('/admin/config/picklists', guard, async (request) => {
    return db
      .select()
      .from(picklistDefinitions)
      .where(eq(picklistDefinitions.tenantId, request.user!.tenantId))
      .orderBy(asc(picklistDefinitions.name));
  });

  app.post('/admin/config/picklists', guard, async (request, reply) => {
    const body = request.body as { name: string; label: string };
    const [pl] = await db
      .insert(picklistDefinitions)
      .values({
        tenantId: request.user!.tenantId,
        name: body.name,
        label: body.label,
      })
      .returning();
    return reply.status(201).send(pl);
  });

  app.put('/admin/config/picklists/:id', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { name?: string; label?: string };
    const updates: Partial<typeof picklistDefinitions.$inferInsert> = {};
    if (body.name != null) updates.name = body.name;
    if (body.label != null) updates.label = body.label;
    const [pl] = await db
      .update(picklistDefinitions)
      .set(updates)
      .where(
        and(
          eq(picklistDefinitions.id, id),
          eq(picklistDefinitions.tenantId, request.user!.tenantId),
        ),
      )
      .returning();
    if (!pl) return reply.status(404).send({ error: 'Picklist not found' });
    return pl;
  });

  app.delete('/admin/config/picklists/:id', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [pl] = await db
      .select()
      .from(picklistDefinitions)
      .where(
        and(
          eq(picklistDefinitions.id, id),
          eq(picklistDefinitions.tenantId, request.user!.tenantId),
        ),
      )
      .limit(1);
    if (!pl) return reply.status(404).send({ error: 'Picklist not found' });
    if (pl.isSystem) return reply.status(403).send({ error: 'System picklists cannot be deleted' });
    await db.delete(picklistDefinitions).where(eq(picklistDefinitions.id, id));
    return reply.status(204).send();
  });

  // ─── Picklist Values ──────────────────────────────────────────────────────────

  app.get('/admin/config/picklists/:id/values', guard, async (request) => {
    const { id } = request.params as { id: string };
    return db
      .select()
      .from(picklistValues)
      .where(eq(picklistValues.picklistId, id))
      .orderBy(asc(picklistValues.displayOrder));
  });

  app.post('/admin/config/picklists/:id/values', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      value: string;
      label: string;
      displayOrder?: number;
      parentValue?: string;
    };
    const [val] = await db
      .insert(picklistValues)
      .values({
        picklistId: id,
        value: body.value,
        label: body.label,
        displayOrder: body.displayOrder ?? 0,
        parentValue: body.parentValue,
      })
      .returning();
    return reply.status(201).send(val);
  });

  app.put('/admin/config/picklists/:id/values/:valueId', guard, async (request, reply) => {
    const { valueId } = request.params as { id: string; valueId: string };
    const body = request.body as {
      value?: string;
      label?: string;
      displayOrder?: number;
      isActive?: boolean;
    };
    const updates: Partial<typeof picklistValues.$inferInsert> = {};
    if (body.value != null) updates.value = body.value;
    if (body.label != null) updates.label = body.label;
    if (body.displayOrder != null) updates.displayOrder = body.displayOrder;
    if (body.isActive != null) updates.isActive = body.isActive;
    const [val] = await db
      .update(picklistValues)
      .set(updates)
      .where(eq(picklistValues.id, valueId))
      .returning();
    if (!val) return reply.status(404).send({ error: 'Value not found' });
    return val;
  });

  app.delete('/admin/config/picklists/:id/values/:valueId', guard, async (request, reply) => {
    const { valueId } = request.params as { id: string; valueId: string };
    await db.delete(picklistValues).where(eq(picklistValues.id, valueId));
    return reply.status(204).send();
  });

  // ─── Config Versions ──────────────────────────────────────────────────────────

  app.get('/admin/config/versions', guard, async (request) => {
    return db
      .select()
      .from(configVersions)
      .where(eq(configVersions.tenantId, request.user!.tenantId))
      .orderBy(desc(configVersions.createdAt))
      .limit(200);
  });

  app.get('/admin/config/versions/:entityType/:entityId', guard, async (request) => {
    const { entityType, entityId } = request.params as { entityType: string; entityId: string };
    return db
      .select()
      .from(configVersions)
      .where(
        and(
          eq(configVersions.tenantId, request.user!.tenantId),
          eq(configVersions.entityType, entityType),
          eq(configVersions.entityId, entityId),
        ),
      )
      .orderBy(desc(configVersions.versionNum));
  });

  // ─── Schema Migration Log ─────────────────────────────────────────────────────

  app.get('/admin/config/migrations', guard, async (request) => {
    return db
      .select()
      .from(schemaMigrations)
      .where(eq(schemaMigrations.tenantId, request.user!.tenantId))
      .orderBy(desc(schemaMigrations.executedAt))
      .limit(500);
  });

  app.post('/admin/config/migrations/:id/rollback', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [migration] = await db
      .select()
      .from(schemaMigrations)
      .where(
        and(
          eq(schemaMigrations.id, id),
          eq(schemaMigrations.tenantId, request.user!.tenantId),
        ),
      )
      .limit(1);

    if (!migration) return reply.status(404).send({ error: 'Migration not found' });
    if (migration.status !== 'SUCCESS') {
      return reply.status(400).send({ error: 'Only successful migrations can be rolled back' });
    }

    // Attempt rollback DDL (undo addColumn = dropColumn, etc.)
    const ext = new SchemaExtensionService(db);
    let result: { success: boolean; error?: string };

    if (migration.operation === 'ADD_COLUMN') {
      result = await ext.dropColumn({
        tableName: migration.tableName,
        columnName: migration.columnName,
        tenantId: request.user!.tenantId,
        adminUserId: request.user!.id,
      });
    } else {
      // Other operations: mark as rolled back without DDL
      result = { success: true };
    }

    if (!result.success) {
      return reply.status(500).send({ error: result.error ?? 'Rollback failed' });
    }

    // Mark the migration record as rolled back
    await db
      .update(schemaMigrations)
      .set({ status: 'ROLLED_BACK', error: null })
      .where(eq(schemaMigrations.id, id));

    return { ok: true };
  });

  app.post('/admin/config/migrations/:id/retry', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [migration] = await db
      .select()
      .from(schemaMigrations)
      .where(
        and(
          eq(schemaMigrations.id, id),
          eq(schemaMigrations.tenantId, request.user!.tenantId),
        ),
      )
      .limit(1);

    if (!migration) return reply.status(404).send({ error: 'Migration not found' });
    if (migration.status !== 'FAILED') {
      return reply.status(400).send({ error: 'Only failed migrations can be retried' });
    }

    // Re-execute the original SQL
    try {
      await db.execute(migration.sqlExecuted as unknown as Parameters<typeof db.execute>[0]);
      await db
        .update(schemaMigrations)
        .set({ status: 'SUCCESS', error: null })
        .where(eq(schemaMigrations.id, id));
      return { ok: true };
    } catch (err) {
      return reply.status(500).send({
        error: err instanceof Error ? err.message : 'Retry failed',
      });
    }
  });
}
