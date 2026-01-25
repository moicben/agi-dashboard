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

            </Head>
            <body>
                <Main />
                <NextScript />
            </body>
        </Html>
    );
}
