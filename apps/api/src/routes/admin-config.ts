import type { FastifyInstance } from 'fastify';
import { eq, and, asc } from 'drizzle-orm';
import {
  db,
  entityDefinitions,
  fieldDefinitions,
  fieldRules,
  formLayouts,
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
}
