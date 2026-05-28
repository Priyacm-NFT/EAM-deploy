/**
 * EAM Phase 1 — report subject definitions.
 * These constants are used by the seed to register the 15 standard reports.
 */

export const EAM_REPORT_SUBJECTS = [
  {
    name: 'wo_backlog',
    label: 'WO Backlog',
    baseQuery: `
      SELECT wo.wo_num, wo.description, wo.type, wo.status, wo.priority,
             wo.target_finish_date, wo.assigned_to_user_id,
             a.asset_num, a.description AS asset_description,
             s.name AS site_name
      FROM work_orders wo
      LEFT JOIN assets a ON a.id = wo.asset_id
      LEFT JOIN sites s ON s.id = wo.site_id
      WHERE wo.tenant_id = $1 AND wo.status NOT IN ('CLOSE','CAN')
    `,
    availableFields: [
      { key: 'wo_num', label: 'WO Number', type: 'text', filterable: true },
      { key: 'type', label: 'Type', type: 'text', filterable: true },
      { key: 'status', label: 'Status', type: 'text', filterable: true },
      { key: 'priority', label: 'Priority', type: 'text', filterable: true },
      { key: 'target_finish_date', label: 'Target Finish', type: 'date', filterable: true },
      { key: 'site_name', label: 'Site', type: 'text', filterable: true },
    ],
    isSystem: true,
  },
  {
    name: 'wo_cost_summary',
    label: 'WO Cost Summary',
    baseQuery: `
      SELECT wo.wo_num, wo.description, wo.type, wo.status,
             wo.labor_cost, wo.material_cost, wo.service_cost, wo.tool_cost, wo.total_cost,
             a.asset_num, a.description AS asset_description
      FROM work_orders wo
      LEFT JOIN assets a ON a.id = wo.asset_id
      WHERE wo.tenant_id = $1
    `,
    availableFields: [
      { key: 'wo_num', label: 'WO Number', type: 'text', filterable: true },
      { key: 'total_cost', label: 'Total Cost', type: 'number', filterable: true },
      { key: 'status', label: 'Status', type: 'text', filterable: true },
    ],
    isSystem: true,
  },
  {
    name: 'pm_compliance',
    label: 'PM Compliance %',
    baseQuery: `
      SELECT pm.pm_num, pm.description, pm.frequency_type,
             pf.forecast_date, pf.status,
             a.asset_num, s.name AS site_name,
             CASE WHEN pf.status = 'COMPLETED' THEN 1 ELSE 0 END AS completed,
             CASE WHEN pf.status IN ('PROJECTED','GENERATED') AND pf.forecast_date < NOW() THEN 1 ELSE 0 END AS overdue
      FROM pm_forecasts pf
      JOIN pm_masters pm ON pm.id = pf.pm_id
      LEFT JOIN assets a ON a.id = pm.asset_id
      LEFT JOIN sites s ON s.id = pm.site_id
      WHERE pf.tenant_id = $1
    `,
    availableFields: [
      { key: 'pm_num', label: 'PM Number', type: 'text', filterable: true },
      { key: 'status', label: 'Status', type: 'text', filterable: true },
      { key: 'forecast_date', label: 'Due Date', type: 'date', filterable: true },
      { key: 'site_name', label: 'Site', type: 'text', filterable: true },
    ],
    isSystem: true,
  },
  {
    name: 'overdue_pms',
    label: 'Overdue PMs',
    baseQuery: `
      SELECT pm.pm_num, pm.description, pm.next_due_date,
             a.asset_num, a.description AS asset_description,
             s.name AS site_name,
             DATE_PART('day', NOW() - pm.next_due_date) AS days_overdue
      FROM pm_masters pm
      LEFT JOIN assets a ON a.id = pm.asset_id
      LEFT JOIN sites s ON s.id = pm.site_id
      WHERE pm.tenant_id = $1
        AND pm.is_active = true
        AND pm.next_due_date < NOW()
    `,
    availableFields: [
      { key: 'pm_num', label: 'PM Number', type: 'text', filterable: true },
      { key: 'next_due_date', label: 'Due Date', type: 'date', filterable: true },
      { key: 'days_overdue', label: 'Days Overdue', type: 'number', filterable: true },
    ],
    isSystem: true,
  },
  {
    name: 'asset_availability',
    label: 'Asset Availability',
    baseQuery: `
      SELECT a.asset_num, a.description, a.status, a.criticality,
             s.name AS site_name,
             COALESCE(SUM(wo.downtime_hours), 0) AS total_downtime_hours,
             COUNT(wo.id) FILTER (WHERE wo.type = 'CM') AS cm_count
      FROM assets a
      LEFT JOIN sites s ON s.id = a.site_id
      LEFT JOIN work_orders wo ON wo.asset_id = a.id AND wo.status = 'CLOSE'
      WHERE a.tenant_id = $1
      GROUP BY a.id, s.name
    `,
    availableFields: [
      { key: 'asset_num', label: 'Asset Number', type: 'text', filterable: true },
      { key: 'status', label: 'Status', type: 'text', filterable: true },
      { key: 'criticality', label: 'Criticality', type: 'text', filterable: true },
      { key: 'total_downtime_hours', label: 'Downtime Hours', type: 'number', filterable: true },
    ],
    isSystem: true,
  },
  {
    name: 'mtbf_mttr',
    label: 'MTBF / MTTR',
    baseQuery: `
      SELECT a.asset_num, a.description,
             COUNT(wo.id) AS failure_count,
             AVG(EXTRACT(EPOCH FROM (wo.actual_finish_date - wo.actual_start_date))/3600) AS avg_repair_hours,
             COALESCE(SUM(wo.downtime_hours), 0) AS total_downtime
      FROM assets a
      JOIN work_orders wo ON wo.asset_id = a.id AND wo.type = 'CM' AND wo.status = 'CLOSE'
      WHERE a.tenant_id = $1
        AND wo.actual_start_date IS NOT NULL AND wo.actual_finish_date IS NOT NULL
      GROUP BY a.id
    `,
    availableFields: [
      { key: 'asset_num', label: 'Asset Number', type: 'text', filterable: true },
      { key: 'failure_count', label: 'Failure Count', type: 'number', filterable: true },
      { key: 'avg_repair_hours', label: 'Avg Repair Hours (MTTR)', type: 'number', filterable: true },
    ],
    isSystem: true,
  },
  {
    name: 'top_failing_assets',
    label: 'Top Failing Assets',
    baseQuery: `
      SELECT a.asset_num, a.description, a.criticality,
             s.name AS site_name,
             COUNT(wo.id) AS cm_count,
             COALESCE(SUM(wo.downtime_hours), 0) AS total_downtime,
             COALESCE(SUM(wo.total_cost), 0) AS total_cost
      FROM assets a
      LEFT JOIN sites s ON s.id = a.site_id
      JOIN work_orders wo ON wo.asset_id = a.id AND wo.type = 'CM'
      WHERE a.tenant_id = $1
      GROUP BY a.id, s.name
      ORDER BY cm_count DESC
    `,
    availableFields: [
      { key: 'asset_num', label: 'Asset Number', type: 'text', filterable: true },
      { key: 'cm_count', label: 'CM Count', type: 'number', filterable: true },
      { key: 'total_downtime', label: 'Downtime Hours', type: 'number', filterable: true },
    ],
    isSystem: true,
  },
  {
    name: 'sla_compliance',
    label: 'SLA Compliance',
    baseQuery: `
      SELECT sr.sr_num, sr.description, sr.priority, sr.category, sr.status,
             sr.created_at, sr.sla_due_at, sr.sla_breached, sr.closed_at,
             s.name AS site_name
      FROM service_requests sr
      LEFT JOIN sites s ON s.id = sr.site_id
      WHERE sr.tenant_id = $1
    `,
    availableFields: [
      { key: 'sr_num', label: 'SR Number', type: 'text', filterable: true },
      { key: 'priority', label: 'Priority', type: 'text', filterable: true },
      { key: 'sla_breached', label: 'SLA Breached', type: 'boolean', filterable: true },
      { key: 'category', label: 'Category', type: 'text', filterable: true },
    ],
    isSystem: true,
  },
  {
    name: 'open_service_requests',
    label: 'Open Service Requests',
    baseQuery: `
      SELECT sr.sr_num, sr.description, sr.priority, sr.category, sr.status,
             sr.created_at, sr.sla_due_at, sr.sla_breached,
             u.display_name AS requester,
             a.asset_num, s.name AS site_name,
             DATE_PART('day', NOW() - sr.created_at) AS age_days
      FROM service_requests sr
      LEFT JOIN users u ON u.id = sr.requester_id
      LEFT JOIN assets a ON a.id = sr.asset_id
      LEFT JOIN sites s ON s.id = sr.site_id
      WHERE sr.tenant_id = $1
        AND sr.status NOT IN ('CLOSED','RESOLVED','CONVERTED','CANCELLED')
    `,
    availableFields: [
      { key: 'priority', label: 'Priority', type: 'text', filterable: true },
      { key: 'status', label: 'Status', type: 'text', filterable: true },
      { key: 'age_days', label: 'Age (days)', type: 'number', filterable: true },
    ],
    isSystem: true,
  },
  {
    name: 'labour_utilisation',
    label: 'Labour Utilisation',
    baseQuery: `
      SELECT u.display_name, u.email, lc.craft_code, lc.description AS craft,
             COUNT(wl.id) AS entry_count,
             COALESCE(SUM(wl.regular_hours + wl.overtime_hours), 0) AS total_hours,
             COALESCE(SUM(wl.total_cost), 0) AS total_cost
      FROM wo_labour wl
      JOIN users u ON u.id = wl.user_id
      LEFT JOIN labour_crafts lc ON lc.craft_code = wl.craft
        AND lc.tenant_id = wl.tenant_id
      WHERE wl.tenant_id = $1
      GROUP BY u.id, lc.craft_code, lc.description
    `,
    availableFields: [
      { key: 'display_name', label: 'Technician', type: 'text', filterable: true },
      { key: 'craft', label: 'Craft', type: 'text', filterable: true },
      { key: 'total_hours', label: 'Total Hours', type: 'number', filterable: true },
    ],
    isSystem: true,
  },
  {
    name: 'inventory_status',
    label: 'Inventory Status',
    baseQuery: `
      SELECT i.item_num, i.description, i.unit_of_issue, i.commodity_code,
             st.name AS storeroom,
             ib.qty_on_hand, ib.qty_reserved, ib.qty_on_order,
             ib.min_qty, ib.max_qty, ib.avg_cost,
             ib.qty_on_hand * ib.avg_cost AS stock_value,
             CASE WHEN ib.qty_on_hand <= ib.min_qty THEN 'BELOW_MIN' ELSE 'OK' END AS reorder_flag
      FROM inventory_balances ib
      JOIN items i ON i.id = ib.item_id
      JOIN storerooms st ON st.id = ib.storeroom_id
      WHERE ib.tenant_id = $1
    `,
    availableFields: [
      { key: 'item_num', label: 'Item Number', type: 'text', filterable: true },
      { key: 'storeroom', label: 'Storeroom', type: 'text', filterable: true },
      { key: 'reorder_flag', label: 'Reorder Flag', type: 'text', filterable: true },
      { key: 'stock_value', label: 'Stock Value', type: 'number', filterable: true },
    ],
    isSystem: true,
  },
  {
    name: 'inventory_transactions',
    label: 'Inventory Transactions',
    baseQuery: `
      SELECT it.tx_type, it.qty, it.unit_cost, it.total_cost, it.tx_date, it.reference_num,
             i.item_num, i.description AS item_description,
             st.name AS storeroom,
             wo.wo_num,
             u.display_name AS transacted_by
      FROM inventory_transactions it
      JOIN items i ON i.id = it.item_id
      JOIN storerooms st ON st.id = it.storeroom_id
      LEFT JOIN work_orders wo ON wo.id = it.wo_id
      LEFT JOIN users u ON u.id = it.user_id
      WHERE it.tenant_id = $1
    `,
    availableFields: [
      { key: 'tx_type', label: 'Transaction Type', type: 'text', filterable: true },
      { key: 'item_num', label: 'Item Number', type: 'text', filterable: true },
      { key: 'tx_date', label: 'Date', type: 'date', filterable: true },
    ],
    isSystem: true,
  },
  {
    name: 'permit_status',
    label: 'Permit Status',
    baseQuery: `
      SELECT p.permit_num, p.type, p.status, p.valid_from, p.valid_to,
             wo.wo_num, a.asset_num,
             u.display_name AS issued_by
      FROM permits p
      LEFT JOIN work_orders wo ON wo.id = p.wo_id
      LEFT JOIN assets a ON a.id = p.asset_id
      LEFT JOIN users u ON u.id = p.issued_by_user_id
      WHERE p.tenant_id = $1
    `,
    availableFields: [
      { key: 'type', label: 'Permit Type', type: 'text', filterable: true },
      { key: 'status', label: 'Status', type: 'text', filterable: true },
      { key: 'valid_to', label: 'Expiry', type: 'date', filterable: true },
    ],
    isSystem: true,
  },
  {
    name: 'asset_cost_history',
    label: 'Asset Cost History',
    baseQuery: `
      SELECT a.asset_num, a.description, a.criticality,
             DATE_TRUNC('month', wo.actual_finish_date) AS month,
             COUNT(wo.id) AS wo_count,
             SUM(wo.labor_cost) AS labor_cost,
             SUM(wo.material_cost) AS material_cost,
             SUM(wo.total_cost) AS total_cost
      FROM assets a
      JOIN work_orders wo ON wo.asset_id = a.id AND wo.status = 'CLOSE'
      WHERE a.tenant_id = $1
        AND wo.actual_finish_date IS NOT NULL
      GROUP BY a.id, DATE_TRUNC('month', wo.actual_finish_date)
      ORDER BY month DESC
    `,
    availableFields: [
      { key: 'asset_num', label: 'Asset Number', type: 'text', filterable: true },
      { key: 'month', label: 'Month', type: 'date', filterable: true },
      { key: 'total_cost', label: 'Total Cost', type: 'number', filterable: true },
    ],
    isSystem: true,
  },
  {
    name: 'audit_trail',
    label: 'Audit Trail',
    baseQuery: `
      SELECT al.entity_type, al.entity_id, al.action, al.changes,
             al.created_at,
             u.display_name AS performed_by, u.email
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.user_id
      WHERE al.tenant_id = $1
        AND al.entity_type IN ('ServiceRequest','WorkOrder','Asset','Permit','InventoryTransaction')
    `,
    availableFields: [
      { key: 'entity_type', label: 'Entity Type', type: 'text', filterable: true },
      { key: 'action', label: 'Action', type: 'text', filterable: true },
      { key: 'created_at', label: 'Date', type: 'date', filterable: true },
      { key: 'performed_by', label: 'Performed By', type: 'text', filterable: true },
    ],
    isSystem: true,
  },
] as const;

export type EamReportSubjectName = (typeof EAM_REPORT_SUBJECTS)[number]['name'];
