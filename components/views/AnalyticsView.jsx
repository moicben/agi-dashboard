import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import ViewShell from '../ViewShell.jsx';
import { fetchAnalytics } from '../../lib/api.js';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

const PERIOD_OPTIONS = [
    { value: 'all', label: 'All period' },
    { value: 'last_month', label: 'Last month' },
    { value: 'last_2_weeks', label: 'Last 2 weeks' },
    { value: 'last_week', label: 'Last week' },
    { value: 'last_day', label: 'Last day' }
];

function getPeriodRange(periodValue) {
    if (!periodValue || periodValue === 'all') return { startDate: null, endDate: null };
    const endDate = new Date();

    const startDate = new Date(endDate);
    switch (periodValue) {
        case 'last_month':
            startDate.setDate(startDate.getDate() - 30);
            break;
        case 'last_2_weeks':
            startDate.setDate(startDate.getDate() - 14);
            break;
        case 'last_week':
            startDate.setDate(startDate.getDate() - 7);
            break;
        case 'last_day':
            startDate.setDate(startDate.getDate() - 1);
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
    const [selectedIdentityId, setSelectedIdentityId] = useState(null);
    const [availableIdentities, setAvailableIdentities] = useState([]);
    const [selectedPeriod, setSelectedPeriod] = useState('last_week');

    useEffect(() => {
        const loadAnalytics = async () => {
            setLoading(true);
            setError(null);
            try {
                const { startDate, endDate } = getPeriodRange(selectedPeriod);
                const data = await fetchAnalytics(startDate, endDate, selectedIdentityId);
                setAnalytics(data);

                const identities = Array.isArray(data?.availableIdentities)
                    ? data.availableIdentities
                    : [];
                setAvailableIdentities(identities);

                // Même comportement que Calendar : reset si l'identité n'est plus dispo sur la période.
                if (
                    selectedIdentityId &&
                    !identities.some((i) => String(i.id) === String(selectedIdentityId))
                ) {
                    setSelectedIdentityId(null);
                }
            } catch (err) {
                console.error('Erreur lors du chargement des analytics:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        loadAnalytics();
    }, [selectedIdentityId, selectedPeriod]);

    const funnel = analytics?.funnel ?? {
        meetingsPlanned: 0,
        participantsDetected: 0,
        loginsPerformed: 0,
        verificationStart: 0,
        adbPair: 0,
        adbConnect: 0
    };

    const conversions = analytics?.conversions ?? {
        toParticipants: 0,
        toLogins: 0,
        toVerificationStart: 0,
        toAdbPair: 0,
        toAdbConnect: 0
    };

    const steps = useMemo(
        () => [
            { key: 'meetingsPlanned', label: 'Meetings', value: funnel.meetingsPlanned },
            { key: 'participantsDetected', label: 'Present', value: funnel.participantsDetected },
            { key: 'loginsPerformed', label: 'Logged', value: funnel.loginsPerformed },
            { key: 'verificationStart', label: 'Verification', value: funnel.verificationStart },
            { key: 'adbPair', label: 'ADB Pair', value: funnel.adbPair },
            { key: 'adbConnect', label: 'ADB Connect', value: funnel.adbConnect }
        ],
        [
            funnel.meetingsPlanned,
            funnel.participantsDetected,
            funnel.loginsPerformed,
            funnel.verificationStart,
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
            grid: { left: 16, right: 16, top: 24, bottom: 72 },
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
                axisLabel: { color: '#7f7f7f', fontSize: 11 },
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

    const meta = analytics ? (
        <span>
            {analytics.funnel.meetingsPlanned} meetings • 
            {analytics.funnel.adbConnect} conversions finales
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
                    <p style={{ fontSize: '12px', marginTop: '8px', color: '#999' }}>
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

    return (
        <ViewShell title="Analytics" meta={meta}>
            <div className="analytics-container">
                <div className="analytics-filters">
                    {availableIdentities.length > 0 && (
                        <select
                            value={selectedIdentityId || ''}
                            onChange={(e) => setSelectedIdentityId(e.target.value || null)}
                            className="identity-filter"
                        >
                            <option value="">All identity</option>
                            {availableIdentities.map((identity) => (
                                <option key={identity.id} value={identity.id}>
                                    {identity.fullname || 'Inconnu'}
                                </option>
                            ))}
                        </select>
                    )}

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
                                    conversion pipeline
                                </div>
                            </div>
                        </header>
                        <div className="analytics-chart">
                            <ReactECharts
                                option={pipelineOption}
                                style={{ height: 360, width: '100%' }}
                                notMerge={true}
                                lazyUpdate={true}
                            />
                        </div>
                    </section>
                </div>

                <div className="funnel-stats">
                    <div className="funnel-stat-card">
                        <div className="funnel-stat-label">Meetings</div>
                        <div className="funnel-stat-value">
                            {funnel.meetingsPlanned.toLocaleString('fr-FR')}
                        </div>
                    </div>
                    <div className="funnel-stat-card">
                        <div className="funnel-stat-label">Present</div>
                        <div className="funnel-stat-value">
                            {conversions.toParticipants}
                            <span className="funnel-stat-unit">%</span>
                        </div>
                    </div>
                    <div className="funnel-stat-card">
                        <div className="funnel-stat-label">Logged</div>
                        <div className="funnel-stat-value">
                            {conversions.toLogins}
                            <span className="funnel-stat-unit">%</span>
                        </div>
                    </div>
                    <div className="funnel-stat-card">
                        <div className="funnel-stat-label">Verification</div>
                        <div className="funnel-stat-value">
                            {conversions.toVerificationStart}
                            <span className="funnel-stat-unit">%</span>
                        </div>
                    </div>
                    <div className="funnel-stat-card">
                        <div className="funnel-stat-label">ADB Pair</div>
                        <div className="funnel-stat-value">
                            {conversions.toAdbPair}
                            <span className="funnel-stat-unit">%</span>
                        </div>
                    </div>
                    <div className="funnel-stat-card">
                        <div className="funnel-stat-label">ADB Connect</div>
                        <div className="funnel-stat-value">
                            {conversions.toAdbConnect}
                            <span className="funnel-stat-unit">%</span>
                        </div>
                    </div>
                </div>
            </div>
        </ViewShell>
    );
}
