const DEV_ADMIN_EMAIL = 'admin@eam.local';
const DEV_ADMIN_PASSWORD = 'AdminPass1!';

export function AdminAccessBanner() {
  return (
    <div className="auth-card max-w-2xl border-amber-200 bg-amber-50 text-amber-950 space-y-3">
      <h2 className="text-lg font-semibold">Admin access required</h2>
      <p className="text-sm">
        Identity management (Users, Groups, Roles, SSO) requires the{' '}
        <code className="text-xs bg-white px-1 rounded">admin:users:manage</code> permission.
        Regular registered accounts do not have this.
      </p>
      <div className="text-sm space-y-1">
        <p className="font-medium">For local development, sign in as the seeded admin:</p>
        <ul className="list-disc pl-5">
          <li>
            Email: <strong>{DEV_ADMIN_EMAIL}</strong>
          </li>
          <li>
            Password: <strong>{DEV_ADMIN_PASSWORD}</strong>
          </li>
        </ul>
      </div>
      <p className="text-xs text-amber-800">
        Log out first, then sign in with those credentials. If login fails, restart the API so it
        creates the dev admin user, or run <code className="bg-white px-1 rounded">pnpm db:seed</code>.
      </p>
    </div>
  );
}
