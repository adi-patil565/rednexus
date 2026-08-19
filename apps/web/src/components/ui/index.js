import React from 'react';

export const Card = ({ children, className = '' }) => (
  <div className={`rounded-lg border border-black/10 bg-surface p-lg shadow-sm ${className}`}>
    {children}
  </div>
);

export const Button = ({ variant = 'primary', className = '', disabled, children, ...rest }) => {
  const base =
    'inline-flex items-center justify-center rounded-md px-md py-sm text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed';
  const styles = {
    primary: 'bg-primary text-ink-inverse hover:bg-primary-dark',
    secondary: 'border border-black/15 bg-surface text-ink hover:bg-canvas',
    ghost: 'text-ink-muted hover:text-ink',
  };
  return (
    <button className={`${base} ${styles[variant]} ${className}`} disabled={disabled} {...rest}>
      {children}
    </button>
  );
};

export const Badge = ({ tone = 'neutral', children }) => {
  const tones = {
    neutral: 'bg-black/5 text-ink-muted',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/15 text-[#8a6100]',
    danger: 'bg-danger/10 text-danger',
    info: 'bg-secondary/10 text-secondary',
  };
  return (
    <span className={`inline-block rounded-full px-sm py-[2px] text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
};

export const Spinner = ({ label = 'Loading' }) => (
  <div className="flex items-center gap-sm text-sm text-ink-muted" role="status">
    <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/20 border-t-primary" />
    {label}
  </div>
);

export const Alert = ({ tone = 'info', title, children }) => {
  const tones = {
    info: 'border-secondary/30 bg-secondary/5',
    warning: 'border-warning/40 bg-warning/10',
    danger: 'border-danger/30 bg-danger/5',
    success: 'border-success/30 bg-success/5',
  };
  return (
    <div className={`rounded-md border p-md ${tones[tone]}`}>
      {title && <p className="mb-xs text-sm font-semibold">{title}</p>}
      <div className="text-sm text-ink-muted">{children}</div>
    </div>
  );
};
