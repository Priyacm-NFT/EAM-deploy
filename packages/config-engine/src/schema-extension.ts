import { eq, sql } from 'drizzle-orm';
import type { Database } from '@eam/db';
import { schemaMigrations } from '@eam/db';

const ALLOWED_TABLES = new Set([
  'assets',
  'work_orders',
  'service_requests',
  'locations',
]);

export type PgColumnType = 'TEXT' | 'INTEGER' | 'NUMERIC' | 'BOOLEAN' | 'DATE' | 'TIMESTAMPTZ' | 'JSONB';

const PG_TYPE_MAP: Record<PgColumnType, string> = {
  TEXT: 'TEXT',
  INTEGER: 'INTEGER',
  NUMERIC: 'NUMERIC',
  BOOLEAN: 'BOOLEAN',
  DATE: 'DATE',
  TIMESTAMPTZ: 'TIMESTAMPTZ',
  JSONB: 'JSONB',
};

export interface MigrationResult {
  success: boolean;
  migrationId?: string;
  error?: string;
}

function sanitizeColumnName(name: string): string {
  const cleaned = name.replace(/[^a-z0-9_]/gi, '').slice(0, 50);
  if (!cleaned.startsWith('custom__')) {
    return `custom__${cleaned}`;
  }
  return cleaned;
}

export class SchemaExtensionService {
  constructor(private db: Database) {}

  async addColumn(params: {
    tableName: string;
    columnName: string;
    pgType: PgColumnType;
    nullable?: boolean;
    addIndex?: boolean;
    tenantId: string;
    adminUserId: string;
  }): Promise<MigrationResult> {
    if (!ALLOWED_TABLES.has(params.tableName)) {
      return { success: false, error: 'Table not in allowlist' };
    }
    const columnName = sanitizeColumnName(params.columnName);
    const pgType = PG_TYPE_MAP[params.pgType];
    const alterSql = `ALTER TABLE ${params.tableName} ADD COLUMN IF NOT EXISTS ${columnName} ${pgType} NULL`;

    const [migration] = await this.db
      .insert(schemaMigrations)
      .values({
        tenantId: params.tenantId,
        tableName: params.tableName,
        columnName,
        operation: 'ADD_COLUMN',
        sqlExecuted: alterSql,
        status: 'PENDING',
        executedBy: params.adminUserId,
      })
      .returning();

    try {
      await this.db.execute(sql.raw(`SELECT pg_advisory_lock(hashtext('${params.tableName}'))`));
      await this.db.execute(sql.raw(alterSql));
      if (params.addIndex) {
        await this.db.execute(
          sql.raw(
            `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_${params.tableName}_${columnName} ON ${params.tableName} (${columnName})`,
          ),
        );
      }
      await this.db.execute(sql.raw(`SELECT pg_advisory_unlock(hashtext('${params.tableName}'))`));
      await this.db
        .update(schemaMigrations)
        .set({ status: 'SUCCESS' })
        .where(eq(schemaMigrations.id, migration!.id));
      return { success: true, migrationId: migration!.id };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      await this.db
        .update(schemaMigrations)
        .set({ status: 'FAILED', error: msg })
        .where(eq(schemaMigrations.id, migration!.id));
      return { success: false, error: msg };
    }
  }
}
