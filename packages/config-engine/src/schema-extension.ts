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

export type SchemaOperation = 'ADD_COLUMN' | 'DROP_COLUMN' | 'RENAME_COLUMN';

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

export function sanitizeColumnName(name: string): string {
  const cleaned = name.replace(/[^a-z0-9_]/gi, '').slice(0, 50);
  if (!cleaned.startsWith('custom__')) {
    return `custom__${cleaned}`;
  }
  return cleaned;
}

function assertCustomColumn(columnName: string): string | null {
  if (!columnName.startsWith('custom__')) {
    return 'Only custom__ columns can be modified';
  }
  return null;
}

export class SchemaExtensionService {
  constructor(private db: Database) {}

  private async runMigration(params: {
    tableName: string;
    columnName: string;
    operation: SchemaOperation;
    sqlExecuted: string;
    tenantId: string;
    adminUserId: string;
    execute: () => Promise<void>;
  }): Promise<MigrationResult> {
    if (!ALLOWED_TABLES.has(params.tableName)) {
      return { success: false, error: 'Table not in allowlist' };
    }

    const [migration] = await this.db
      .insert(schemaMigrations)
      .values({
        tenantId: params.tenantId,
        tableName: params.tableName,
        columnName: params.columnName,
        operation: params.operation,
        sqlExecuted: params.sqlExecuted,
        status: 'PENDING',
        executedBy: params.adminUserId,
      })
      .returning();

    try {
      await this.db.execute(sql.raw(`SELECT pg_advisory_lock(hashtext('${params.tableName}'))`));
      await params.execute();
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

  async addColumn(params: {
    tableName: string;
    columnName: string;
    pgType: PgColumnType;
    nullable?: boolean;
    addIndex?: boolean;
    tenantId: string;
    adminUserId: string;
  }): Promise<MigrationResult> {
    const columnName = sanitizeColumnName(params.columnName);
    const pgType = PG_TYPE_MAP[params.pgType];
    const alterSql = `ALTER TABLE ${params.tableName} ADD COLUMN IF NOT EXISTS ${columnName} ${pgType} NULL`;

    return this.runMigration({
      tableName: params.tableName,
      columnName,
      operation: 'ADD_COLUMN',
      sqlExecuted: alterSql,
      tenantId: params.tenantId,
      adminUserId: params.adminUserId,
      execute: async () => {
        await this.db.execute(sql.raw(alterSql));
        if (params.addIndex) {
          await this.db.execute(
            sql.raw(
              `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_${params.tableName}_${columnName} ON ${params.tableName} (${columnName})`,
            ),
          );
        }
      },
    });
  }

  /** Soft-drop: renames column to custom__{key}__deleted_{timestamp} (data retained). */
  async dropColumn(params: {
    tableName: string;
    columnName: string;
    tenantId: string;
    adminUserId: string;
  }): Promise<MigrationResult> {
    const columnName = sanitizeColumnName(params.columnName);
    const customErr = assertCustomColumn(columnName);
    if (customErr) return { success: false, error: customErr };

    const deletedName = `${columnName}__deleted_${Date.now()}`.slice(0, 63);
    const alterSql = `ALTER TABLE ${params.tableName} RENAME COLUMN ${columnName} TO ${deletedName}`;

    return this.runMigration({
      tableName: params.tableName,
      columnName,
      operation: 'DROP_COLUMN',
      sqlExecuted: alterSql,
      tenantId: params.tenantId,
      adminUserId: params.adminUserId,
      execute: async () => {
        await this.db.execute(sql.raw(alterSql));
      },
    });
  }

  async renameColumn(params: {
    tableName: string;
    fromColumnName: string;
    toColumnName: string;
    tenantId: string;
    adminUserId: string;
  }): Promise<MigrationResult> {
    const fromColumn = sanitizeColumnName(params.fromColumnName);
    const toColumn = sanitizeColumnName(params.toColumnName);
    const fromErr = assertCustomColumn(fromColumn);
    if (fromErr) return { success: false, error: fromErr };
    const toErr = assertCustomColumn(toColumn);
    if (toErr) return { success: false, error: toErr };
    if (fromColumn === toColumn) {
      return { success: true };
    }

    const alterSql = `ALTER TABLE ${params.tableName} RENAME COLUMN ${fromColumn} TO ${toColumn}`;

    return this.runMigration({
      tableName: params.tableName,
      columnName: fromColumn,
      operation: 'RENAME_COLUMN',
      sqlExecuted: alterSql,
      tenantId: params.tenantId,
      adminUserId: params.adminUserId,
      execute: async () => {
        await this.db.execute(sql.raw(alterSql));
      },
    });
  }
}
