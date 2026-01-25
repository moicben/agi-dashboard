import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
    return (
        <Html lang="fr">
            <Head>
                <meta name="theme-color" content="#667eea" />
                {/* Safari cache très agressivement les favicons :
                   on "bust" l'URL et on déclare explicitement les tailles (le PNG est 800x800). */}
                <link rel="icon" type="image/png" sizes="800x800" href="/favicon.png?v=dashboard-1" />
                <link rel="shortcut icon" type="image/png" sizes="800x800" href="/favicon.png?v=dashboard-1" />
                <link rel="apple-touch-icon" sizes="800x800" href="/favicon.png?v=dashboard-1" />
                {/* Prévoir aussi favicon normale au cas où */}
                <link rel="icon" type="image/png" sizes="16x16" href="/favicon.png" />
                <link rel="shortcut icon" type="image/png" sizes="16x16" href="/favicon.png" />
                <link rel="apple-touch-icon" sizes="16x16" href="/favicon.png" />
                <link rel="icon" type="image/png" sizes="32x32" href="/favicon.png" />
                <link rel="shortcut icon" type="image/png" sizes="32x32" href="/favicon.png" />
                <link rel="apple-touch-icon" sizes="32x32" href="/favicon.png" />
                <link rel="icon" type="image/png" sizes="48x48" href="/favicon.png" />
                <link rel="shortcut icon" type="image/png" sizes="48x48" href="/favicon.png" />
                <link rel="apple-touch-icon" sizes="48x48" href="/favicon.png" />
                <link rel="icon" type="image/png" sizes="64x64" href="/favicon.png" />
                <link rel="shortcut icon" type="image/png" sizes="64x64" href="/favicon.png" />
                <link rel="apple-touch-icon" sizes="64x64" href="/favicon.png" />
                <link rel="icon" type="image/png" sizes="128x128" href="/favicon.png" />
                <link rel="shortcut icon" type="image/png" sizes="128x128" href="/favicon.png" />
                <link rel="apple-touch-icon" sizes="128x128" href="/favicon.png" />
                <link rel="icon" type="image/png" sizes="256x256" href="/favicon.png" />
                <link rel="shortcut icon" type="image/png" sizes="256x256" href="/favicon.png" />
                <link rel="apple-touch-icon" sizes="256x256" href="/favicon.png" />
                <link rel="icon" type="image/png" sizes="512x512" href="/favicon.png" />
                <link rel="shortcut icon" type="image/png" sizes="512x512" href="/favicon.png" />
                <link rel="apple-touch-icon" sizes="512x512" href="/favicon.png" />
                <link rel="icon" type="image/png" sizes="1024x1024" href="/favicon.png" />
                <link rel="shortcut icon" type="image/png" sizes="1024x1024" href="/favicon.png" />
                <link rel="apple-touch-icon" sizes="1024x1024" href="/favicon.png" />
                <link rel="icon" type="image/png" sizes="2048x2048" href="/favicon.png" />
                <link rel="shortcut icon" type="image/png" sizes="2048x2048" href="/favicon.png" />
                <link rel="apple-touch-icon" sizes="2048x2048" href="/favicon.png" />
                <link rel="icon" type="image/png" sizes="4096x4096" href="/favicon.png" />
                <link rel="shortcut icon" type="image/png" sizes="4096x4096" href="/favicon.png" />
                <link rel="apple-touch-icon" sizes="4096x4096" href="/favicon.png" />
            </Head>
            <body>
                <Main />
                <NextScript />
            </body>
        </Html>
    );
}
