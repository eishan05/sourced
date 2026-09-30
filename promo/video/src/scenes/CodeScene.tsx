import {ReactNode} from 'react';
import {AbsoluteFill, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {copy} from '../copy';
import {springConfig, theme} from '../theme';

const colors = {
  keyword: theme.accent,
  string: '#A5B4FC',
  identifier: theme.text,
  punctuation: theme.quiet,
  comment: theme.codeComment,
} as const;

const Token = ({kind, children}: {kind: keyof typeof colors; children: ReactNode}) => (
  <span style={{color: colors[kind]}}>{children}</span>
);

const CodeCard = ({
  path,
  delaySeconds,
  height,
  children,
}: {
  path: string;
  delaySeconds: number;
  height: number;
  children: ReactNode;
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const entrance = spring({
    frame: frame - delaySeconds * fps,
    fps,
    config: springConfig,
    durationInFrames: fps,
  });

  return (
    <div
      style={{
        width: '100%',
        height,
        boxSizing: 'border-box',
        padding: '34px 36px',
        border: `1px solid ${theme.hairline}`,
        borderRadius: 20,
        backgroundColor: '#0D0D11',
        opacity: entrance,
        transform: `translateY(${(1 - entrance) * 22}px)`,
      }}
    >
      <div
        style={{
          marginBottom: 28,
          color: theme.quiet,
          fontFamily: theme.mono,
          fontSize: 22,
          fontWeight: 500,
          lineHeight: 1.2,
        }}
      >
        {path}
      </div>
      <pre
        style={{
          margin: 0,
          whiteSpace: 'pre',
          color: theme.text,
          fontFamily: theme.mono,
          fontSize: 26,
          fontWeight: 500,
          lineHeight: 1.42,
          letterSpacing: '-0.02em',
        }}
      >
        {children}
      </pre>
    </div>
  );
};

export const CodeScene = () => (
  <AbsoluteFill
    style={{
      boxSizing: 'border-box',
      justifyContent: 'center',
      padding: '0 120px',
    }}
  >
    <div>
      <div
        style={{
          color: theme.text,
          fontFamily: theme.inter,
          fontSize: 56,
          fontWeight: 700,
          lineHeight: 1.08,
          letterSpacing: '-0.025em',
        }}
      >
        {copy.codeHeadline}
      </div>
      <div style={{display: 'flex', gap: 24, marginTop: 42}}>
        <CodeCard path={copy.code.clientPath} delaySeconds={0.27} height={590}>
          <Token kind="keyword">const</Token> <Token kind="identifier">api</Token>{' '}
          <Token kind="punctuation">=</Token> <Token kind="identifier">useAIForm</Token>
          <Token kind="punctuation">({'{'}</Token>
          {'\n  '}
          <Token kind="identifier">form</Token>
          <Token kind="punctuation">,</Token>
          {'\n  '}
          <Token kind="identifier">transport</Token>
          <Token kind="punctuation">,</Token>
          {'\n  '}
          <Token kind="identifier">onSubmit</Token>
          <Token kind="punctuation">,</Token>
          {'\n'}
          <Token kind="punctuation">{'}'});</Token>
          {'\n\n'}
          <Token kind="keyword">return</Token> <Token kind="punctuation">(</Token>
          {'\n  '}
          <Token kind="punctuation">&lt;</Token>
          <Token kind="identifier">AIFormProvider</Token>{' '}
          <Token kind="identifier">api</Token>
          <Token kind="punctuation">={'{'}</Token>
          <Token kind="identifier">api</Token>
          <Token kind="punctuation">{'}'}&gt;</Token>
          {'\n    '}
          <Token kind="punctuation">&lt;</Token>
          <Token kind="identifier">KitForm</Token>{' '}
          <Token kind="punctuation">/&gt;</Token>
          {'\n  '}
          <Token kind="punctuation">&lt;/</Token>
          <Token kind="identifier">AIFormProvider</Token>
          <Token kind="punctuation">&gt;</Token>
          {'\n'}
          <Token kind="punctuation">);</Token>
        </CodeCard>
        <CodeCard path={copy.code.serverPath} delaySeconds={0.67} height={590}>
          <Token kind="keyword">export const</Token>{' '}
          <Token kind="punctuation">{'{'}</Token>{' '}
          <Token kind="identifier">POST</Token>{' '}
          <Token kind="punctuation">{'}'} =</Token>{' '}
          <Token kind="identifier">createNextFillRoute</Token>
          <Token kind="punctuation">({'{'}</Token>
          {'\n  '}
          <Token kind="identifier">adapter</Token>
          <Token kind="punctuation">:</Token>{' '}
          <Token kind="identifier">createOpenRouterAdapter</Token>
          <Token kind="punctuation">(),</Token>
          {'\n'}
          <Token kind="punctuation">{'}'});</Token>
        </CodeCard>
      </div>
    </div>
  </AbsoluteFill>
);
