// Tailwind, driven by the shared design tokens.
//
// packages/design-tokens has existed since the repo was scaffolded but
// nothing consumed it - the three legacy views hardcoded hex values in
// inline style objects. Wiring it here makes it the single source of
// truth for colour and spacing across web and (later) mobile.

const { colors, spacing, radii, fontSizes } = require('@rednexus/design-tokens');

const px = (obj) =>
  Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, `${v}px`]));

module.exports = {
  content: ['./src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: colors.primary,
          light: colors.primaryLight,
          dark: colors.primaryDark,
        },
        secondary: colors.secondary,
        surface: colors.surface,
        canvas: colors.background,
        danger: colors.error,
        success: colors.success,
        warning: colors.warning,
        ink: {
          DEFAULT: colors.text.primary,
          muted: colors.text.secondary,
          disabled: colors.text.disabled,
          inverse: colors.text.inverse,
        },
      },
      spacing: px(spacing),
      borderRadius: px(radii),
      fontSize: px(fontSizes),
    },
  },
  plugins: [],
};
