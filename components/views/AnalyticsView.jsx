import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import ViewShell from '../ViewShell.jsx';
import { fetchAnalytics, fetchBestQueries, fetchConversions } from '../../lib/api.js';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

const PERIOD_OPTIONS = [
    { value: 'all', label: 'All period' },
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: 'last_month', label: 'Last month' },
    { value: 'last_2_weeks', label: 'Last 2 weeks' },
    { value: 'last_week', label: 'Last week' },
];

const LAST_EVENTS_TYPE_OPTIONS = [
    { value: 'all', label: 'All events' },
    { value: 'visit', label: 'visit' },
    { value: 'login', label: 'login' },
    { value: 'adb_pair', label: 'adb_pair' },
    { value: 'adb_connect', label: 'adb_connect' },
];

function getPeriodRange(periodValue) {
    if (!periodValue || periodValue === 'all') return { startDate: null, endDate: null };
    const endDate = new Date();
    const startDate = new Date(endDate);

    switch (periodValue) {
        case 'today':
            startDate.setHours(0, 0, 0, 0);
            break;
        case 'yesterday': {
            // Plage du jour civil d'hier (heure locale)
            const y = new Date(endDate);
            y.setDate(y.getDate() - 1);

            startDate.setTime(y.getTime());
            startDate.setHours(0, 0, 0, 0);

            endDate.setTime(y.getTime());
            endDate.setHours(23, 59, 59, 999);
            break;
        }
        case 'last_month':
            startDate.setDate(startDate.getDate() - 30);
            break;
        case 'last_2_weeks':
            startDate.setDate(startDate.getDate() - 14);
            break;
        case 'last_week':
            startDate.setDate(startDate.getDate() - 7);
            break;
        default:
            return { startDate: null, endDate: null };
    }

    return { startDate, endDate };
}

export default function AnalyticsView() {
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedPeriod, setSelectedPeriod] = useState('today');
    const [lastEventsType, setLastEventsType] = useState('all');
    const [conversionsRows, setConversionsRows] = useState([]);
    const [conversionsPage, setConversionsPage] = useState(0);
    const [conversionsTotal, setConversionsTotal] = useState(null);
    const [conversionsLoading, setConversionsLoading] = useState(false);
    const [conversionsError, setConversionsError] = useState(null);
    const [bestQueriesRows, setBestQueriesRows] = useState([]);
    const [bestQueriesLoading, setBestQueriesLoading] = useState(false);
    const [bestQueriesError, setBestQueriesError] = useState(null);

    useEffect(() => {
        const loadAnalytics = async () => {
            setLoading(true);
            setError(null);
            try {
                const { startDate, endDate } = getPeriodRange(selectedPeriod);
                const data = await fetchAnalytics(startDate, endDate, null);
                setAnalytics(data);
            } catch (err) {
                console.error('Erreur lors du chargement des analytics:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        loadAnalytics();
    }, [selectedPeriod]);

    // Reset pagination quand le filtre global change (période)
    useEffect(() => {
        setConversionsPage(0);
    }, [selectedPeriod]);

    // Reset pagination quand le filtre "Last events" change
    useEffect(() => {
        setConversionsPage(0);
    }, [lastEventsType]);

    useEffect(() => {
        const loadConversions = async () => {
            setConversionsLoading(true);
            setConversionsError(null);
            try {
                const { startDate, endDate } = getPeriodRange(selectedPeriod);
                const data = await fetchConversions(startDate, endDate, null, conversionsPage, lastEventsType);
                const rows = Array.isArray(data?.items) ? data.items : [];
                setConversionsRows(rows);
                setConversionsTotal(typeof data?.total === 'number' ? data.total : null);
            } catch (err) {
                console.error('Erreur lors du chargement des conversions:', err);
                setConversionsError(err.message);
            } finally {
                setConversionsLoading(false);
            }
        };

        loadConversions();
    }, [selectedPeriod, conversionsPage, lastEventsType]);

    useEffect(() => {
        const loadBestQueries = async () => {
            setBestQueriesLoading(true);
            setBestQueriesError(null);
            try {
                const { startDate, endDate } = getPeriodRange(selectedPeriod);
                const data = await fetchBestQueries(startDate, endDate, null, 25);
                const rows = Array.isArray(data?.items) ? data.items : [];
                setBestQueriesRows(rows);
            } catch (err) {
                console.error('Erreur lors du chargement des best queries:', err);
                setBestQueriesError(err.message);
            } finally {
                setBestQueriesLoading(false);
            }
        };

        loadBestQueries();
    }, [selectedPeriod]);

    const funnel = analytics?.funnel ?? {
        bookings: 0,
        visit: 0,
        login: 0,
        adbPair: 0,
        adbConnect: 0
    };

    const conversions = analytics?.conversions ?? {
        toVisit: 0,
        toLogin: 0,
        toAdbPair: 0,
        toAdbConnect: 0
    };

    const steps = useMemo(
        () => [
            { key: 'bookings', label: 'Bookings', value: funnel.bookings },
            { key: 'visit', label: 'Visit', value: funnel.visit },
            { key: 'login', label: 'Login', value: funnel.login },
            { key: 'adbPair', label: 'ADB Pair', value: funnel.adbPair },
            { key: 'adbConnect', label: 'ADB Connect', value: funnel.adbConnect }
        ],
        [
            funnel.bookings,
            funnel.visit,
            funnel.login,
            funnel.adbPair,
            funnel.adbConnect
        ]
    );

    const pipelineOption = useMemo(() => {
        const palette = ['#2a2a2a', '#3a3a3a', '#4a4a4a', '#5a5a5a', '#6a6a6a', '#7a7a7a'];

        const truncate = (s, max = 22) => {
            const str = String(s ?? '');
            if (str.length <= max) return str;
            return `${str.slice(0, max - 1)}…`;
        };

        const maxValue = Math.max(...steps.map((s) => s.value), 0);

        return {
            backgroundColor: 'transparent',
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
                formatter: (params) => {
                    const p = Array.isArray(params) ? params[0] : params;
                    const value = Number(p?.value ?? 0);
                    const name = p?.axisValueLabel || p?.name || '';
                    return `${name}<br/><b>${value.toLocaleString('fr-FR')}</b>`;
                }
            },
            // Style  pour pipeline
            grid: { left: 12, right: 16, top: 22, bottom: 16, containLabel: true },
            xAxis: {
                type: 'category',
                data: steps.map((s) => s.label),
                axisTick: { show: false },
                axisLine: { lineStyle: { color: 'rgba(255,255,255,0.12)' } },
                axisLabel: {
                    color: '#9a9a9a',
                    interval: 0,
                    rotate: 0,
                    fontSize: 11,
                    formatter: (v) => truncate(v, 18)
                }
            },
            yAxis: {
                type: 'value',
                min: 0,
                max: maxValue ? Math.ceil(maxValue * 1.12) : 1,
                axisLabel: { color: '#7f7f7f', fontSize: 11, margin: 12 },
                splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } }
            },
            series: [
                {
                    name: 'Volumes',
                    type: 'bar',
                    barMaxWidth: 56,
                    barCategoryGap: '30%',
                    label: {
                        show: true,
                        position: 'top',
                        color: '#ffffff',
                        fontSize: 11,
                        fontWeight: 600,
                        formatter: (p) => {
                            const v = Number(p?.value ?? 0);
                            return v.toLocaleString('fr-FR');
                        }
                    },
                    itemStyle: {
                        borderColor: 'rgba(255,255,255,0.08)',
                        borderWidth: 1
                    },
                    emphasis: {
                        label: { fontWeight: '700' }
                    },
                    data: steps.map((s, idx) => ({
                        value: s.value,
                        itemStyle: {
                            color: palette[idx % palette.length]
                        }
                    }))
                }
            ]
        };
    }, [steps]);

    const conversionBarsOption = useMemo(() => {
        // Style  pour rates by event
        const palette = ['#2a2a2a', '#343434', '#3e3e3e', '#484848', '#525252'];

        const rows = [
            {
                label: 'ADB Connect',
                value: Number(conversions.toAdbConnect ?? 0),
                num: funnel.adbConnect,
                den: funnel.bookings
            },
            {
                label: 'ADB Pair',
                value: Number(conversions.toAdbPair ?? 0),
                num: funnel.adbPair,
                den: funnel.bookings
            },
            {
                label: 'Login',
                value: Number(conversions.toLogin ?? 0),
                num: funnel.login,
                den: funnel.bookings
            },
            {
                label: 'Visit',
                value: Number(conversions.toVisit ?? 0),
                num: funnel.visit,
                den: funnel.bookings
            }
        ];

        const clampPct = (n) => {
            const v = Number(n);
            if (!Number.isFinite(v)) return 0;
            return Math.max(0, Math.min(100, v));
        };

        const fmtPct = (n) => {
            const v = clampPct(n);
            return v.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
        };

        return {
            backgroundColor: 'transparent',
            tooltip: {
                trigger: 'item',
                formatter: (p) => {
                    const idx = Number(p?.dataIndex ?? 0);
                    const r = rows[idx];
                    if (!r) return '';
                    const num = Number(r.num ?? 0).toLocaleString('fr-FR');
                    const den = Number(r.den ?? 0).toLocaleString('fr-FR');
                    return `${r.label}<br/><b>${fmtPct(r.value)}%</b><br/>${num} / ${den}`;
                }
            },
            // Espace pour rates by event
            grid: { left: 128, right: 16, top: 14, bottom: 30 },
            xAxis: {
                type: 'value',
                min: 0,
                max: 100,
                axisLabel: {
                    color: '#9a9a9a',
                    fontSize: 11,
                    formatter: (v) => `${v}%`
                },
                axisLine: { lineStyle: { color: 'rgba(255,255,255,0.12)' } },
                splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } }
            },
            yAxis: {
                type: 'category',
                data: rows.map((r) => r.label),
                axisTick: { show: false },
                axisLine: { lineStyle: { color: 'rgba(255,255,255,0.12)' } },
                // Style  pour rates by event
                axisLabel: {
                    color: '#b0b0b0',
                    fontSize: 12,
                    margin: 16,
                    formatter: (v) => `{lbl|${v}}`,
                    rich: {
                        lbl: {
                            width: 104,
                            align: 'left'
                        }
                    }
                }
            },
            series: [
                {
                    name: 'Conversion',
                    type: 'bar',
                    barWidth: 18,
                    showBackground: true,
                    backgroundStyle: { color: 'rgba(255,255,255,0.05)'},
                    label: {
                        show: true,
                        position: 'right',
                        color: '#e0e0e0',
                        fontSize: 12,
                        fontWeight: 600,
                        formatter: (p) => `${fmtPct(p?.value)}%`
                    },
                    itemStyle: {
                        borderColor: 'rgba(255,255,255,0.10)',
                        borderWidth: 1,
                    },
                    data: rows.map((r, idx) => ({
                        value: clampPct(r.value),
                        itemStyle: { color: palette[idx % palette.length] }
                    }))
                }
            ]
        };
    }, [conversions, funnel]);

    const meta = analytics ? (
        <span>
            {analytics.funnel.bookings} bookings • {analytics.funnel.adbConnect} conversions finales
        </span>
    ) : null;

    if (loading) {
        return (
            <ViewShell title="Analytics" meta={meta}>
                <div className="analytics-loading">
                    <div className="spinner" />
                    <p>Chargement des analytics...</p>
                </div>
            </ViewShell>
        );
    }

    if (error) {
        return (
            <ViewShell title="Analytics" meta={meta}>
                <div className="analytics-error">
                    <p>Erreur lors du chargement des analytics</p>
                    <p className="analytics-error-details">
                        {error}
                    </p>
                </div>
            </ViewShell>
        );
    }

    if (!analytics || !analytics.funnel) {
        return (
            <ViewShell title="Analytics" meta={meta}>
                <div className="analytics-empty">
                    <h3>Aucune donnée disponible</h3>
                    <p>Les métriques de conversion apparaîtront ici une fois les données disponibles.</p>
                </div>
            </ViewShell>
        );
    }

    const pageSize = 50;
    const pageFrom = conversionsPage * pageSize;
    const pageTo = pageFrom + conversionsRows.length;
    const pageFromLabel = conversionsRows.length > 0 ? pageFrom + 1 : 0;
    const pageToLabel = conversionsRows.length > 0 ? pageTo : 0;
    const canPrev = conversionsPage > 0 && !conversionsLoading;
    const canNext =
        !conversionsLoading &&
        (typeof conversionsTotal === 'number'
            ? pageToLabel < conversionsTotal
            : conversionsRows.length === pageSize);

    // Déduplication par contact (dernier event par contactId sur la page courante)
    // Note: on conserve les events sans contactId (ils sont considérés uniques).
    const displayConversionsRows = (() => {
        const seen = new Set();
        const out = [];
        for (const row of conversionsRows) {
            const cid = row?.contactId;
            if (cid === null || cid === undefined || cid === '') {
                out.push(row);
                continue;
            }
            const key = String(cid);
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(row);
        }
        return out;
    })();

    const formatEventType = (t) => {
        const s = String(t ?? '').trim();
        if (!s) return '—';
        return s.replaceAll('_', ' ');
    };

    const formatAdditionalDataSummary = (v) => {
        if (!v || (typeof v === 'object' && Object.keys(v).length === 0)) return '—';
        if (typeof v === 'string') return v.length > 80 ? `${v.slice(0, 79)}…` : v;
        try {
            const json = JSON.stringify(v);
            return json.length > 80 ? `${json.slice(0, 79)}…` : json;
        } catch {
            return String(v);
        }
    };

    const formatAdditionalDataFull = (v) => {
        if (!v || (typeof v === 'object' && Object.keys(v).length === 0)) return '';
        if (typeof v === 'string') return v;
        try {
            return JSON.stringify(v, null, 2);
        } catch {
            return String(v);
        }
    };

    return (
        <ViewShell title="Analytics" meta={meta}>
            <div className="analytics-container">
                <div className="analytics-filters">
                    <select
                        value={selectedPeriod}
                        onChange={(e) => setSelectedPeriod(e.target.value)}
                        className="period-filter"
                    >
                        {PERIOD_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="analytics-grid">
                    <section className="analytics-card analytics-card--chart analytics-card--full">
                        <header className="analytics-card-header">
                            <div>
                                <div className="analytics-card-title analytics-card-title--pipeline">
                                     Events pipelines
                                </div>
                            </div>
                        </header>
                        <div className="analytics-chart">
                            <ReactECharts
                                option={pipelineOption}
                                className="analytics-echart analytics-echart--pipeline"
                                notMerge={true}
                                lazyUpdate={true}
                            />
                        </div>
                    </section>
                </div>

                <div className="analytics-grid analytics-grid--rates">
                    <section className="analytics-card analytics-card--ratesRow">
                        <header className="analytics-card-header">
                            <div>
                                <div className="analytics-card-title">Rates by event</div>
                            </div>
                        </header>
                        <div className="analytics-chart analytics-chart--conversions">
                            <ReactECharts
                                option={conversionBarsOption}
                                className="analytics-echart analytics-echart--conversions"
                                notMerge={true}
                                lazyUpdate={true}
                            />
                        </div>
                    </section>

                    <section className="analytics-card analytics-card--ratesRow analytics-card--bestQueries">
                        <header className="analytics-card-header">
                            <div>
                                <div className="analytics-card-title">Best Queries</div>
                            </div>
                            <div className="conversions-pagination">
                                <span className="conversions-pagination-meta">
                                    {bestQueriesLoading ? 'Chargement…' : `${bestQueriesRows.length} résultats`}
                                </span>
                            </div>
                        </header>

                        {bestQueriesError ? (
                            <div className="conversions-error">
                                <div>Erreur lors du chargement des best queries</div>
                                <div className="conversions-error-msg">{bestQueriesError}</div>
                            </div>
                        ) : (
                            <div className="conversions-table-wrapper">
                                <table className="conversions-table best-queries-table">
                                    <thead>
                                        <tr>
                                            <th>Query</th>
                                            <th>Login</th>
                                            <th>Pair</th>
                                            <th>Connect</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {bestQueriesRows.length === 0 && !bestQueriesLoading ? (
                                            <tr>
                                                <td colSpan={4} className="conversions-empty">
                                                    Aucune donnée sur la période sélectionnée.
                                                </td>
                                            </tr>
                                        ) : (
                                            bestQueriesRows.map((row) => (
                                                <tr key={row?.query ?? ''}>
                                                    <td className="best-queries-query">{row?.query || '—'}</td>
                                                    <td className="conversions-mono">
                                                        {Number(row?.loginCount ?? 0).toLocaleString('fr-FR')}
                                                    </td>
                                                    <td className="conversions-mono">
                                                        {Number(row?.adbPairCount ?? 0).toLocaleString('fr-FR')}
                                                    </td>
                                                    <td className="conversions-mono">
                                                        {Number(row?.adbConnectCount ?? 0).toLocaleString('fr-FR')}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>   
                </div>   

                <section className="analytics-card analytics-card--full analytics-card--lastEvents">
                    <header className="analytics-card-header">
                        <div className="last-events-header-left">
                            <div className="analytics-card-title">Last events</div>
                            <div className="last-events-type-filters" aria-label="Filtrer les events par type">
                                {LAST_EVENTS_TYPE_OPTIONS.map((opt) => (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => setLastEventsType(opt.value)}
                                        className={[
                                            'last-events-type-btn',
                                            'conversions-pagination-btn',
                                            opt.value === lastEventsType ? 'last-events-type-btn--active' : ''
                                        ]
                                            .filter(Boolean)
                                            .join(' ')}
                                        aria-pressed={opt.value === lastEventsType}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="conversions-pagination">
                            <span className="conversions-pagination-meta">
                                {conversionsLoading
                                    ? 'Chargement…'
                                    : conversionsTotal === null
                                      ? `${pageFromLabel}–${pageToLabel}`
                                      : `${pageFromLabel}–${pageToLabel} sur ${conversionsTotal}`}
                                {!conversionsLoading && conversionsRows.length > 0 && displayConversionsRows.length !== conversionsRows.length
                                    ? ` • ${displayConversionsRows.length} contacts`
                                    : ''}
                            </span>
                            <button
                                className="conversions-pagination-btn"
                                onClick={() => setConversionsPage((p) => Math.max(0, p - 1))}
                                disabled={!canPrev}
                                type="button"
                            >
                                Prev
                            </button>
                            <button
                                className="conversions-pagination-btn"
                                onClick={() => setConversionsPage((p) => p + 1)}
                                disabled={!canNext}
                                type="button"
                            >
                                Next
                            </button>
                        </div>
                    </header>

                    {conversionsError ? (
                        <div className="conversions-error">
                            <div>Erreur lors du chargement des conversions</div>
                            <div className="conversions-error-msg">{conversionsError}</div>
                        </div>
                    ) : (
                        <div className="conversions-table-wrapper">
                            <table className="conversions-table">
                                <thead>
                                    <tr>
                                        <th>Event</th>
                                        <th>Query</th>
                                        <th>Contact</th>
                                        <th>Details</th>
                                        <th className="conversions-col-date">Date</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {displayConversionsRows.length === 0 && !conversionsLoading ? (
                                        <tr>
                                            <td colSpan={5} className="conversions-empty">
                                                {lastEventsType === 'all'
                                                    ? 'Aucun event sur la période sélectionnée.'
                                                    : `Aucun event "${lastEventsType}" sur la période sélectionnée.`}
                                            </td>
                                        </tr>
                                    ) : (
                                        displayConversionsRows.map((row) => {
                                            const additional = row?.contactAdditionalData ?? null;
                                            const details = row?.eventDetails ?? null;
                                            const combined = details ? { ...details, contact: additional } : additional;

                                            const additionalSummary = formatAdditionalDataSummary(combined);
                                            const additionalFull = formatAdditionalDataFull(combined);
                                            const hasAdditionalFull = Boolean(additionalFull);

                                            return (
                                                <tr key={row?.eventId ?? `${row?.eventAt}-${row?.eventType}`}>
                                                    <td>
                                                        <span className="event-badge">
                                                            {formatEventType(row?.eventType)}
                                                        </span>
                                                    </td>
                                                    <td className="conversions-mono">
                                                        {row?.sourceQuery || '—'}
                                                    </td>
                                                    <td className="conversions-comment">
                                                        {row?.contactId ? String(row.contactId).slice(0, 8) : '—'}
                                                    </td>
                                                    <td className="conversions-details-cell">
                                                        {hasAdditionalFull ? (
                                                            <details className="conversions-details">
                                                                <summary title={additionalSummary}>
                                                                    {additionalSummary}
                                                                </summary>
                                                                <pre>{additionalFull}</pre>
                                                            </details>
                                                        ) : (
                                                            '—'
                                                        )}
                                                    </td>
                                                    <td className="conversions-mono conversions-col-date">
                                                        {row?.eventAt
                                                            ? new Date(row.eventAt).toLocaleString('fr-FR')
                                                            : '—'}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            </div>
        </ViewShell>
    );
}
