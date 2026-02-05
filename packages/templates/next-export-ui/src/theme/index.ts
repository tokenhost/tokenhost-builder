import rawTokens from './tokens.json';

type ThemeTokens = typeof rawTokens;

export const themeTokens: ThemeTokens = rawTokens;

export function rootStyleVars(tokens: ThemeTokens = themeTokens): Record<string, string> {
  return {
    '--th-bg': tokens.colors.bg,
    '--th-bg-alt': tokens.colors.bgAlt,
    '--th-panel': tokens.colors.panel,
    '--th-panel-strong': tokens.colors.panelStrong,
    '--th-border': tokens.colors.border,
    '--th-text': tokens.colors.text,
    '--th-muted': tokens.colors.muted,
    '--th-primary': tokens.colors.primary,
    '--th-primary-strong': tokens.colors.primaryStrong,
    '--th-accent': tokens.colors.accent,
    '--th-success': tokens.colors.success,
    '--th-danger': tokens.colors.danger,
    '--th-radius-sm': tokens.radius.sm,
    '--th-radius-md': tokens.radius.md,
    '--th-radius-lg': tokens.radius.lg,
    '--th-space-xs': tokens.spacing.xs,
    '--th-space-sm': tokens.spacing.sm,
    '--th-space-md': tokens.spacing.md,
    '--th-space-lg': tokens.spacing.lg,
    '--th-space-xl': tokens.spacing.xl,
    '--th-font-display': tokens.typography.display,
    '--th-font-body': tokens.typography.body,
    '--th-font-mono': tokens.typography.mono,
    '--th-motion-fast': tokens.motion.fast,
    '--th-motion-base': tokens.motion.base
  };
}
