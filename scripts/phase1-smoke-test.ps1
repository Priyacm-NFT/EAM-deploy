# Phase 1 EAM Core MVP — manual API smoke test (PRD §12.1)
# Prerequisites: API running on http://localhost:3000, db seeded (default tenant)
# Usage:  .\scripts\phase1-smoke-test.ps1

$ErrorActionPreference = 'Stop'
$BaseUrl = if ($env:EAM_API_URL) { $env:EAM_API_URL } else { 'http://localhost:3000' }
$TenantSlug = if ($env:EAM_TENANT_SLUG) { $env:EAM_TENANT_SLUG } else { 'default' }
$Email = if ($env:DEV_ADMIN_EMAIL) { $env:DEV_ADMIN_EMAIL } else { 'admin@eam.local' }
$Password = if ($env:DEV_ADMIN_PASSWORD) { $env:DEV_ADMIN_PASSWORD } else { 'AdminPass1!' }

function ConvertTo-JsonBody([object]$Body) {
  if ($Body -is [hashtable]) {
    $Body = [PSCustomObject]$Body
  }
  return ($Body | ConvertTo-Json -Depth 6 -Compress)
}

function Invoke-Eam {
  param([string]$Method, [string]$Path, [object]$Body, [hashtable]$Headers = @{})
  $params = @{
    Uri = "$BaseUrl$Path"
    Method = $Method
    Headers = $Headers
  }
  if ($null -ne $Body) {
    $params.ContentType = 'application/json'
    $params.Body = ConvertTo-JsonBody $Body
  }
  return Invoke-RestMethod @params
}

Write-Host "=== Phase 1 Smoke Test ===" -ForegroundColor Cyan
Write-Host "API: $BaseUrl  Tenant: $TenantSlug"

# Auth
$login = Invoke-Eam POST '/auth/login' @{ tenantSlug = $TenantSlug; email = $Email; password = $Password }
$token = $login.accessToken
$auth = @{ Authorization = "Bearer $token" }
Write-Host "[OK] Login" -ForegroundColor Green

# Resolve reference IDs from seeded data
$locations = Invoke-Eam GET '/locations?flat=true' $null $auth
$siteId = $locations[0].siteId
$locationId = $locations[0].id
$orgId = $locations[0].orgId

# P1-1 Asset
$asset = Invoke-Eam POST '/assets' @{
  assetNum = "SMOKE-$(Get-Date -Format 'HHmmss')"
  description = 'Smoke test pump'
  siteId = $siteId
  locationId = $locationId
  status = 'OPERATING'
} $auth
Write-Host "[OK] Asset created: $($asset.assetNum)" -ForegroundColor Green

# P1-2 Service Request
$sr = Invoke-Eam POST '/service-requests' @{
  description = 'Smoke test SR - unusual noise'
  priority = 'HIGH'
  assetId = $asset.id
  locationId = $locationId
  siteId = $siteId
} $auth
Invoke-Eam POST "/service-requests/$($sr.id)/transition" @{ toStatus = 'QUEUED' } $auth | Out-Null
Invoke-Eam POST "/service-requests/$($sr.id)/transition" @{ toStatus = 'IN_PROGRESS' } $auth | Out-Null
$wo = Invoke-Eam POST "/service-requests/$($sr.id)/convert" @{ type = 'CM' } $auth
Write-Host "[OK] SR $($sr.srNum) converted to WO $($wo.woNum)" -ForegroundColor Green

# P1-3 Work Order lifecycle
Invoke-Eam POST "/work-orders/$($wo.id)/transition" @{ toStatus = 'APPR' } $auth | Out-Null
Invoke-Eam POST "/work-orders/$($wo.id)/transition" @{ toStatus = 'INPRG' } $auth | Out-Null
Invoke-Eam POST "/work-orders/$($wo.id)/transition" @{ toStatus = 'COMP' } $auth | Out-Null
Invoke-Eam POST "/work-orders/$($wo.id)/close" @{ closureNotes = 'Smoke test complete' } $auth | Out-Null
Write-Host "[OK] WO closed" -ForegroundColor Green

# P1-4 Job Plan + PM
$jp = Invoke-Eam POST '/job-plans' @{ description = 'Smoke inspection plan' } $auth
$pm = Invoke-Eam POST '/pm-masters' @{
  description = 'Smoke monthly PM'
  assetId = $asset.id
  siteId = $siteId
  jobPlanId = $jp.id
  frequencyType = 'CALENDAR'
  interval = 1
  intervalUnit = 'MONTH'
} $auth
Write-Host "[OK] PM $($pm.pmNum) created" -ForegroundColor Green

# P1-5 Permit
$permit = Invoke-Eam POST '/permits' @{
  type = 'GENERAL'
  woId = $wo.id
  assetId = $asset.id
  locationId = $locationId
} $auth
$checklist = Invoke-Eam GET "/permits/$($permit.id)/checklist" $null $auth
foreach ($item in $checklist) {
  if ($item.isRequired) {
    Invoke-Eam PUT "/permits/$($permit.id)/checklist/$($item.id)" @{ checked = $true } $auth | Out-Null
  }
}
Invoke-Eam POST "/permits/$($permit.id)/submit" $null $auth | Out-Null
$approved = Invoke-Eam POST "/permits/$($permit.id)/approve" @{ comments = 'Approved in smoke test' } $auth
Write-Host "[OK] Permit $($permit.permitNum) approved (status: $($approved.status))" -ForegroundColor Green

# P1-6 Inventory
$item = Invoke-Eam POST '/items' @{ itemNum = "SMK-$(Get-Date -Format 'HHmmss')"; description = 'Smoke test part' } $auth
$storeroom = Invoke-Eam POST '/storerooms' @{ storeroomNum = "SMK-$(Get-Date -Format 'HHmmss')"; name = 'Smoke Storeroom'; siteId = $siteId } $auth
Invoke-Eam POST '/inventory/receipt' @{ itemId = $item.id; storeroomId = $storeroom.id; qty = '5' } $auth | Out-Null
Invoke-Eam POST '/inventory/issue' @{ itemId = $item.id; storeroomId = $storeroom.id; qty = '1'; woId = $wo.id } $auth | Out-Null
Write-Host "[OK] Inventory receipt + issue" -ForegroundColor Green

# P1-7 Labour
$crafts = Invoke-Eam GET '/labour-crafts' $null $auth
Write-Host "[OK] Labour crafts: $($crafts.Count)" -ForegroundColor Green

# P1-8 Reporting
$subjects = Invoke-Eam GET '/reports/subjects' $null $auth
Write-Host "[OK] Report subjects: $($subjects.Count)" -ForegroundColor Green

Write-Host "`n=== All Phase 1 smoke checks passed ===" -ForegroundColor Cyan
