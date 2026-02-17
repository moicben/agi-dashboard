import Head from 'next/head';
import { useMemo } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout.jsx';
import { viewRegistry, DEFAULT_VIEW_ID } from '../components/views/registry.js';

export default function DashboardPage({ initialView = null }) {
    const router = useRouter();
    const queryView = useMemo(() => {
        if (router.isReady && typeof router.query.view === 'string') return router.query.view;
        return typeof initialView === 'string' ? initialView : null;
    }, [initialView, router.isReady, router.query.view]);

    const activeView = useMemo(() => {
        const fallbackView =
            viewRegistry.find(view => view.id === DEFAULT_VIEW_ID) || viewRegistry[0];
        if (!queryView) return fallbackView;
        return viewRegistry.find(view => view.id === queryView) || fallbackView;
    }, [queryView]);

    const handleSelectView = viewId => {
        router.push(
            {
                pathname: '/',
                query: { view: viewId }
            },
            undefined,
            { shallow: true }
        );
    };

    const ActiveComponent = activeView.Component;

    return (
        <>
            <Head>
                <title>AGI Dashboard</title>
            </Head>
            <Layout views={viewRegistry} activeView={activeView} onSelectView={handleSelectView}>
                <ActiveComponent />
            </Layout>
        </>
    );
}

export async function getServerSideProps(ctx) {
    // Evite les mismatches d'hydration (et les requetes de la vue par defaut)
    // quand on charge directement /?view=xxx.
    const view = typeof ctx?.query?.view === 'string' ? ctx.query.view : null;
    return { props: { initialView: view } };
}
