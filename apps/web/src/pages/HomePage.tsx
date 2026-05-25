import { Button } from '@eam/ui';

export function HomePage() {
  return (
    <div className="max-w-lg space-y-4">
      <h1 className="text-2xl font-semibold">Enterprise Asset Management</h1>
      <p className="text-slate-600">Phase 0 foundations — identity, config, workflow, integrations, and more.</p>
      <Button>Get started</Button>
    </div>
  );
}
