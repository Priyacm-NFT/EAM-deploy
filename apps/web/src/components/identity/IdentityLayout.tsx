import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface IdentityPageLayoutProps {
  title: string;
  subtitle?: string;
  backTo?: string;
  backLabel?: string;
  children: ReactNode;
}

export function IdentityPageLayout({
  title,
  subtitle,
  backTo,
  backLabel = 'Back to list',
  children,
}: IdentityPageLayoutProps) {
  return (
    <div className="w-full space-y-5">
      {backTo && (
        <Link to={backTo} className="inline-flex items-center gap-1.5 text-white/60 hover:text-white text-xs font-medium transition-colors">
          ← {backLabel}
        </Link>
      )}
      <div>
        <h1 className="text-xl font-semibold text-white">{title}</h1>
        {subtitle ? <p className="text-sm text-white/60 mt-1">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}

interface FormFieldProps {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
}

export function FormField({ label, htmlFor, hint, children }: FormFieldProps) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="form-label">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-500 mt-1">{hint}</span>}
    </label>
  );
}

export function FormActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-3 pt-2">{children}</div>;
}

export function MessageBanner({ type, text }: { type: 'error' | 'success'; text: string }) {
  const styles =
    type === 'error'
      ? 'text-red-700 bg-red-50 border-red-200'
      : 'text-green-800 bg-green-50 border-green-200';
  return <p className={`text-sm border rounded px-3 py-2 ${styles}`}>{text}</p>;
}


