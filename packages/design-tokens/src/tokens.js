// Design tokens — Swiss grid discipline, editorial typography, clinical
// restraint.
//
// THE IDEA
//
// Swiss/International Typographic Style gives the structure: a strict
// grid, hairline rules instead of boxes, flush-left ragged-right text,
// and information ordered by hierarchy rather than decoration. Editorial
// design gives the voice: a high-contrast serif for display, generous
// scale jumps, and metadata treated as a designed element rather than
// leftover text.
//
// The medical register is carried by restraint, not by iconography.
// There are no cross symbols and no hospital blue. Instead: a single
// serious red used only where blood is literally the subject, monospace
// for anything measured, and a lot of white space — which is what
// clinical documents actually look like.

// ------------------------------------------------------------------
// COLOUR
//
// One accent, two greys, one paper. A Swiss palette earns its restraint:
// when red appears it means blood, urgency, or shortfall, and nothing
// else. Used for decoration it would stop meaning anything.
// ------------------------------------------------------------------
export const colors = {
  // Warm off-white. Pure #FFF reads as a web app; this reads as stock.
  paper: '#FBFAF7',
  paperRaised: '#FFFFFF',
  // Ink, not black. Slightly warm so it sits with the paper.
  ink: '#14110F',
  inkMuted: '#6E6A65',
  inkFaint: '#9C9791',

  // The one accent. Deep and desaturated - arterial rather than alarm.
  blood: '#A4161A',
  bloodDeep: '#6E0D10',
  bloodWash: '#FBEEEE',

  // Structure. Hairlines carry the layout, so they are tokens, not
  // afterthoughts.
  rule: 'rgba(20, 17, 15, 0.14)',
  ruleStrong: 'rgba(20, 17, 15, 0.30)',
  ruleFaint: 'rgba(20, 17, 15, 0.07)',

  // Status. Muted deliberately: on a clinical screen a bright green
  // "success" competes with the one colour that should be loud.
  positive: '#1F6F43',
  positiveWash: '#EDF5F0',
  caution: '#8A5A00',
  cautionWash: '#FBF3E4',
  critical: '#A4161A',
  criticalWash: '#FBEEEE',
};

// ------------------------------------------------------------------
// TYPE
//
// Three families, each with one job:
//   Instrument Serif — display only. The editorial voice.
//   Inter            — everything read as prose or interface.
//   IBM Plex Mono    — anything measured, labelled, or identified.
//
// The mono is where the medical register lives. Lab reports, specimen
// labels and dosage charts are all monospaced, and using it for units,
// blood groups and timestamps makes data read as data.
// ------------------------------------------------------------------
export const fonts = {
  display: "'Instrument Serif', 'Times New Roman', serif",
  sans: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
  mono: "'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace",
};

// A modular-ish scale with real jumps. Swiss layouts fail when every
// size is nearly the same; hierarchy has to be visible at a glance.
export const fontSizes = {
  micro: 11,   // tracked uppercase labels
  tiny: 12,
  small: 13,
  base: 15,
  lead: 17,    // standfirst / intro paragraphs
  h4: 20,
  h3: 26,
  h2: 34,
  h1: 46,
  display: 64, // the one big number or title on a page
  mega: 88,    // hero only
};

// ------------------------------------------------------------------
// SPACE
//
// An 8pt system. Swiss grids depend on consistent rhythm far more than
// on any particular measurement.
// ------------------------------------------------------------------
export const spacing = {
  '0': 0,
  px: 1,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 40,
  '2xl': 64,
  '3xl': 96,
  '4xl': 140,
};

// Corners stay nearly square. Rounded rectangles read as consumer
// software; this should read as an instrument.
export const radii = { none: 0, sm: 2, md: 3, lg: 4, full: 9999 };

export const layout = {
  // The measure. Long-form text becomes unreadable past ~70 characters.
  measure: '68ch',
  gutter: 24,
  maxWidth: 1240,
};

export default { colors, fonts, fontSizes, spacing, radii, layout };
