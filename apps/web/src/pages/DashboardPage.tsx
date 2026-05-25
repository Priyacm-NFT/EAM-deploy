export function DashboardPage() {
  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm text-slate-500">My Open SRs</p>
          <p className="text-3xl font-bold">0</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm text-slate-500">Open Work Orders</p>
          <p className="text-3xl font-bold">0</p>
        </div>
      </div>
    </div>
  );
}
