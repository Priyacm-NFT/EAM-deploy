import { Link } from 'react-router-dom';

export function HomePage() {
  return (
    <div className="max-w-3xl mx-auto text-center space-y-8 py-16">
      <div className="content-card">
        <h1 className="text-4xl font-bold text-primary mb-4">Enterprise Asset Management</h1>
        <p className="text-lg text-slate-600 mb-8">
          Phase 0 foundations — identity, config, workflow, integrations, and more.
        </p>
        <div className="flex gap-4 justify-center flex-wrap">
          <Link
            to="/register"
            className="bg-accent hover:bg-accent-dark text-white font-medium py-2.5 px-8 rounded-md transition-colors shadow-lg shadow-accent/25"
          >
            Get started
          </Link>
          <Link
            to="/login"
            className="border-2 border-primary text-primary hover:bg-primary hover:text-white font-medium py-2.5 px-8 rounded-md transition-colors"
          >
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
