import {fontFamily as interName} from '@remotion/google-fonts/Inter';
import {fontFamily as jetBrainsName} from '@remotion/google-fonts/JetBrainsMono';

export const theme = {
  background: '#08080B',
  text: '#FAFAF9',
  secondary: '#A1A1AA',
  accent: '#818CF8',
  accentStrong: '#6366F1',
  hairline: '#27272A',
  quiet: '#71717A',
  codeComment: '#52525B',
  inter: `${interName}, Arial, Helvetica, sans-serif`,
  mono: `${jetBrainsName}, "SFMono-Regular", Consolas, "Liberation Mono", monospace`,
  safe: 96,
} as const;

export const type = {
  headline: {
    fontFamily: theme.inter,
    fontSize: 78,
    fontWeight: 700,
    letterSpacing: '-0.025em',
    lineHeight: 1.05,
  },
  caption: {
    fontFamily: theme.inter,
    fontSize: 40,
    fontWeight: 500,
    lineHeight: 1.18,
  },
  sub: {
    fontFamily: theme.inter,
    fontSize: 32,
    fontWeight: 400,
    lineHeight: 1.25,
  },
  eyebrow: {
    fontFamily: theme.mono,
    fontSize: 24,
    fontWeight: 500,
    letterSpacing: '0.2em',
    lineHeight: 1.2,
    textTransform: 'uppercase' as const,
  },
} as const;

export const springConfig = {
  damping: 200,
  stiffness: 120,
  mass: 1,
} as const;
