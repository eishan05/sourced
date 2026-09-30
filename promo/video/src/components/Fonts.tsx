import {staticFile} from 'remotion';

export const Fonts = () => (
  <style>{`
    @font-face {
      font-family: 'Inter';
      src: url('${staticFile('fonts/inter-latin.woff2')}') format('woff2');
      font-style: normal;
      font-weight: 100 900;
      font-display: block;
    }
    @font-face {
      font-family: 'JetBrains Mono';
      src: url('${staticFile('fonts/jetbrains-mono-latin.woff2')}') format('woff2');
      font-style: normal;
      font-weight: 100 800;
      font-display: block;
    }
  `}</style>
);
