// UI primitives.
//
// Swiss structure, editorial type, clinical restraint. Three rules run
// through all of it:
//
//   1. Structure comes from hairline rules, not from boxes or shadows.
//      A page of floating cards reads as an admin panel; a page
//      organised by rules reads as a printed document.
//
//   2. Corners stay nearly square and nothing has a drop shadow.
//      Rounded, elevated surfaces read as consumer software. This is an
//      instrument used by people at work.
//
//   3. Red means blood, shortfall or urgency — never decoration. It is
//      the only saturated colour in the system, and it stops meaning
//      anything the moment it is used to make a button look nice.

import React from 'react';

// ------------------------------------------------------------------
// Label — the signature element.
//
// Uppercase, tracked, monospaced. It marks a field the way an
// information-design diagram does and the way a lab report does, which
// is the whole medical register of this design in one component.
// ------------------------------------------------------------------
export const Label = ({ children, className = '', as: As = 'span' }) => (
  <As className={`label ${className}`}>{children}</As>
);

// ------------------------------------------------------------------
// Panel — the card replacement.
//
// `flush` drops the padding for tables. `accent` puts a 2px rule down
// the left edge, which is how a printed document flags an item without
// resorting to a coloured background.
// ------------------------------------------------------------------
export const Panel = ({ children, className = '', accent, flush = false }) => {
  const accents = {
    blood: 'border-l-rule border-l-blood',
    caution: 'border-l-rule border-l-caution',
    positive: 'border-l-rule border-l-positive',
  };
  return (
    <div
      className={`panel ${accent ? accents[accent] : ''} ${flush ? '' : 'p-lg'} ${className}`}
    >
      {children}
    </div>
  );
};

// Kept so existing screens keep working while they are converted.
export const Card = Panel;

// ------------------------------------------------------------------
// Section — a numbered, ruled block.
//
// The Swiss device: an index number, a hairline, a title. It also does
// real work here, because most of these screens are a sequence staff
// follow in order.
// ------------------------------------------------------------------
export const Section = ({ index, title, aside, children, className = '' }) => (
  <section className={`rule-top pt-lg ${className}`}>
    <div className="mb-lg flex flex-wrap items-baseline justify-between gap-md">
      <div className="flex items-baseline gap-md">
        {index != null && <span className="index">{String(index).padStart(2, '0')}</span>}
        <h2 className="font-sans text-h4 font-semibold tracking-tight">{title}</h2>
      </div>
      {aside && <div className="label">{aside}</div>}
    </div>
    {children}
  </section>
);

// ------------------------------------------------------------------
// Button
//
// Square, flat, typographic. The primary is solid ink rather than red:
// red is reserved for meaning, and if every submit button were red the
// one that says "stock is critically low" would lose all of its force.
// `danger` exists for genuinely destructive actions only.
// ------------------------------------------------------------------
export const Button = ({
  variant = 'primary',
  size = 'md',
  className = '',
  disabled,
  children,
  ...rest
}) => {
  const base =
    'inline-flex items-center justify-center gap-sm rounded-sm font-sans font-medium ' +
    'transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40';

  const sizes = {
    sm: 'px-md py-xs text-tiny',
    md: 'px-lg py-sm text-small',
    lg: 'px-xl py-md text-base',
  };

  const variants = {
    primary: 'bg-ink text-paper hover:bg-blood',
    secondary: 'border border-hair border-rule-strong text-ink hover:border-ink hover:bg-ink hover:text-paper',
    danger: 'bg-blood text-white hover:bg-blood-deep',
    ghost: 'text-ink-muted underline decoration-rule underline-offset-4 hover:text-blood hover:decoration-blood',
  };

  return (
    <button
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  );
};

// ------------------------------------------------------------------
// Badge — a status marker, not a pill.
//
// Squared and monospaced so it reads as a stamp on a document rather
// than a tag in a web app.
// ------------------------------------------------------------------
export const Badge = ({ tone = 'neutral', children }) => {
  const tones = {
    neutral: 'border-rule-strong text-ink-muted',
    info: 'border-ink text-ink',
    success: 'border-positive text-positive bg-positive-wash',
    warning: 'border-caution text-caution bg-caution-wash',
    danger: 'border-blood text-blood bg-blood-wash',
  };
  return (
    <span
      className={`inline-block border border-hair px-sm py-[2px] font-mono text-micro uppercase tracking-label ${tones[tone]}`}
    >
      {children}
    </span>
  );
};

// ------------------------------------------------------------------
// Figure — a display statistic.
//
// The editorial move. A serif numeral at 64px carries authority a
// grotesque at the same size does not; it reads as a finding rather
// than a widget.
// ------------------------------------------------------------------
export const Figure = ({ value, label, unit, tone = 'ink', className = '' }) => {
  const tones = { ink: 'text-ink', blood: 'text-blood', muted: 'text-ink-muted' };
  return (
    <div className={className}>
      {label && <Label className="mb-sm block">{label}</Label>}
      <div className="flex items-baseline gap-sm">
        <span className={`figure ${tones[tone]}`}>{value}</span>
        {unit && <span className="font-mono text-tiny uppercase tracking-label text-ink-faint">{unit}</span>}
      </div>
    </div>
  );
};

// ------------------------------------------------------------------
// Note — the callout.
//
// A ruled block with a labelled kind, rather than a tinted box with an
// icon. Editorial sidebar, not toast notification.
// ------------------------------------------------------------------
export const Note = ({ tone = 'info', title, children, className = '' }) => {
  const tones = {
    info: 'border-l-ink',
    success: 'border-l-positive',
    warning: 'border-l-caution',
    danger: 'border-l-blood',
  };
  const kinds = { info: 'Note', success: 'Done', warning: 'Check', danger: 'Problem' };
  return (
    <div className={`border-l-rule ${tones[tone]} bg-raised py-md pl-lg pr-md ${className}`}>
      <Label className="mb-xs block">{title ?? kinds[tone]}</Label>
      <div className="max-w-measure text-small text-ink">{children}</div>
    </div>
  );
};

// Alias kept for screens not yet converted.
export const Alert = Note;

// ------------------------------------------------------------------
// Spinner — a ruled bar, not a circle.
//
// Spinning circles are consumer-app furniture. A determinate-looking
// bar suits an instrument, and it does not draw the eye the way a
// rotating shape does when it sits on screen for a while.
// ------------------------------------------------------------------
export const Spinner = ({ label = 'Loading' }) => (
  <div className="flex items-center gap-md" role="status" aria-live="polite">
    <span className="relative block h-px w-2xl overflow-hidden bg-rule">
      <span className="absolute inset-y-0 left-0 w-1/3 animate-[sweep_1.1s_ease-in-out_infinite] bg-blood" />
    </span>
    <Label>{label}</Label>
    <style jsx global>{`
      @keyframes sweep {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(300%); }
      }
    `}</style>
  </div>
);

// ------------------------------------------------------------------
// DataRow — a label/value pair on a hairline.
//
// The workhorse for the specimen-label style used across the staff
// screens.
// ------------------------------------------------------------------
export const DataRow = ({ label, value, mono = true }) => (
  <div className="flex items-baseline justify-between gap-md rule-bottom py-sm">
    <Label>{label}</Label>
    <span className={`text-small text-ink ${mono ? 'font-mono tabular' : ''}`}>{value}</span>
  </div>
);

// ------------------------------------------------------------------
// BloodGroup — the one place red is unconditional.
//
// A blood group is the single most scanned piece of information in this
// product. It gets the display serif and the accent colour, and nothing
// else competes for either.
// ------------------------------------------------------------------
export const BloodGroup = ({ children, size = 'md' }) => {
  const sizes = { sm: 'text-h4', md: 'text-h2', lg: 'text-display' };
  return (
    <span className={`font-display leading-none text-blood ${sizes[size]}`}>{children}</span>
  );
};

export default {
  Label, Panel, Card, Section, Button, Badge, Figure, Note, Alert, Spinner, DataRow, BloodGroup,
};
