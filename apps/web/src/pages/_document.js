import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/*
          Instrument Serif — display only, the editorial voice.
          Inter — interface and prose.
          IBM Plex Mono — anything measured or labelled; this is where
          the clinical register comes from.
        */}
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <meta name="theme-color" content="#FBFAF7" />
      </Head>
      <body className="bg-paper text-ink antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
