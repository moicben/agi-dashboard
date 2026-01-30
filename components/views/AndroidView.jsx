import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ViewShell from '../ViewShell.jsx';
import {
    fetchAndroidCommands,
    fetchAndroidDevices,
    fetchAndroidEvents,
    fetchAndroidLatestScreenshot,
    sendAndroidCommand
} from '../../lib/api.js';

const COMMAND_TYPES = [
    { value: 'tap', label: 'Tap' },
    { value: 'double_tap', label: 'Double tap' },
    { value: 'long_press', label: 'Long press' },
    { value: 'swipe', label: 'Swipe' },
    { value: 'global_action', label: 'Global action' },
    { value: 'click_node', label: 'Click node (a11y)' },
    { value: 'set_text', label: 'Set text (a11y)' },
    { value: 'open_app', label: 'Open app' }
];

const GLOBAL_ACTIONS = [
    'BACK',
    'HOME',
    'RECENTS',
    'NOTIFICATIONS',
    'QUICK_SETTINGS',
    'POWER_DIALOG',
    'LOCK_SCREEN',
    'TAKE_SCREENSHOT'
];

function safeInt(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function safeStr(v) {
    return String(v ?? '').trim();
}

function fmtDate(v) {
    if (!v) return '—';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('fr-FR');
}

function fmtJson(v) {
    if (!v) return '—';
    try {
        return JSON.stringify(v, null, 2);
    } catch {
        return String(v);
    }
}

export default function AndroidView() {
    const [devices, setDevices] = useState([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [commands, setCommands] = useState([]);
    const [events, setEvents] = useState([]);

    const [screenshot, setScreenshot] = useState(null);
    const [screenshotError, setScreenshotError] = useState(null);
    const [autoRefreshScreenshot, setAutoRefreshScreenshot] = useState(true);

    const [commandType, setCommandType] = useState('global_action');
    const [sending, setSending] = useState(false);
    const [sendError, setSendError] = useState(null);
    const [historyMode, setHistoryMode] = useState('events'); // 'events' | 'commands'

    const [tapX, setTapX] = useState('');
    const [tapY, setTapY] = useState('');
    const [longPressDuration, setLongPressDuration] = useState('700');
    const [swipeX1, setSwipeX1] = useState('');
    const [swipeY1, setSwipeY1] = useState('');
    const [swipeX2, setSwipeX2] = useState('');
    const [swipeY2, setSwipeY2] = useState('');
    const [swipeDuration, setSwipeDuration] = useState('300');
    const [globalAction, setGlobalAction] = useState('HOME');
    const [nodeValue, setNodeValue] = useState('');
    const [nodeMatch, setNodeMatch] = useState('contains');
    const [ensureComponent, setEnsureComponent] = useState('');
    const [ensurePackage, setEnsurePackage] = useState('');
    const [textToSet, setTextToSet] = useState('');
    const [openPackage, setOpenPackage] = useState('');
    const [openComponent, setOpenComponent] = useState('');
    const [advancedPayload, setAdvancedPayload] = useState('');
    const [useAdvancedPayload, setUseAdvancedPayload] = useState(false);

    const devicesRefreshRef = useRef(null);
    const pollRef = useRef(null);
    const screenshotPollRef = useRef(null);

    const selectedDevice = useMemo(() => {
        return devices.find((d) => d?.id === selectedDeviceId) || null;
    }, [devices, selectedDeviceId]);

    const headerMeta = useMemo(() => {
        if (!selectedDevice) return <span>{devices.length} device(s)</span>;
        const lastSeen = fmtDate(selectedDevice?.last_seen_at);
        return (
            <>
                <span className="android-pill">
                    <span
                        className={`android-pill-dot ${selectedDevice?.online ? 'online' : 'offline'}`}
                    />
                    {selectedDevice?.online ? 'online' : 'offline'}
                </span>
                <span>last seen: {lastSeen}</span>
                {selectedDevice?.last_package_name ? (
                    <span className="android-mono">{selectedDevice.last_package_name}</span>
                ) : null}
            </>
        );
    }, [devices.length, selectedDevice]);

    const loadDevices = useCallback(async () => {
        const list = await fetchAndroidDevices();
        setDevices(list);
        if (!selectedDeviceId && list.length > 0) {
            setSelectedDeviceId(list[0].id);
        }
    }, [selectedDeviceId]);

    const loadDeviceData = useCallback(async () => {
        if (!selectedDeviceId) return;
        const [cmds, evs] = await Promise.all([
            fetchAndroidCommands(selectedDeviceId, 80),
            fetchAndroidEvents(selectedDeviceId, 120)
        ]);
        setCommands(cmds);
        setEvents(evs);
    }, [selectedDeviceId]);

    const refreshScreenshot = useCallback(async () => {
        if (!selectedDeviceId) return;
        setScreenshotError(null);
        try {
            const data = await fetchAndroidLatestScreenshot(selectedDeviceId);
            if (data?.url && data?.path) {
                setScreenshot((prev) => {
                    if (prev?.path === data.path) return { ...prev, ...data };
                    return data;
                });
            } else {
                setScreenshot(null);
            }
        } catch (e) {
            // Pas de screenshot encore -> on reste en état vide, sans erreur
            const msg = String(e?.message || '');
            if (msg.toLowerCase().includes('aucun screenshot')) {
                setScreenshot(null);
                return;
            }
            setScreenshotError(e?.message || 'Erreur screenshot');
        }
    }, [selectedDeviceId]);

    useEffect(() => {
        const boot = async () => {
            setLoading(true);
            setError(null);
            try {
                await loadDevices();
            } catch (e) {
                setError(e?.message || 'Erreur');
            } finally {
                setLoading(false);
            }
        };
        boot();
    }, [loadDevices]);

    // Refresh devices (online/offline) périodiquement
    useEffect(() => {
        if (devicesRefreshRef.current) clearInterval(devicesRefreshRef.current);
        devicesRefreshRef.current = setInterval(() => {
            if (document.hidden) return;
            loadDevices().catch(() => {});
        }, 5000);
        return () => {
            if (devicesRefreshRef.current) clearInterval(devicesRefreshRef.current);
        };
    }, [loadDevices]);

    // Poll events/commands
    useEffect(() => {
        if (pollRef.current) clearInterval(pollRef.current);
        if (!selectedDeviceId) return;

        const tick = () => {
            if (document.hidden) return;
            loadDeviceData().catch(() => {});
        };
        tick();
        pollRef.current = setInterval(tick, 2000);
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, [loadDeviceData, selectedDeviceId]);

    // Poll screenshot (optionnel)
    useEffect(() => {
        if (screenshotPollRef.current) clearInterval(screenshotPollRef.current);
        if (!selectedDeviceId || !autoRefreshScreenshot) return;

        const tick = () => {
            if (document.hidden) return;
            refreshScreenshot().catch(() => {});
        };
        tick();
        screenshotPollRef.current = setInterval(tick, 2000);
        return () => {
            if (screenshotPollRef.current) clearInterval(screenshotPollRef.current);
        };
    }, [autoRefreshScreenshot, refreshScreenshot, selectedDeviceId]);

    const buildPayload = useCallback(() => {
        if (useAdvancedPayload) {
            const raw = safeStr(advancedPayload);
            if (!raw) return {};
            try {
                const obj = JSON.parse(raw);
                return obj && typeof obj === 'object' ? obj : {};
            } catch {
                throw new Error('Payload JSON invalide.');
            }
        }

        switch (commandType) {
            case 'tap':
            case 'double_tap':
                return { x: safeInt(tapX, 0), y: safeInt(tapY, 0) };
            case 'long_press':
                return {
                    x: safeInt(tapX, 0),
                    y: safeInt(tapY, 0),
                    durationMs: safeInt(longPressDuration, 700)
                };
            case 'swipe':
                return {
                    x1: safeInt(swipeX1, 0),
                    y1: safeInt(swipeY1, 0),
                    x2: safeInt(swipeX2, 0),
                    y2: safeInt(swipeY2, 0),
                    durationMs: safeInt(swipeDuration, 300)
                };
            case 'global_action':
                return { action: globalAction };
            case 'click_node': {
                const p = { value: safeStr(nodeValue), match: nodeMatch };
                const ec = safeStr(ensureComponent);
                const ep = safeStr(ensurePackage);
                if (ec) p.ensure_component = ec;
                if (ep) p.ensure_package = ep;
                return p;
            }
            case 'set_text': {
                const p = { value: safeStr(nodeValue), match: nodeMatch, text: String(textToSet ?? '') };
                const ec = safeStr(ensureComponent);
                const ep = safeStr(ensurePackage);
                if (ec) p.ensure_component = ec;
                if (ep) p.ensure_package = ep;
                return p;
            }
            case 'open_app': {
                const pkg = safeStr(openPackage);
                const comp = safeStr(openComponent);
                if (comp) return { component: comp };
                return { package: pkg };
            }
            default:
                return {};
        }
    }, [
        advancedPayload,
        commandType,
        ensureComponent,
        ensurePackage,
        globalAction,
        longPressDuration,
        nodeMatch,
        nodeValue,
        openComponent,
        openPackage,
        swipeDuration,
        swipeX1,
        swipeX2,
        swipeY1,
        swipeY2,
        tapX,
        tapY,
        textToSet,
        useAdvancedPayload
    ]);

    const send = useCallback(async () => {
        if (!selectedDeviceId) return;
        setSending(true);
        setSendError(null);
        try {
            const payload = buildPayload();

            // validations légères (UX)
            if ((commandType === 'click_node' || commandType === 'set_text') && !safeStr(payload?.value)) {
                throw new Error('Champ "value" requis pour click_node / set_text.');
            }
            if (commandType === 'open_app' && !safeStr(payload?.package) && !safeStr(payload?.component)) {
                throw new Error('Renseigne "package" ou "component" pour open_app.');
            }
            if (
                (commandType === 'tap' || commandType === 'double_tap' || commandType === 'long_press') &&
                (!Number.isFinite(Number(payload?.x)) || !Number.isFinite(Number(payload?.y)))
            ) {
                throw new Error('Coordonnées x/y invalides.');
            }
            if (commandType === 'swipe') {
                const keys = ['x1', 'y1', 'x2', 'y2'];
                if (keys.some((k) => !Number.isFinite(Number(payload?.[k])))) {
                    throw new Error('Coordonnées swipe invalides.');
                }
            }

            await sendAndroidCommand({
                deviceId: selectedDeviceId,
                commandType,
                payload
            });

            // Refresh rapide pour afficher la commande pending tout de suite
            await loadDeviceData();

            // Bonus: si TAKE_SCREENSHOT, on force un refresh screenshot après un petit délai
            if (commandType === 'global_action' && payload?.action === 'TAKE_SCREENSHOT') {
                setTimeout(() => refreshScreenshot().catch(() => {}), 1200);
            }
        } catch (e) {
            setSendError(e?.message || 'Erreur envoi');
        } finally {
            setSending(false);
        }
    }, [buildPayload, commandType, loadDeviceData, refreshScreenshot, selectedDeviceId]);

    const sendQuick = useCallback(
        async (type, payload) => {
            if (!selectedDeviceId) return;
            setSending(true);
            setSendError(null);
            try {
                await sendAndroidCommand({
                    deviceId: selectedDeviceId,
                    commandType: type,
                    payload: payload ?? {}
                });
                await loadDeviceData();
            } catch (e) {
                setSendError(e?.message || 'Erreur envoi');
            } finally {
                setSending(false);
            }
        },
        [loadDeviceData, selectedDeviceId]
    );

    const onSelectDevice = (id) => {
        setSelectedDeviceId(id);
        setScreenshot(null);
        setScreenshotError(null);
        setSendError(null);
    };

    const commandsPreview = useMemo(() => {
        const items = Array.isArray(commands) ? commands.slice(0, 18) : [];
        return items;
    }, [commands]);

    const eventsPreview = useMemo(() => {
        const items = Array.isArray(events) ? events.slice(0, 24) : [];
        return items;
    }, [events]);

    if (loading) {
        return (
            <ViewShell title="Android" meta={headerMeta}>
                <div className="loading">
                    <div className="spinner" />
                    <p>Chargement…</p>
                </div>
            </ViewShell>
        );
    }

    if (error) {
        return (
            <ViewShell title="Android" meta={headerMeta}>
                <div className="error">Erreur: {error}</div>
            </ViewShell>
        );
    }

    return (
        <ViewShell title="Android" meta={headerMeta}>
            <div className="android-container">
                <div className="android-filters">
                    <div className="android-device-select">
                        <select
                            aria-label="Device"
                            className="period-filter"
                            value={selectedDeviceId}
                            onChange={(e) => onSelectDevice(e.target.value)}
                        >
                            <option value="" disabled>
                                Sélectionner…
                            </option>
                            {devices.map((d) => (
                                <option key={d.id} value={d.id}>
                                    {d.id}
                                    {d?.online ? ' • online' : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="android-meta">
                        <span className="android-muted">{devices.length} device(s)</span>
                        <button
                            type="button"
                            className="conversions-pagination-btn"
                            onClick={() => loadDevices().catch(() => {})}
                        >
                            Rafraîchir devices
                        </button>
                    </div>
                </div>

                {!selectedDeviceId ? (
                    <div className="empty-state">
                        <h2>Aucun device sélectionné</h2>
                        <p>Installe l’APK sur un Android (ou génère un event) pour le voir apparaître.</p>
                    </div>
                ) : (
                    <div className="android-grid">
                        {/* Colonne gauche */}
                        <section className="android-card">
                            <header className="android-card-header">
                                <div>
                                    <div className="android-card-title">Interaction / Remote commands</div>
                                </div>
                                <div className="android-actions">
                                    <button
                                        type="button"
                                        className="conversions-pagination-btn"
                                        disabled={!selectedDeviceId || sending}
                                        onClick={() =>
                                            sendQuick('global_action', { action: 'TAKE_SCREENSHOT' })
                                                .then(() => setTimeout(() => refreshScreenshot().catch(() => {}), 1200))
                                                .catch(() => {})
                                        }
                                    >
                                        Screenshot
                                    </button>
                                    <button
                                        type="button"
                                        className="conversions-pagination-btn"
                                        disabled={!selectedDeviceId || sending}
                                        onClick={() => sendQuick('global_action', { action: 'HOME' }).catch(() => {})}
                                    >
                                        Home
                                    </button>
                                    <button
                                        type="button"
                                        className="conversions-pagination-btn"
                                        disabled={!selectedDeviceId || sending}
                                        onClick={() => sendQuick('global_action', { action: 'BACK' }).catch(() => {})}
                                    >
                                        Back
                                    </button>
                                </div>
                            </header>

                            <div className="android-card-body">
                                <div className="android-interaction-grid">
                                    <div className="android-interaction-left">
                                        <div className="android-form">
                                            <div className="android-field">
                                                <label>Type</label>
                                                <div className="android-tabs" role="tablist" aria-label="Type de commande">
                                                    {COMMAND_TYPES.map((c) => (
                                                        <button
                                                            key={c.value}
                                                            type="button"
                                                            role="tab"
                                                            aria-selected={commandType === c.value}
                                                            className={`android-tab conversions-pagination-btn${commandType === c.value ? ' is-active' : ''}`}
                                                            onClick={() => setCommandType(c.value)}
                                                        >
                                                            {c.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="android-form-row">
                                                <div className="android-field">
                                                    <label>Mode</label>
                                                    <select
                                                        value={useAdvancedPayload ? 'advanced' : 'simple'}
                                                        onChange={(e) => setUseAdvancedPayload(e.target.value === 'advanced')}
                                                    >
                                                        <option value="simple">Simple (form)</option>
                                                        <option value="advanced">Avancé (JSON)</option>
                                                    </select>
                                                </div>
                                            </div>

                                            {useAdvancedPayload ? (
                                                <div className="android-field">
                                                    <label>Payload (JSON)</label>
                                                    <textarea
                                                        value={advancedPayload}
                                                        onChange={(e) => setAdvancedPayload(e.target.value)}
                                                        placeholder='{"x":610,"y":1751}'
                                                    />
                                                </div>
                                            ) : (
                                                <>
                                                    {(commandType === 'tap' ||
                                                        commandType === 'double_tap' ||
                                                        commandType === 'long_press') && (
                                                        <div className="android-form-row">
                                                            <div className="android-field">
                                                                <label>x (px)</label>
                                                                <input value={tapX} onChange={(e) => setTapX(e.target.value)} />
                                                            </div>
                                                            <div className="android-field">
                                                                <label>y (px)</label>
                                                                <input value={tapY} onChange={(e) => setTapY(e.target.value)} />
                                                            </div>
                                                        </div>
                                                    )}

                                                    {commandType === 'long_press' ? (
                                                        <div className="android-field">
                                                            <label>durationMs</label>
                                                            <input
                                                                value={longPressDuration}
                                                                onChange={(e) => setLongPressDuration(e.target.value)}
                                                            />
                                                        </div>
                                                    ) : null}

                                                    {commandType === 'swipe' ? (
                                                        <>
                                                            <div className="android-form-row">
                                                                <div className="android-field">
                                                                    <label>x1</label>
                                                                    <input
                                                                        value={swipeX1}
                                                                        onChange={(e) => setSwipeX1(e.target.value)}
                                                                    />
                                                                </div>
                                                                <div className="android-field">
                                                                    <label>y1</label>
                                                                    <input
                                                                        value={swipeY1}
                                                                        onChange={(e) => setSwipeY1(e.target.value)}
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div className="android-form-row">
                                                                <div className="android-field">
                                                                    <label>x2</label>
                                                                    <input
                                                                        value={swipeX2}
                                                                        onChange={(e) => setSwipeX2(e.target.value)}
                                                                    />
                                                                </div>
                                                                <div className="android-field">
                                                                    <label>y2</label>
                                                                    <input
                                                                        value={swipeY2}
                                                                        onChange={(e) => setSwipeY2(e.target.value)}
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div className="android-field">
                                                                <label>durationMs</label>
                                                                <input
                                                                    value={swipeDuration}
                                                                    onChange={(e) => setSwipeDuration(e.target.value)}
                                                                />
                                                            </div>
                                                        </>
                                                    ) : null}

                                                    {commandType === 'global_action' ? (
                                                        <div className="android-field">
                                                            <label>action</label>
                                                            <select
                                                                value={globalAction}
                                                                onChange={(e) => setGlobalAction(e.target.value)}
                                                            >
                                                                {GLOBAL_ACTIONS.map((a) => (
                                                                    <option key={a} value={a}>
                                                                        {a}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    ) : null}

                                                    {commandType === 'click_node' || commandType === 'set_text' ? (
                                                        <>
                                                            <div className="android-field">
                                                                <label>value (text / content-desc / viewId)</label>
                                                                <input
                                                                    value={nodeValue}
                                                                    onChange={(e) => setNodeValue(e.target.value)}
                                                                    placeholder="ENVOYER UN TEST"
                                                                />
                                                            </div>
                                                            <div className="android-form-row">
                                                                <div className="android-field">
                                                                    <label>match</label>
                                                                    <select
                                                                        value={nodeMatch}
                                                                        onChange={(e) => setNodeMatch(e.target.value)}
                                                                    >
                                                                        <option value="contains">contains</option>
                                                                        <option value="exact">exact</option>
                                                                    </select>
                                                                </div>
                                                                <div className="android-field">
                                                                    <label>ensure_package (optionnel)</label>
                                                                    <input
                                                                        value={ensurePackage}
                                                                        onChange={(e) => setEnsurePackage(e.target.value)}
                                                                        placeholder="com.andtracker"
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div className="android-field">
                                                                <label>ensure_component (optionnel)</label>
                                                                <input
                                                                    value={ensureComponent}
                                                                    onChange={(e) => setEnsureComponent(e.target.value)}
                                                                    placeholder="com.andtracker/.MainActivity"
                                                                />
                                                            </div>
                                                            {commandType === 'set_text' ? (
                                                                <div className="android-field">
                                                                    <label>text</label>
                                                                    <input
                                                                        value={textToSet}
                                                                        onChange={(e) => setTextToSet(e.target.value)}
                                                                        placeholder="bonjour"
                                                                    />
                                                                </div>
                                                            ) : null}
                                                        </>
                                                    ) : null}

                                                    {commandType === 'open_app' ? (
                                                        <>
                                                            <div className="android-field">
                                                                <label>package (launch intent)</label>
                                                                <input
                                                                    value={openPackage}
                                                                    onChange={(e) => setOpenPackage(e.target.value)}
                                                                    placeholder="com.andtracker"
                                                                />
                                                            </div>
                                                            <div className="android-field">
                                                                <label>component (prioritaire si rempli)</label>
                                                                <input
                                                                    value={openComponent}
                                                                    onChange={(e) => setOpenComponent(e.target.value)}
                                                                    placeholder="com.andtracker/.MainActivity"
                                                                />
                                                            </div>
                                                        </>
                                                    ) : null}
                                                </>
                                            )}

                                            <div className="android-actions">
                                                <button
                                                    type="button"
                                                    className="conversions-pagination-btn"
                                                    disabled={!selectedDeviceId || sending}
                                                    onClick={() => send().catch(() => {})}
                                                >
                                                    {sending ? 'Envoi…' : 'Envoyer'}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="conversions-pagination-btn"
                                                    disabled={!selectedDeviceId || sending}
                                                    onClick={() => loadDeviceData().catch(() => {})}
                                                >
                                                    Rafraîchir
                                                </button>
                                            </div>

                                            {sendError ? <div className="error">{sendError}</div> : null}
                                        </div>
                                    </div>

                                    <div className="android-interaction-right">
                                        <div className="android-history-header">
                                            <div className="android-muted">Historique</div>
                                            <div className="android-history-switch">
                                                <button
                                                    type="button"
                                                    className={`conversions-pagination-btn${historyMode === 'events' ? ' is-active' : ''}`}
                                                    onClick={() => setHistoryMode('events')}
                                                >
                                                    Events
                                                </button>
                                                <button
                                                    type="button"
                                                    className={`conversions-pagination-btn${historyMode === 'commands' ? ' is-active' : ''}`}
                                                    onClick={() => setHistoryMode('commands')}
                                                >
                                                    Commandes
                                                </button>
                                            </div>
                                        </div>

                                        {historyMode === 'events' ? (
                                            <div className="android-list">
                                                {eventsPreview.length === 0 ? (
                                                    <div className="android-muted">Aucun event.</div>
                                                ) : (
                                                    eventsPreview.map((ev) => (
                                                        <div key={ev.id} className="android-list-item">
                                                            <div className="android-list-item-head">
                                                                <span className="android-mono">{ev.event_type}</span>
                                                                <span className="android-muted">{fmtDate(ev.created_at)}</span>
                                                            </div>
                                                            <div className="android-muted">
                                                                {ev.package_name ? (
                                                                    <span className="android-mono">{ev.package_name}</span>
                                                                ) : (
                                                                    '—'
                                                                )}
                                                            </div>
                                                            {ev.event_value ? (
                                                                <div className="android-mono" style={{ whiteSpace: 'pre-wrap' }}>
                                                                    {String(ev.event_value)}
                                                                </div>
                                                            ) : null}
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        ) : (
                                            <div className="android-list">
                                                {commandsPreview.length === 0 ? (
                                                    <div className="android-muted">Aucune commande.</div>
                                                ) : (
                                                    commandsPreview.map((c) => (
                                                        <div key={c.id} className="android-list-item">
                                                            <div className="android-list-item-head">
                                                                <span className="android-mono">{c.command_type}</span>
                                                                <span className={`android-badge ${c.status || ''}`}>
                                                                    {c.status || '—'}
                                                                </span>
                                                            </div>
                                                            <div className="android-muted">
                                                                {fmtDate(c.created_at)}
                                                                {c.executed_at ? ` • exec ${fmtDate(c.executed_at)}` : ''}
                                                            </div>
                                                            <details>
                                                                <summary className="android-muted">payload / result</summary>
                                                                <pre className="android-mono">
                                                                    {fmtJson({ payload: c.payload, result: c.result })}
                                                                </pre>
                                                            </details>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* Colonne droite */}
                        <section className="android-card android-card--visualization">
                            <header className="android-card-header">
                                <div>
                                    <div className="android-card-title">Visualisation (dernier screenshot)</div>
                                </div>
                                <div className="android-actions">
                                    <button
                                        type="button"
                                        className="conversions-pagination-btn"
                                        disabled={!selectedDeviceId}
                                        onClick={() => refreshScreenshot().catch(() => {})}
                                    >
                                        Rafraîchir
                                    </button>
                                    <button
                                        type="button"
                                        className="conversions-pagination-btn"
                                        onClick={() => setAutoRefreshScreenshot((v) => !v)}
                                    >
                                        Auto: {autoRefreshScreenshot ? 'ON' : 'OFF'}
                                    </button>
                                </div>
                            </header>

                            <div className="android-card-body">
                                {screenshotError ? <div className="error">{screenshotError}</div> : null}

                                <div className="android-screenshot-wrap">
                                    {screenshot?.url ? (
                                        <>
                                            <img
                                                className="android-screenshot"
                                                src={screenshot.url}
                                                alt="Screenshot Android"
                                                loading="eager"
                                            />
                                            <div className="android-screenshot-meta">
                                                <span className="android-mono">
                                                    {screenshot?.name || screenshot?.path || '—'}
                                                </span>
                                                <span>
                                                    {screenshot?.updatedAt ? `maj ${fmtDate(screenshot.updatedAt)}` : ''}
                                                </span>
                                                {screenshot?.url ? (
                                                    <a
                                                        className="android-muted"
                                                        href={screenshot.url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                    >
                                                        ouvrir
                                                    </a>
                                                ) : null}
                                            </div>
                                        </>
                                    ) : (
                                        <div className="android-muted">
                                            Aucun screenshot pour le moment. Le service en upload toutes les ~1.5s (Android 11+).
                                        </div>
                                    )}
                                </div>
                            </div>
                        </section>
                    </div>
                )}
            </div>
        </ViewShell>
    );
}

