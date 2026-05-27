export function AdminAccessBanner() {
  return (
    <div className="auth-card max-w-2xl border-amber-200 bg-amber-50 text-amber-950 space-y-3">
      <h2 className="text-lg font-semibold">Admin access required</h2>
      <p className="text-sm">
        Identity management (Users, Groups, Roles, SSO) requires the{' '}
        <code className="text-xs bg-white px-1 rounded">admin:users:manage</code> permission.
        Regular registered accounts do not have this permission by default.
      </p>
      <p className="text-sm">
        Please sign in with an account that has administrator privileges, or contact your system
        administrator to grant you the required permissions.
      </p>
    </div>
  );
}