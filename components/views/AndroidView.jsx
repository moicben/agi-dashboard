import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ViewShell from '../ViewShell.jsx';
import {
    fetchAndroidCommands,
    fetchAndroidDevices,
    fetchAndroidEvents,
    fetchAndroidLatestScreenshot,
    fetchAndroidScreenshotDayIndex,
    fetchAndroidScreenshotDays,
    fetchAndroidScreenshotFrames,
    sendAndroidCommand
} from '../../lib/api.js';

const COMMAND_TYPES = [
    { value: 'tap', label: 'Tap' },
    { value: 'double_tap', label: 'Double tap' },
    { value: 'long_press', label: 'Long press' },
    { value: 'swipe', label: 'Swipe' },
    { value: 'global_action', label: 'Global action' },
    { value: 'wake_lock', label: 'Wake lock' },
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

function pad2(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return '00';
    return String(Math.max(0, Math.min(99, Math.trunc(v)))).padStart(2, '0');
}

function fmtSpeed(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '1';
    if (n === 0.25) return '0,25';
    if (n === 0.5) return '0,5';
    return String(n);
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
    const [viewerMode, setViewerMode] = useState('live'); // 'live' | 'player'

    const [commandType, setCommandType] = useState('global_action');
    const [sending, setSending] = useState(false);
    const [sendError, setSendError] = useState(null);
    const [historyMode, setHistoryMode] = useState('events'); // 'screen_activity' | 'events' | 'commands'

    // Screen activity (Historic tab)
    const [screenDays, setScreenDays] = useState([]);
    const [screenDaysLoading, setScreenDaysLoading] = useState(false);
    const [screenDaysError, setScreenDaysError] = useState(null);
    const [selectedScreenDay, setSelectedScreenDay] = useState('');

    const [dayIndex, setDayIndex] = useState(null); // {hours,totalFiles,truncated}
    const [dayIndexLoading, setDayIndexLoading] = useState(false);
    const [dayIndexError, setDayIndexError] = useState(null);

    // Player state
    const [playerDay, setPlayerDay] = useState('');
    const [playerHour, setPlayerHour] = useState(null);
    const [playerFrames, setPlayerFrames] = useState([]);
    const [playerLoading, setPlayerLoading] = useState(false);
    const [playerError, setPlayerError] = useState(null);
    const [playerIndex, setPlayerIndex] = useState(0);
    const [playerPlaying, setPlayerPlaying] = useState(false);
    const [playerSpeed, setPlayerSpeed] = useState(1); // x1,x2,x4,x8
    const playerTimerRef = useRef(null);

    const PlayerIcon = ({ name }) => {
        const common = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', xmlns: 'http://www.w3.org/2000/svg' };
        const stroke = { stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
        if (name === 'play') {
            return (
                <svg {...common} aria-hidden="true">
                    <path d="M8 5l11 7-11 7V5z" fill="currentColor" />
                </svg>
            );
        }
        if (name === 'pause') {
            return (
                <svg {...common} aria-hidden="true">
                    <path d="M7 5h3v14H7V5z" fill="currentColor" />
                    <path d="M14 5h3v14h-3V5z" fill="currentColor" />
                </svg>
            );
        }
        if (name === 'rewind10') {
            return (
                <svg {...common} aria-hidden="true">
                    <path {...stroke} d="M12 8V4l-4 4 4 4V8z" />
                    <path {...stroke} d="M12 4a8 8 0 1 1-7.2 4.5" />
                    <path {...stroke} d="M14.5 14.5h-2.3l1.6-2.2c.4-.6.7-1.1.7-1.7 0-.8-.6-1.4-1.4-1.4-.8 0-1.3.5-1.5 1.3" />
                </svg>
            );
        }
        if (name === 'forward10') {
            return (
                <svg {...common} aria-hidden="true">
                    <path {...stroke} d="M12 8V4l4 4-4 4V8z" />
                    <path {...stroke} d="M12 4a8 8 0 1 0 7.2 4.5" />
                    <path {...stroke} d="M9.5 14.5h-2.3l1.6-2.2c.4-.6.7-1.1.7-1.7 0-.8-.6-1.4-1.4-1.4-.8 0-1.3.5-1.5 1.3" />
                </svg>
            );
        }
        if (name === 'external') {
            return (
                <svg {...common} aria-hidden="true">
                    <path {...stroke} d="M14 3h7v7" />
                    <path {...stroke} d="M10 14L21 3" />
                    <path {...stroke} d="M21 14v7H3V3h7" />
                </svg>
            );
        }
        if (name === 'replay') {
            // Icône minimaliste “refresh/redo”
            return (
                <svg {...common} aria-hidden="true">
                    <path {...stroke} d="M20 11a8 8 0 1 0-2.3 5.7" />
                    <path {...stroke} d="M20 4v7h-7" />
                </svg>
            );
        }
        return null;
    };

    const [tapX, setTapX] = useState('');
    const [tapY, setTapY] = useState('');
    const [wakeDuration, setWakeDuration] = useState('5000');
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

    const stopPlayer = useCallback(() => {
        if (playerTimerRef.current) clearInterval(playerTimerRef.current);
        playerTimerRef.current = null;
        setPlayerPlaying(false);
    }, []);

    const resetScreenActivity = useCallback(() => {
        setScreenDays([]);
        setScreenDaysLoading(false);
        setScreenDaysError(null);
        setSelectedScreenDay('');

        setDayIndex(null);
        setDayIndexLoading(false);
        setDayIndexError(null);

        stopPlayer();
        setPlayerDay('');
        setPlayerHour(null);
        setPlayerFrames([]);
        setPlayerLoading(false);
        setPlayerError(null);
        setPlayerIndex(0);
        setPlayerSpeed(1);
    }, [stopPlayer]);

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

    // Player "video" loop (frame par frame)
    useEffect(() => {
        if (playerTimerRef.current) clearInterval(playerTimerRef.current);
        playerTimerRef.current = null;

        if (viewerMode !== 'player') return;
        if (!playerPlaying) return;
        if (!Array.isArray(playerFrames) || playerFrames.length <= 1) return;

        const baseFps = 6;
        const speed = Number(playerSpeed) || 1;
        const fps = Math.max(1, Math.min(60, Math.round(baseFps * speed)));
        const intervalMs = Math.round(1000 / fps);

        playerTimerRef.current = setInterval(() => {
            setPlayerIndex((i) => {
                const next = i + 1;
                if (next >= playerFrames.length) return i;
                return next;
            });
        }, intervalMs);

        return () => {
            if (playerTimerRef.current) clearInterval(playerTimerRef.current);
            playerTimerRef.current = null;
        };
    }, [playerFrames, playerPlaying, playerSpeed, viewerMode]);

    // Stop auto at end
    useEffect(() => {
        if (viewerMode !== 'player') return;
        if (!playerPlaying) return;
        if (!Array.isArray(playerFrames) || playerFrames.length === 0) return;
        if (playerIndex >= playerFrames.length - 1) stopPlayer();
    }, [playerFrames, playerIndex, playerPlaying, stopPlayer, viewerMode]);

    // Load days when entering Screen activity
    useEffect(() => {
        if (historyMode !== 'screen_activity') return;
        if (!selectedDeviceId) return;

        let cancelled = false;
        setScreenDaysLoading(true);
        setScreenDaysError(null);

        fetchAndroidScreenshotDays(selectedDeviceId)
            .then((days) => {
                if (cancelled) return;
                const list = Array.isArray(days) ? days : [];
                setScreenDays(list);
                setSelectedScreenDay((prev) => prev || (list[0]?.name ? String(list[0].name) : ''));
            })
            .catch((e) => {
                if (cancelled) return;
                setScreenDaysError(e?.message || 'Erreur jours');
            })
            .finally(() => {
                if (cancelled) return;
                setScreenDaysLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [historyMode, selectedDeviceId]);

    // Load day index when day changes
    useEffect(() => {
        if (historyMode !== 'screen_activity') return;
        if (!selectedDeviceId || !selectedScreenDay) return;

        let cancelled = false;
        setDayIndexLoading(true);
        setDayIndexError(null);

        fetchAndroidScreenshotDayIndex(selectedDeviceId, selectedScreenDay, { maxFiles: 5000 })
            .then((data) => {
                if (cancelled) return;
                setDayIndex(data);
            })
            .catch((e) => {
                if (cancelled) return;
                setDayIndex(null);
                setDayIndexError(e?.message || 'Erreur index');
            })
            .finally(() => {
                if (cancelled) return;
                setDayIndexLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [historyMode, selectedDeviceId, selectedScreenDay]);

    const startPlayerForHour = useCallback(
        async (hour) => {
            if (!selectedDeviceId) return;
            const h = Number(hour);
            if (!Number.isFinite(h) || h < 0 || h > 23) return;
            const day = String(selectedScreenDay || '');
            if (!day) return;

            setViewerMode('player');
            setAutoRefreshScreenshot(false);
            setPlayerError(null);
            setPlayerLoading(true);
            stopPlayer();

            setPlayerDay(day);
            setPlayerHour(h);
            setPlayerFrames([]);
            setPlayerIndex(0);

            try {
                const data = await fetchAndroidScreenshotFrames(selectedDeviceId, day, h, { limit: 1200 });
                const frames = Array.isArray(data?.frames) ? data.frames : [];
                setPlayerFrames(frames);
                setPlayerIndex(0);
                setPlayerPlaying(frames.length > 1);
            } catch (e) {
                setPlayerError(e?.message || 'Erreur player');
            } finally {
                setPlayerLoading(false);
            }
        },
        [selectedDeviceId, selectedScreenDay, stopPlayer]
    );

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
            case 'wake_lock':
                return { durationMs: safeInt(wakeDuration, 5000) };
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
        useAdvancedPayload,
        wakeDuration
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

    const replayCommand = useCallback(
        async (cmd) => {
            const type = safeStr(cmd?.command_type);
            if (!type) return;
            const payload =
                cmd?.payload && typeof cmd.payload === 'object' && !Array.isArray(cmd.payload) ? cmd.payload : {};

            await sendQuick(type, payload);

            // Bonus: si TAKE_SCREENSHOT, refresh screenshot après un petit délai (comme dans send()).
            if (type === 'global_action' && payload?.action === 'TAKE_SCREENSHOT') {
                setTimeout(() => refreshScreenshot().catch(() => {}), 1200);
            }
        },
        [refreshScreenshot, sendQuick]
    );

    const onSelectDevice = (id) => {
        setSelectedDeviceId(id);
        setScreenshot(null);
        setScreenshotError(null);
        setSendError(null);
        resetScreenActivity();
        setViewerMode('live');
        setAutoRefreshScreenshot(true);
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
                            Refresh devices
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
                                    <div className="android-card-title">Monitoring</div>
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
                                        onClick={() => sendQuick('wake_lock', { durationMs: 5000 }).catch(() => {})}
                                    >
                                        Wake
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
                                                <label>Interact</label>
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

                                                    {commandType === 'wake_lock' ? (
                                                        <div className="android-field">
                                                            <label>durationMs</label>
                                                            <input
                                                                value={wakeDuration}
                                                                onChange={(e) => setWakeDuration(e.target.value)}
                                                            />
                                                            <div className="android-muted">Allume l’écran via WakeLock (best-effort).</div>
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
                                                {/* <button
                                                    type="button"
                                                    className="conversions-pagination-btn"
                                                    disabled={!selectedDeviceId || sending}
                                                    onClick={() => loadDeviceData().catch(() => {})}
                                                >
                                                    Rafraîchir
                                                </button> */}
                                            </div>

                                            {sendError ? <div className="error">{sendError}</div> : null}
                                        </div>
                                    </div>

                                    <div className="android-interaction-right">
                                        <div className="android-history-header">
                                            <div className="android-muted">Historic</div>
                                            <div className="android-history-switch">
                                                <button
                                                    type="button"
                                                    className={`conversions-pagination-btn${historyMode === 'screen_activity' ? ' is-active' : ''}`}
                                                    onClick={() => setHistoryMode('screen_activity')}
                                                >
                                                    Screen activity
                                                </button>
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

                                        {historyMode === 'screen_activity' ? (
                                            <div className="android-list">
                                                <div className="android-field" style={{ marginBottom: 6 }}>
                                                    <label>Jour</label>
                                                    <select
                                                        value={selectedScreenDay}
                                                        onChange={(e) => {
                                                            stopPlayer();
                                                            setSelectedScreenDay(e.target.value);
                                                        }}
                                                        disabled={screenDaysLoading || !screenDays?.length}
                                                    >
                                                        {!screenDays?.length ? (
                                                            <option value="">Aucun jour</option>
                                                        ) : (
                                                            screenDays.map((d) => (
                                                                <option key={d.name} value={d.name}>
                                                                    {d.name}
                                                                </option>
                                                            ))
                                                        )}
                                                    </select>
                                                </div>

                                                {screenDaysError ? <div className="error">{screenDaysError}</div> : null}
                                                {screenDaysLoading ? (
                                                    <div className="android-muted">Chargement des jours…</div>
                                                ) : null}

                                                {dayIndexError ? <div className="error">{dayIndexError}</div> : null}
                                                {dayIndexLoading ? (
                                                    <div className="android-muted">Analyse des screenshots…</div>
                                                ) : null}

                                                {dayIndex?.truncated ? (
                                                    <div className="android-muted">
                                                        Index partiel (scan limité) — certaines heures peuvent manquer.
                                                    </div>
                                                ) : null}

                                                {Array.isArray(dayIndex?.hours) && dayIndex.hours.length > 0 ? (
                                                    <div className="android-hours-grid">
                                                        {dayIndex.hours.map((h) => (
                                                            <button
                                                                key={h.hour}
                                                                type="button"
                                                                className="android-hour-card"
                                                                onClick={() => startPlayerForHour(h.hour)}
                                                            >
                                                                <div className="android-hour-title">{pad2(h.hour)}:00</div>
                                                                <div className="android-muted">{h.count} frame(s)</div>
                                                            </button>
                                                        ))}
                                                    </div>
                                                ) : !dayIndexLoading ? (
                                                    <div className="android-muted">Aucune activité sur ce jour.</div>
                                                ) : null}
                                            </div>
                                        ) : historyMode === 'events' ? (
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
                                                                <div className="android-list-item-actions">
                                                                    <button
                                                                        type="button"
                                                                        className="android-icon-btn"
                                                                        title="Rejouer la commande"
                                                                        aria-label="Rejouer la commande"
                                                                        disabled={sending || !selectedDeviceId}
                                                                        onClick={() => replayCommand(c)}
                                                                    >
                                                                        <PlayerIcon name="replay" />
                                                                    </button>
                                                                    <span className={`android-badge ${c.status || ''}`}>
                                                                        {c.status || '—'}
                                                                    </span>
                                                                </div>
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
                                    <div className="android-card-title">Viewer</div>
                                </div>
                                <div className="android-actions">
                                    {/* <button
                                        type="button"
                                        className="conversions-pagination-btn"
                                        disabled={!selectedDeviceId}
                                        onClick={() => refreshScreenshot().catch(() => {})}
                                    >
                                        Rafraîchir
                                    </button> */}
                                    <div className="android-history-switch" role="tablist" aria-label="Mode viewer">
                                        <button
                                            type="button"
                                            role="tab"
                                            aria-selected={viewerMode === 'live'}
                                            className={`conversions-pagination-btn${viewerMode === 'live' ? ' is-active' : ''}`}
                                            onClick={() => {
                                                stopPlayer();
                                                setViewerMode('live');
                                                setAutoRefreshScreenshot(true);
                                                refreshScreenshot().catch(() => {});
                                            }}
                                        >
                                            Live
                                        </button>
                                        <button
                                            type="button"
                                            role="tab"
                                            aria-selected={viewerMode === 'player'}
                                            className={`conversions-pagination-btn${viewerMode === 'player' ? ' is-active' : ''}`}
                                            onClick={() => {
                                                setViewerMode('player');
                                                setAutoRefreshScreenshot(false);
                                            }}
                                        >
                                            Player
                                        </button>
                                    </div>
                                </div>
                            </header>

                            <div className="android-card-body">
                                {screenshotError ? <div className="error">{screenshotError}</div> : null}

                                <div className="android-screenshot-wrap">
                                    {viewerMode === 'player' ? (
                                        <div className="android-player">
                                            {playerError ? <div className="error">{playerError}</div> : null}
                                            {playerLoading ? <div className="android-muted">Chargement des frames…</div> : null}

                                            {playerFrames?.length ? (
                                                <div className="android-player-surface">
                                                    <button
                                                        type="button"
                                                        className="android-player-clicklayer"
                                                        aria-label={playerPlaying ? 'Pause' : 'Play'}
                                                        onClick={() => {
                                                            if ((playerFrames?.length ?? 0) <= 1) return;
                                                            setPlayerPlaying((v) => !v);
                                                        }}
                                                    >
                                                        {/* overlay is handled by CSS */}
                                                    </button>

                                                    <img
                                                        className="android-screenshot android-player-frame"
                                                        src={playerFrames[Math.min(playerIndex, playerFrames.length - 1)]?.url}
                                                        alt="Player frame"
                                                        loading="eager"
                                                    />

                                                    <div className="android-player-overlay" aria-hidden={playerLoading ? 'true' : 'false'}>
                                                        <input
                                                            className="android-player-progress"
                                                            type="range"
                                                            min={0}
                                                            max={Math.max(0, playerFrames.length - 1)}
                                                            value={Math.min(playerIndex, playerFrames.length - 1)}
                                                            onChange={(e) => {
                                                                stopPlayer();
                                                                setPlayerIndex(Number(e.target.value));
                                                            }}
                                                        />

                                                        <div className="android-player-controls">
                                                            <button
                                                                type="button"
                                                                className="android-player-btn"
                                                                disabled={playerLoading || !playerFrames?.length}
                                                                aria-label="Reculer de 10"
                                                                onClick={() => {
                                                                    if (!playerFrames?.length) return;
                                                                    setPlayerIndex((i) => Math.max(0, i - 10));
                                                                    stopPlayer();
                                                                }}
                                                            >
                                                                <PlayerIcon name="rewind10" />
                                                            </button>

                                                            <button
                                                                type="button"
                                                                className="android-player-btn android-player-btn--primary"
                                                                disabled={playerLoading || (playerFrames?.length ?? 0) <= 1}
                                                                aria-label={playerPlaying ? 'Pause' : 'Play'}
                                                                onClick={() => setPlayerPlaying((v) => !v)}
                                                            >
                                                                <PlayerIcon name={playerPlaying ? 'pause' : 'play'} />
                                                            </button>

                                                            <button
                                                                type="button"
                                                                className="android-player-btn"
                                                                disabled={playerLoading || !playerFrames?.length}
                                                                aria-label="Avancer de 10"
                                                                onClick={() => {
                                                                    if (!playerFrames?.length) return;
                                                                    setPlayerIndex((i) => Math.min(playerFrames.length - 1, i + 10));
                                                                    stopPlayer();
                                                                }}
                                                            >
                                                                <PlayerIcon name="forward10" />
                                                            </button>

                                                            <div className="android-player-spacer" />

                                                            <button
                                                                type="button"
                                                                className="android-player-pill"
                                                                disabled={playerLoading || (playerFrames?.length ?? 0) <= 1}
                                                                aria-label="Changer la vitesse"
                                                                onClick={() =>
                                                                    setPlayerSpeed((v) => {
                                                                        const speeds = [0.25, 0.5, 1, 2, 4, 8];
                                                                        const idx = speeds.indexOf(Number(v));
                                                                        const next = speeds[(idx >= 0 ? idx + 1 : 2) % speeds.length];
                                                                        return next;
                                                                    })
                                                                }
                                                            >
                                                                x{fmtSpeed(playerSpeed)}
                                                            </button>

                                                            {playerFrames[Math.min(playerIndex, playerFrames.length - 1)]?.url ? (
                                                                <a
                                                                    className="android-player-btn android-player-link"
                                                                    href={playerFrames[Math.min(playerIndex, playerFrames.length - 1)]?.url}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    aria-label="Ouvrir l’image dans un nouvel onglet"
                                                                >
                                                                    <PlayerIcon name="external" />
                                                                </a>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="android-muted">
                                                    {playerDay && playerHour !== null
                                                        ? 'Aucune frame sur cette tranche horaire (ou scan limité).'
                                                        : 'Choisis une tranche horaire dans Historic → Screen activity.'}
                                                </div>
                                            )}
                                        </div>
                                    ) : screenshot?.url ? (
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
                                                {/* <span>
                                                    {screenshot?.updatedAt ? `maj ${fmtDate(screenshot.updatedAt)}` : ''}
                                                </span> */}
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

