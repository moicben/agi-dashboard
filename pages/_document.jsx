import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
    return (
        <Html lang="fr">
            <Head>
                <meta name="theme-color" content="#667eea" />
                <link rel="shortcut icon" href="/favicon.png" />
                <link rel="icon" href="/favicon.png" />
                <link rel="preload" as="image" href="/favicon.png" />

            </Head>
            <body>
                <Main />
                <NextScript />
            </body>
        </Html>
    );
}
