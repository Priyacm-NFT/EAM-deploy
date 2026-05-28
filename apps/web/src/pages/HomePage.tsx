import { Link } from 'react-router-dom';

export function HomePage() {
  return (
    <div
      className="fixed inset-0 overflow-y-auto"
      style={{
        background: 'linear-gradient(160deg, #061528 0%, #0a1f42 35%, #0f2d5e 70%, #123a72 100%)',
        backgroundAttachment: 'fixed',
      }}
    >
      {/* Ambient glow effects */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(249,115,22,0.18), transparent)',
        }}
      />
      <div
        className="pointer-events-none fixed bottom-0 left-0 w-[600px] h-[600px]"
        style={{
          background: 'radial-gradient(circle, rgba(59,130,246,0.08), transparent 70%)',
        }}
      />

      {/* Top nav */}
      <header className="relative z-10 flex items-center justify-between px-8 py-5 border-b border-white/8">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}
          >
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M11.644 1.59a.75.75 0 01.712 0l9.75 5.25a.75.75 0 010 1.32l-9.75 5.25a.75.75 0 01-.712 0l-9.75-5.25a.75.75 0 010-1.32l9.75-5.25z" />
              <path d="M3.265 10.602l7.668 4.129a2.25 2.25 0 002.134 0l7.668-4.13 1.37.739a.75.75 0 010 1.32l-9.75 5.25a.75.75 0 01-.71 0l-9.75-5.25a.75.75 0 010-1.32l1.37-.738z" />
              <path d="M10.933 19.231l-7.668-4.13-1.37.739a.75.75 0 000 1.32l9.75 5.25c.221.12.489.12.71 0l9.75-5.25a.75.75 0 000-1.32l-1.37-.738-7.668 4.13a2.25 2.25 0 01-2.134-.001z" />
            </svg>
          </div>
          <span className="text-white font-bold text-lg tracking-wide">
            EAM Platform
          </span>
        </div>

        <nav className="flex items-center gap-3">
          <Link
            to="/login"
            className="text-white/75 hover:text-white text-sm font-medium px-5 py-2 border border-white/20 hover:border-white/40 transition-all no-underline"
            style={{ letterSpacing: '0.04em' }}
          >
            Sign In
          </Link>
          <Link
            to="/register"
            className="text-white text-sm font-semibold px-5 py-2 transition-all no-underline"
            style={{
              background: 'linear-gradient(135deg, #f97316, #ea580c)',
              letterSpacing: '0.04em',
            }}
          >
            Get Started
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <main className="relative z-10">
        <section className="max-w-6xl mx-auto px-8 pt-24 pb-20">
          {/* Eyebrow */}
          <div className="flex items-center gap-3 mb-8">
            <div className="h-px w-10 bg-orange-500" />
            <span
              className="text-xs font-semibold tracking-widest uppercase"
              style={{ color: '#f97316' }}
            >
              Enterprise Asset Management
            </span>
          </div>

          {/* Headline */}
          <div className="max-w-3xl mb-8">
            <h1
              className="text-6xl font-black text-white leading-[1.05] tracking-tight"
              style={{ fontFamily: "'Georgia', serif" }}
            >
              Operate Smarter.
              <br />
              <span
                style={{
                  WebkitTextStroke: '2px #f97316',
                  color: 'transparent',
                }}
              >
                Manage Everything.
              </span>
            </h1>
          </div>

          <p className="text-blue-200/80 text-lg max-w-xl leading-relaxed mb-12">
            A unified platform for enterprise maintenance, work orders, ERP integrations,
            and real-time operational reporting — built for scale.
          </p>

          {/* CTA Buttons */}
          <div className="flex items-center gap-4 flex-wrap mb-20">
            <Link
              to="/register"
              className="inline-flex items-center gap-2 text-white text-sm font-bold px-8 py-3.5 transition-all no-underline"
              style={{
                background: 'linear-gradient(135deg, #f97316, #ea580c)',
                boxShadow: '0 6px 24px rgba(249,115,22,0.4)',
                letterSpacing: '0.04em',
              }}
            >
              Start for Free
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 text-white/80 hover:text-white text-sm font-medium px-8 py-3.5 border border-white/25 hover:border-white/50 transition-all no-underline"
              style={{ letterSpacing: '0.04em' }}
            >
              Sign In
            </Link>
          </div>

        </section>

        {/* Features grid */}
        <section className="max-w-6xl mx-auto px-8 pb-24">
          <div className="flex items-center gap-3 mb-10">
            <div className="h-px w-10 bg-orange-500" />
            <span
              className="text-xs font-semibold tracking-widest uppercase"
              style={{ color: '#f97316' }}
            >
              Core Capabilities
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-white/10">
            {[
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="#f97316" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
                  </svg>
                ),
                title: 'Work Orders',
                desc: 'Create, assign, and track maintenance tasks with full audit history.',
              },
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="#f97316" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                  </svg>
                ),
                title: 'Analytics',
                desc: 'Real-time dashboards for uptime, costs, and performance KPIs.',
              },
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="#f97316" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                  </svg>
                ),
                title: 'ERP Integration',
                desc: 'Connect SAP, Oracle, and other enterprise systems seamlessly.',
              },
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="#f97316" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                ),
                title: 'Role-based Access',
                desc: 'Fine-grained permissions, SSO, MFA, and full identity management.',
              },
            ].map((f) => (
              <div
                key={f.title}
                className="bg-white/3 hover:bg-white/6 transition-all p-8 group"
                style={{ backdropFilter: 'blur(8px)' }}
              >
                <div className="mb-5">{f.icon}</div>
                <h3 className="text-white text-sm font-bold tracking-wide uppercase mb-2">
                  {f.title}
                </h3>
                <p className="text-blue-200/60 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Footer CTA */}
        <section
          className="border-t border-white/10 py-12 px-8"
          style={{ background: 'rgba(6,21,40,0.5)' }}
        >
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <p className="text-white font-bold text-lg">Ready to modernise your operations?</p>
              <p className="text-blue-200/60 text-sm mt-1">
                Get started in minutes. No credit card required.
              </p>
            </div>
            <Link
              to="/register"
              className="shrink-0 inline-flex items-center gap-2 text-white text-sm font-bold px-8 py-3 no-underline transition-all"
              style={{
                background: 'linear-gradient(135deg, #f97316, #ea580c)',
                boxShadow: '0 4px 20px rgba(249,115,22,0.35)',
              }}
            >
              Create Free Account
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}


