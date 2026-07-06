import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
  primaryKey,
  foreignKey,
} from 'drizzle-orm/pg-core';

export const authSourceEnum = pgEnum('auth_source', ['LOCAL', 'AD', 'LDAP', 'SAML', 'OIDC']);
export const groupSourceEnum = pgEnum('group_source', ['LOCAL', 'AD', 'LDAP']);
export const idpTypeEnum = pgEnum('idp_type', ['SAML', 'OIDC', 'LDAP', 'AD']);

// FIX: Maximo "Default Information" profile screen — side nav display rule.
// DISPLAY/HIDE are explicit user overrides; SECURITY_GROUP defers to the
// setting configured on the user's security group (default — matches the
// Maximo screen's "Use setting from security group" radio).
export const sideNavModeEnum = pgEnum('side_nav_mode', ['DISPLAY', 'HIDE', 'SECURITY_GROUP']);

// FIX: PRD §8.1 — "Data scoping: Roles scoped to organisation, site, or
// location." A role's permissions still say WHICH actions/resources it can
// touch (role_permissions, unchanged); scopeType/scopeIds say WHICH
// records of those resources it can touch. 'ALL' = no restriction (today's
// behaviour, so every existing role keeps working unmodified).
export const roleScopeTypeEnum = pgEnum('role_scope_type', [
  'ALL',
  'ORGANISATION',
  'SITE',
  'LOCATION',
]);

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  settings: jsonb('settings').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    username: text('username').notNull(),
    passwordHash: text('password_hash'),
    displayName: text('display_name').notNull(),
    employeeId: text('employee_id'),
    department: text('department'),
    phone: text('phone'),
    managerId: uuid('manager_id'),
    // FIX: Maximo "Default Information" profile screen fields. defaultSiteId/
    // defaultOrgId are plain uuid (no .references()) rather than FKs to avoid
    // a circular import with entities.ts (which already imports `users` from
    // this file for its own FKs). Referential integrity for these two is
    // enforced in the route handler instead — see account-default-info.ts.
    defaultOrgId: uuid('default_org_id'),
    defaultSiteId: uuid('default_site_id'),
    useDefaultSiteAsFilter: boolean('use_default_site_as_filter').notNull().default(true),
    sideNavMode: sideNavModeEnum('side_nav_mode').notNull().default('SECURITY_GROUP'),
    storeroomSiteId: uuid('storeroom_site_id'),
    defaultStoreroom: text('default_storeroom'),
    userDefaultApplication: text('user_default_application').notNull().default('Dashboard'),
    language: text('language'),
    locale: text('locale'),
    timezone: text('timezone'),
    // FIX: remaining Default Information fields from the Maximo reference
    // screen (Calendar Type, Default Repair Facility) — calendarType is a
    // free-text lookup value (no calendars module yet to FK against);
    // defaultRepairFacility mirrors the same pattern as storeroomSiteId.
    calendarType: text('calendar_type'),
    defaultRepairFacility: text('default_repair_facility'),
    // FIX: Personal Information screen — Organization sub-section
    // (Division, Line 3?–Line 6? checkboxes). `department` already exists
    // above. These are plain booleans/text, same self-service pattern as
    // the Default Information fields — not security-relevant, just
    // descriptive routing metadata (matches the flw_division/flw_line
    // fields seen in the training-manual routing rules).
    division: text('division'),
    line3: boolean('line3').notNull().default(false),
    line4: boolean('line4').notNull().default(false),
    line5: boolean('line5').notNull().default(false),
    line6: boolean('line6').notNull().default(false),
    authSource: authSourceEnum('auth_source').notNull().default('LOCAL'),
    externalId: text('external_id'),
    isActive: boolean('is_active').notNull().default(true),
    mfaEnabled: boolean('mfa_enabled').notNull().default(false),
    mfaSecret: text('mfa_secret'),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }),
    // FIX (Gap analysis — "Set or Modify E-Signature Key" was a frontend
    // placeholder with no backend at all, throwing 404 "Not Found" on
    // load). A separate hashed credential from the login password — used
    // to electronically sign/approve records (e.g. work order sign-off)
    // without re-entering the login password each time. Hashed with the
    // same hashPassword()/verifyPassword() helpers as passwordHash, never
    // stored or returned in plaintext.
    esignatureHash: text('esignature_hash'),
    esignatureSetAt: timestamp('esignature_set_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('users_tenant_email_idx').on(t.tenantId, t.email),
    uniqueIndex('users_tenant_username_idx').on(t.tenantId, t.username),
    index('users_tenant_idx').on(t.tenantId),
    index('users_manager_idx').on(t.managerId),
    index('users_external_id_idx').on(t.tenantId, t.externalId),
    foreignKey({
      columns: [t.managerId],
      foreignColumns: [t.id],
      name: 'users_manager_id_fk',
    }).onDelete('set null'),
  ],
);

// FIX: rebuilt to match IBM Maximo's authorization model rather than the
// PRD's role-centric one. In Maximo, the Security Group is the unit that
// "grants access to members of the group to start centers, applications,
// Work Centers, and object structures" — permissions, MFA requirement, and
// site authorization (PRD §8.1 data scoping) all live on the GROUP now,
// not on Role. Role becomes pure job-title metadata (see below) with zero
// security behaviour, matching how Maximo treats "role" as descriptive
// person data, never as a permission container.
export const groups = pgTable(
  'groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    source: groupSourceEnum('source').notNull().default('LOCAL'),
    externalDn: text('external_dn'),
    // FIX (moved from roles): a security group can mandate MFA for all
    // its members, same as Maximo lets a group's authorization tighten
    // login requirements for anyone in it.
    requireMfa: boolean('require_mfa').notNull().default(false),
    // FIX (moved from roles): PRD §8.1 data scoping, now expressed at the
    // group level — "Authorize Group for All Sites?" vs specific sites is
    // exactly Maximo's Security Groups → Sites tab behaviour.
    scopeType: roleScopeTypeEnum('scope_type').notNull().default('ALL'),
    scopeIds: uuid('scope_ids').array().default([]),
    // FIX: real Maximo's Security Groups screen has a "Display Side
    // Navigation Menu?" checkbox per group. Resolution order (confirmed
    // against IBM's own docs): if ANY group a user belongs to has this on,
    // the user sees the side nav — it's an OR across all their groups, not
    // an AND. A user's own Default Information choice (DISPLAY/HIDE)
    // always overrides this; SECURITY_GROUP defers to this flag.
    displaySideNav: boolean('display_side_nav').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('groups_tenant_name_idx').on(t.tenantId, t.name),
    index('groups_tenant_idx').on(t.tenantId),
  ],
);

export const userGroups = pgTable(
  'user_groups',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.groupId] }),
    index('user_groups_user_idx').on(t.userId),
    index('user_groups_group_idx').on(t.groupId),
  ],
);

// FIX: Role is now pure descriptive metadata — a job title to display
// next to a user's name (e.g. "Senior Technician", "Reliability Engineer"),
// exactly how Maximo treats "Job" / role data: informational, never a
// permission container. No requireMfa, no scope, no permissions table
// references it at all anymore — see group_permissions below for where
// authorization actually lives now.
export const roles = pgTable(
  'roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    isSystem: boolean('is_system').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('roles_tenant_name_idx').on(t.tenantId, t.name),
    index('roles_tenant_idx').on(t.tenantId),
  ],
);

// FIX: group_roles still exists for reporting/display only now (e.g.
// "this group is typically made up of Technicians and Supervisors") — it
// is NOT consulted anywhere in permission resolution anymore. See
// group_permissions below for the real authorization link.
export const groupRoles = pgTable(
  'group_roles',
  {
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.groupId, t.roleId] }),
    index('group_roles_group_idx').on(t.groupId),
    index('group_roles_role_idx').on(t.roleId),
  ],
);

export const permissions = pgTable(
  'permissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    resource: text('resource').notNull(),
    action: text('action').notNull(),
    description: text('description'),
  },
  (t) => [uniqueIndex('permissions_resource_action_idx').on(t.resource, t.action)],
);

// FIX: this replaces role_permissions entirely. Permissions are now
// granted directly to the Security Group, matching Maximo: "A security
// group grants access to members of the group to ... applications ...
// The access options can be read, insert, save, and delete." The group IS
// the permission container; there is no role indirection anymore.
export const groupPermissions = pgTable(
  'group_permissions',
  {
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.groupId, t.permissionId] }),
    index('group_permissions_group_idx').on(t.groupId),
    index('group_permissions_permission_idx').on(t.permissionId),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('sessions_user_idx').on(t.userId),
    index('sessions_tenant_idx').on(t.tenantId),
    index('sessions_token_hash_idx').on(t.tokenHash),
    index('sessions_expires_at_idx').on(t.expiresAt),
  ],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    resource: text('resource').notNull(),
    resourceId: text('resource_id'),
    ipAddress: text('ip_address'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('audit_logs_tenant_idx').on(t.tenantId),
    index('audit_logs_user_idx').on(t.userId),
    index('audit_logs_created_idx').on(t.createdAt),
    index('audit_logs_resource_idx').on(t.resource, t.resourceId),
  ],
);

export const identityProviders = pgTable(
  'identity_providers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    type: idpTypeEnum('type').notNull(),
    name: text('name').notNull(),
    config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [
    uniqueIndex('identity_providers_tenant_name_idx').on(t.tenantId, t.name),
    index('identity_providers_tenant_idx').on(t.tenantId),
  ],
);

export const mfaRecoveryCodes = pgTable(
  'mfa_recovery_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
  },
  (t) => [index('mfa_recovery_codes_user_idx').on(t.userId)],
);
