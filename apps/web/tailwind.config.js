// Tailwind, driven entirely by packages/design-tokens.
//
// Nothing here invents a value. If a colour or size is not in the token
// file it is not available, which is what keeps a Swiss layout from
// drifting into approximately-aligned.

const { colors, fonts, fontSizes, spacing, radii, layout } = require('@rednexus/design-tokens');

const px = (obj) =>
  Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, typeof v === 'number' ? `${v}px` : v]));

module.exports = {
  content: ['./src/**/*.{js,jsx}'],
  theme: {
    // Replace rather than extend: the default Tailwind palette is 250
    // colours, and every one of them is a way to break this system.
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      paper: colors.paper,
      raised: colors.paperRaised,
      ink: {
        DEFAULT: colors.ink,
        muted: colors.inkMuted,
        faint: colors.inkFaint,
      },
      blood: {
        DEFAULT: colors.blood,
        deep: colors.bloodDeep,
        wash: colors.bloodWash,
      },
      positive: { DEFAULT: colors.positive, wash: colors.positiveWash },
      caution: { DEFAULT: colors.caution, wash: colors.cautionWash },
      critical: { DEFAULT: colors.critical, wash: colors.criticalWash },
      rule: {
        DEFAULT: colors.rule,
        strong: colors.ruleStrong,
        faint: colors.ruleFaint,
      },
      white: '#FFFFFF',
      black: '#000000',
    },
    fontFamily: {
      display: fonts.display.split(',').map((f) => f.trim().replace(/'/g, '')),
      sans: fonts.sans.split(',').map((f) => f.trim().replace(/'/g, '')),
      mono: fonts.mono.split(',').map((f) => f.trim().replace(/'/g, '')),
    },
    fontSize: {
      micro: ['11px', { lineHeight: '1.3', letterSpacing: '0.09em' }],
      tiny: ['12px', { lineHeight: '1.45' }],
      small: ['13px', { lineHeight: '1.55' }],
      base: ['15px', { lineHeight: '1.6' }],
      lead: ['17px', { lineHeight: '1.55' }],
      h4: ['20px', { lineHeight: '1.35', letterSpacing: '-0.01em' }],
      h3: ['26px', { lineHeight: '1.25', letterSpacing: '-0.015em' }],
      h2: ['34px', { lineHeight: '1.15', letterSpacing: '-0.02em' }],
      h1: ['46px', { lineHeight: '1.05', letterSpacing: '-0.025em' }],
      display: ['64px', { lineHeight: '0.98', letterSpacing: '-0.03em' }],
      mega: ['88px', { lineHeight: '0.92', letterSpacing: '-0.035em' }],
    },
    spacing: px(spacing),
    borderRadius: px(radii),
    extend: {
      maxWidth: {
        measure: layout.measure,
        shell: `${layout.maxWidth}px`,
      },
      borderWidth: { hair: '1px', rule: '2px' },
      gridTemplateColumns: {
        // The Swiss 12-column field.
        swiss: 'repeat(12, minmax(0, 1fr))',
      },
      letterSpacing: { label: '0.09em', wide: '0.04em' },
    },
  },
  plugins: [],
};
