import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  jsonb,
  integer,
  pgEnum,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { tenants } from './identity.js';

export const visibilityEnum = pgEnum('visibility', ['PUBLIC', 'ROLE_RESTRICTED']);
export const scanStatusEnum = pgEnum('scan_status', ['PENDING', 'CLEAN', 'INFECTED', 'FAILED']);
export const virusActionEnum = pgEnum('virus_scan_action', ['QUARANTINE', 'REJECT', 'ALERT']);

export const documentTypes = pgTable('document_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  label: text('label').notNull(),
  description: text('description'),
  allowedExtensions: text('allowed_extensions').array().notNull().default([]),
  maxSizeBytes: integer('max_size_bytes').notNull().default(52428800),
  retentionDays: integer('retention_days'),
  visibility: visibilityEnum('visibility').notNull().default('PUBLIC'),
  requiredRoles: text('required_roles').array().default([]),
  virusScanEnabled: boolean('virus_scan_enabled').notNull().default(true),
  virusScanAction: virusActionEnum('virus_scan_action').notNull().default('QUARANTINE'),
  isActive: boolean('is_active').notNull().default(true),
  isSystem: boolean('is_system').notNull().default(false),
});

export const attachments = pgTable(
  'attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    documentTypeId: uuid('document_type_id')
      .notNull()
      .references(() => documentTypes.id),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    storageKey: text('storage_key').notNull(),
    originalFilename: text('original_filename').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    checksumSha256: text('checksum_sha256'),
    versionOf: uuid('version_of'),
    versionNum: integer('version_num').notNull().default(1),
    scanStatus: scanStatusEnum('scan_status').notNull().default('PENDING'),
    scanResult: jsonb('scan_result').$type<Record<string, unknown>>(),
    scanEngineVersion: text('scan_engine_version'),
    tags: text('tags').array().default([]),
    description: text('description'),
    uploadedBy: uuid('uploaded_by'),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('attachments_entity_idx').on(t.entityType, t.entityId)],
);

export const attachmentLinks = pgTable(
  'attachment_links',
  {
    attachmentId: uuid('attachment_id')
      .notNull()
      .references(() => attachments.id, { onDelete: 'cascade' }),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.attachmentId, t.entityType, t.entityId] })],
);
