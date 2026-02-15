import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ViewShell from '../ViewShell.jsx';
import {
    fetchAndroidCommands,
    fetchAndroidDevices,
    fetchAndroidEvents,
    fetchAndroidScreenshotDayManifest,
    fetchAndroidLatestScreenshot,
    fetchAndroidScreenshotDayIndex,
    fetchAndroidScreenshotDays,
    fetchAndroidScreenshotFrameUrl,
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
    { value: 'open_app', label: 'Open app' },
    { value: 'ping', label: 'Ping (debug)' },
    { value: 'wake_lock', label: 'Wake lock (power)' },
    { value: 'keep_awake_activity', label: 'Keep screen on (activity)' },
    { value: 'open_settings', label: 'Open Settings' }
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

const SETTINGS_SCREENS = [
    { value: 'APP_DETAILS', label: 'App details (this app)' },
    { value: 'ACCESSIBILITY', label: 'Accessibility settings' },
    { value: 'BATTERY_OPTIMIZATIONS', label: 'Battery optimizations' },
    { value: 'REQUEST_IGNORE_BATTERY_OPTIMIZATIONS', label: 'Request ignore battery optimizations (prompt)' },
    { value: 'OVERLAY', label: 'Overlay permission (draw over apps)' },
    { value: 'WRITE_SETTINGS', label: 'Write settings permission' }
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

function fmtStatusLabel(status) {
    const s = String(status || '').trim().toLowerCase();
    if (!s) return '—';
    if (s === 'pending') return 'en attente';
    if (s === 'running' || s === 'in_progress') return 'en cours';
    if (s === 'done') return 'réussie';
    if (s === 'error' || s === 'failed') return 'échec';
    return s;
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
    const [playerHours, setPlayerHours] = useState([]);
    const [playerLoading, setPlayerLoading] = useState(false);
    const [playerError, setPlayerError] = useState(null);
    const [playerIndex, setPlayerIndex] = useState(0);
    const [playerPlaying, setPlayerPlaying] = useState(false);
    const [playerScrubbing, setPlayerScrubbing] = useState(false);
    const [playerSpeed, setPlayerSpeed] = useState(1); // x1,x2,x4,x8
    const [playerFrameVersion, setPlayerFrameVersion] = useState(0);
    const [playerDisplayedUrl, setPlayerDisplayedUrl] = useState('');
    const [playerPendingUrl, setPlayerPendingUrl] = useState('');
    const [playerPendingIndex, setPlayerPendingIndex] = useState(-1);
    const playerTimerRef = useRef(null);
    const playerFrameCacheRef = useRef(new Map());
    const playerFrameInflightRef = useRef(new Map());
    const playerPrefetchCursorRef = useRef(-9999);
    const playerManifestCacheRef = useRef(new Map());
    const playerManifestInflightRef = useRef(new Map());

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

    // Extensions (non-ADB)
    const [wakeLockAction, setWakeLockAction] = useState('acquire'); // acquire | release
    const [wakeLockDuration, setWakeLockDuration] = useState('600000'); // ms
    const [keepAwakeFinishAfter, setKeepAwakeFinishAfter] = useState('0'); // ms, 0=ne pas auto-fermer
    const [keepAwakeTurnScreenOn, setKeepAwakeTurnScreenOn] = useState(true);
    const [keepAwakeShowWhenLocked, setKeepAwakeShowWhenLocked] = useState(false);
    const [settingsScreen, setSettingsScreen] = useState('APP_DETAILS');

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

    const clearPlayerFrameCache = useCallback(() => {
        playerFrameCacheRef.current.clear();
        playerFrameInflightRef.current.clear();
        playerPrefetchCursorRef.current = -9999;
        setPlayerPendingUrl('');
        setPlayerPendingIndex(-1);
        setPlayerDisplayedUrl('');
        setPlayerFrameVersion((v) => v + 1);
    }, []);

    const getPlayerCacheKey = useCallback((day, frameName) => `${String(day || '')}::${String(frameName || '')}`, []);

    const requestFrameByIndex = useCallback(
        async (index, { expiresIn = 300 } = {}) => {
            if (!selectedDeviceId) return null;
            const day = String(playerDay || '');
            if (!day) return null;

            const i = Number(index);
            if (!Number.isFinite(i) || i < 0 || i >= playerFrames.length) return null;

            const frame = playerFrames[i];
            const frameName = String(frame?.name || '');
            if (!frameName) return null;

            const key = getPlayerCacheKey(day, frameName);
            const existing = playerFrameCacheRef.current.get(key);
            if (existing?.url) return existing;

            const inflight = playerFrameInflightRef.current.get(key);
            if (inflight) return inflight;

            const promise = fetchAndroidScreenshotFrameUrl(selectedDeviceId, day, frameName, { expiresIn })
                .then((data) => {
                    const next = {
                        url: data?.url || null,
                        path: data?.path || frame?.path || null,
                        name: frameName,
                        index: i,
                        fetchedAt: Date.now()
                    };
                    playerFrameCacheRef.current.set(key, next);
                    setPlayerFrameVersion((v) => v + 1);
                    return next;
                })
                .finally(() => {
                    playerFrameInflightRef.current.delete(key);
                });

            playerFrameInflightRef.current.set(key, promise);
            return promise;
        },
        [getPlayerCacheKey, playerDay, playerFrames, selectedDeviceId]
    );

    const evictFrameCache = useCallback(() => {
        if (!playerFrames.length || !playerDay) return;

        const keepMin = Math.max(0, playerIndex - 80);
        const keepMax = Math.min(playerFrames.length - 1, playerIndex + 220);
        const maxCacheEntries = 340;
        const entries = Array.from(playerFrameCacheRef.current.entries());
        let changed = false;

        for (const [key, value] of entries) {
            if (typeof value?.index !== 'number') continue;
            if (value.index < keepMin || value.index > keepMax) {
                playerFrameCacheRef.current.delete(key);
                changed = true;
            }
        }

        if (playerFrameCacheRef.current.size > maxCacheEntries) {
            const sorted = Array.from(playerFrameCacheRef.current.entries()).sort(
                (a, b) => Number(a?.[1]?.fetchedAt || 0) - Number(b?.[1]?.fetchedAt || 0)
            );
            const toDelete = playerFrameCacheRef.current.size - maxCacheEntries;
            for (let i = 0; i < toDelete; i += 1) {
                const key = sorted[i]?.[0];
                if (!key) continue;
                playerFrameCacheRef.current.delete(key);
                changed = true;
            }
        }

        if (changed) setPlayerFrameVersion((v) => v + 1);
    }, [playerDay, playerFrames.length, playerIndex]);

    const loadPlayerManifest = useCallback(
        async (day) => {
            if (!selectedDeviceId || !day) return null;
            const d = String(day);
            const cached = playerManifestCacheRef.current.get(d);
            if (cached?.frames?.length) {
                if (playerDay !== d || playerFrames !== cached.frames) {
                    setPlayerDay(d);
                    setPlayerFrames(cached.frames);
                    setPlayerHours(cached.hours || []);
                    setPlayerIndex((prev) => {
                        if (!Number.isFinite(prev)) return 0;
                        return Math.max(0, Math.min((cached.frames?.length || 1) - 1, Math.trunc(prev)));
                    });
                }
                return cached;
            }

            const inflight = playerManifestInflightRef.current.get(d);
            if (inflight) return inflight;

            const promise = (async () => {
                setPlayerLoading(true);
                setPlayerError(null);
                try {
                    const data = await fetchAndroidScreenshotDayManifest(selectedDeviceId, d, { maxFiles: 30000 });
                    const frames = Array.isArray(data?.frames) ? data.frames : [];
                    const hours = Array.isArray(data?.hours) ? data.hours : [];
                    const result = { day: d, frames, hours };
                    playerManifestCacheRef.current.set(d, result);

                    const dayChanged = playerDay !== d;
                    setPlayerDay(d);
                    setPlayerFrames(frames);
                    setPlayerHours(hours);
                    setPlayerIndex((prev) => {
                        if (!Number.isFinite(prev)) return 0;
                        return Math.max(0, Math.min(frames.length - 1, Math.trunc(prev)));
                    });
                    if (dayChanged) clearPlayerFrameCache();
                    return result;
                } catch (e) {
                    setPlayerFrames([]);
                    setPlayerHours([]);
                    setPlayerError(e?.message || 'Erreur player');
                    return null;
                } finally {
                    setPlayerLoading(false);
                    playerManifestInflightRef.current.delete(d);
                }
            })();

            playerManifestInflightRef.current.set(d, promise);
            return promise;
        },
        [clearPlayerFrameCache, playerDay, playerFrames, selectedDeviceId]
    );

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
        setPlayerHours([]);
        setPlayerLoading(false);
        setPlayerError(null);
        setPlayerIndex(0);
        setPlayerScrubbing(false);
        setPlayerSpeed(1);
        playerManifestCacheRef.current.clear();
        playerManifestInflightRef.current.clear();
        clearPlayerFrameCache();
    }, [clearPlayerFrameCache, stopPlayer]);

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

        const baseFps = 2;
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

    useEffect(() => {
        if (viewerMode !== 'player') return;
        if (!playerFrames.length) return;
        requestFrameByIndex(playerIndex, { expiresIn: playerScrubbing ? 120 : 300 }).catch(() => {});
    }, [playerFrames.length, playerIndex, playerScrubbing, requestFrameByIndex, viewerMode]);

    useEffect(() => {
        if (viewerMode !== 'player') return;
        if (!playerFrames.length) return;

        const shouldPrefetch =
            !playerPlaying ||
            playerScrubbing ||
            Math.abs(playerIndex - Number(playerPrefetchCursorRef.current || 0)) >= 8;
        if (!shouldPrefetch) return;
        playerPrefetchCursorRef.current = playerIndex;

        const ahead = playerScrubbing ? 3 : playerPlaying ? 24 : 10;
        const behind = playerScrubbing ? 1 : playerPlaying ? 4 : 3;
        const maxRequests = playerScrubbing ? 1 : playerPlaying ? 2 : 2;
        const expiresIn = playerScrubbing ? 120 : 300;

        const targets = [playerIndex];
        for (let i = 1; i <= ahead; i += 1) targets.push(playerIndex + i);
        for (let i = 1; i <= behind; i += 1) targets.push(playerIndex - i);

        const bounded = targets.filter((i) => Number.isFinite(i) && i >= 0 && i < playerFrames.length);
        const fetchList = [];

        for (const i of bounded) {
            const frame = playerFrames[i];
            const frameName = String(frame?.name || '');
            if (!frameName) continue;
            const key = getPlayerCacheKey(playerDay, frameName);
            if (playerFrameCacheRef.current.has(key) || playerFrameInflightRef.current.has(key)) continue;
            fetchList.push(i);
            if (fetchList.length >= maxRequests) break;
        }

        if (fetchList.length > 0) {
            Promise.allSettled(fetchList.map((i) => requestFrameByIndex(i, { expiresIn }))).catch(() => {});
        }

        evictFrameCache();
    }, [
        evictFrameCache,
        getPlayerCacheKey,
        playerDay,
        playerFrames,
        playerIndex,
        playerPlaying,
        playerScrubbing,
        requestFrameByIndex,
        viewerMode
    ]);

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

    useEffect(() => {
        if (historyMode !== 'screen_activity') return;
        if (!selectedDeviceId || !selectedScreenDay) return;

        let cancelled = false;
        loadPlayerManifest(selectedScreenDay)
            .then((data) => {
                if (cancelled) return;
                if (!data?.frames?.length) return;
                requestFrameByIndex(0, { expiresIn: 300 }).catch(() => {});
            })
            .catch(() => {});

        return () => {
            cancelled = true;
        };
    }, [historyMode, loadPlayerManifest, requestFrameByIndex, selectedDeviceId, selectedScreenDay]);

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
            stopPlayer();
            setPlayerHour(h);

            const manifest = await loadPlayerManifest(day);
            const frames = Array.isArray(manifest?.frames) ? manifest.frames : [];
            if (!frames.length) {
                setPlayerIndex(0);
                return;
            }

            const hours = Array.isArray(manifest?.hours) ? manifest.hours : [];
            const byHour = hours.find((x) => Number(x?.hour) === h);
            let seekIndex = Number(byHour?.firstIndex);
            if (!Number.isFinite(seekIndex)) {
                const fallback = frames.findIndex((f) => Number(f?.hour) === h);
                seekIndex = fallback >= 0 ? fallback : 0;
            }

            const bounded = Math.max(0, Math.min(frames.length - 1, Math.trunc(seekIndex)));
            setPlayerIndex(bounded);
            requestFrameByIndex(bounded, { expiresIn: 300 }).catch(() => {});
        },
        [loadPlayerManifest, requestFrameByIndex, selectedDeviceId, selectedScreenDay, stopPlayer]
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
            case 'ping':
                return {};
            case 'wake_lock': {
                const action = safeStr(wakeLockAction) || 'acquire';
                if (action.toLowerCase() === 'release') return { action: 'release' };
                return { action: 'acquire', durationMs: safeInt(wakeLockDuration, 600000) };
            }
            case 'keep_awake_activity':
                return {
                    finishAfterMs: safeInt(keepAwakeFinishAfter, 0),
                    turnScreenOn: Boolean(keepAwakeTurnScreenOn),
                    showWhenLocked: Boolean(keepAwakeShowWhenLocked)
                };
            case 'open_settings':
                return { screen: safeStr(settingsScreen) || 'APP_DETAILS' };
            default:
                return {};
        }
    }, [
        advancedPayload,
        commandType,
        ensureComponent,
        ensurePackage,
        globalAction,
        keepAwakeFinishAfter,
        keepAwakeShowWhenLocked,
        keepAwakeTurnScreenOn,
        longPressDuration,
        nodeMatch,
        nodeValue,
        openComponent,
        openPackage,
        settingsScreen,
        swipeDuration,
        swipeX1,
        swipeX2,
        swipeY1,
        swipeY2,
        tapX,
        tapY,
        textToSet,
        useAdvancedPayload
        ,
        wakeLockAction,
        wakeLockDuration
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
            if (commandType === 'wake_lock') {
                const a = String(payload?.action || '').toLowerCase();
                if (a !== 'acquire' && a !== 'release') throw new Error('wake_lock.action doit être acquire|release');
                if (a === 'acquire' && !Number.isFinite(Number(payload?.durationMs))) {
                    throw new Error('wake_lock.durationMs invalide');
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
        const hiddenEventTypes = new Set(['screenshot_heartbeat']);
        const items = Array.isArray(events)
            ? events
                  .filter((ev) => !hiddenEventTypes.has(String(ev?.event_type || ev?.events_type || '').toLowerCase()))
                  .slice(0, 24)
            : [];
        return items;
    }, [events]);

    const currentPlayerFrame = useMemo(() => {
        if (!Array.isArray(playerFrames) || playerFrames.length === 0) return null;
        const i = Math.max(0, Math.min(playerFrames.length - 1, Number(playerIndex) || 0));
        return playerFrames[i] || null;
    }, [playerFrames, playerIndex]);

    const currentPlayerCached = useMemo(() => {
        const frameName = String(currentPlayerFrame?.name || '');
        if (!frameName || !playerDay) return null;
        const key = getPlayerCacheKey(playerDay, frameName);
        return playerFrameCacheRef.current.get(key) || null;
    }, [currentPlayerFrame, getPlayerCacheKey, playerDay, playerFrameVersion]);

    const nearestPlayerCached = useMemo(() => {
        if (currentPlayerCached?.url) return currentPlayerCached;
        if (!playerDay || !playerFrames.length) return null;
        const center = Math.max(0, Math.min(playerFrames.length - 1, Number(playerIndex) || 0));
        const radius = 24;
        for (let step = 1; step <= radius; step += 1) {
            const left = center - step;
            if (left >= 0) {
                const leftName = String(playerFrames[left]?.name || '');
                if (leftName) {
                    const leftCached = playerFrameCacheRef.current.get(getPlayerCacheKey(playerDay, leftName));
                    if (leftCached?.url) return leftCached;
                }
            }
            const right = center + step;
            if (right < playerFrames.length) {
                const rightName = String(playerFrames[right]?.name || '');
                if (rightName) {
                    const rightCached = playerFrameCacheRef.current.get(getPlayerCacheKey(playerDay, rightName));
                    if (rightCached?.url) return rightCached;
                }
            }
        }
        return null;
    }, [currentPlayerCached, getPlayerCacheKey, playerDay, playerFrames, playerFrameVersion, playerIndex]);

    useEffect(() => {
        if (viewerMode !== 'player') return;
        if (!playerFrames.length) return;
        if (currentPlayerCached?.url && currentPlayerCached.url !== playerDisplayedUrl) {
            setPlayerPendingUrl(currentPlayerCached.url);
            setPlayerPendingIndex(Math.max(0, Math.min(playerFrames.length - 1, Number(playerIndex) || 0)));
            return;
        }
        if (!playerDisplayedUrl && nearestPlayerCached?.url) {
            setPlayerDisplayedUrl(nearestPlayerCached.url);
        }
    }, [
        currentPlayerCached,
        nearestPlayerCached,
        playerDisplayedUrl,
        playerFrames.length,
        playerIndex,
        viewerMode
    ]);

    const commitPendingFrameIfCurrent = useCallback((target) => {
        const loadedUrl = String(target?.getAttribute('src') || '');
        const loadedIndex = Number(target?.getAttribute('data-index'));
        setPlayerPendingUrl((pending) => {
            if (!pending || pending !== loadedUrl) return pending;
            setPlayerDisplayedUrl(loadedUrl);
            if (Number.isFinite(loadedIndex)) setPlayerPendingIndex(loadedIndex);
            return '';
        });
    }, []);

    const clearPendingFrameIfCurrent = useCallback((target) => {
        const loadedUrl = String(target?.getAttribute('src') || '');
        setPlayerPendingUrl((pending) => (pending && pending === loadedUrl ? '' : pending));
    }, []);

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
                                    <button
                                        type="button"
                                        className="conversions-pagination-btn"
                                        disabled={!selectedDeviceId || sending}
                                        onClick={() => sendQuick('ping', {}).catch(() => {})}
                                        title="Test rapide: vérifie que le device exécute bien les commandes"
                                    >
                                        Ping
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

                                                    {commandType === 'wake_lock' ? (
                                                        <>
                                                            <div className="android-field">
                                                                <label>action</label>
                                                                <select
                                                                    value={wakeLockAction}
                                                                    onChange={(e) => setWakeLockAction(e.target.value)}
                                                                >
                                                                    <option value="acquire">acquire</option>
                                                                    <option value="release">release</option>
                                                                </select>
                                                            </div>
                                                            {String(wakeLockAction).toLowerCase() === 'acquire' ? (
                                                                <div className="android-field">
                                                                    <label>durationMs (CPU wake lock)</label>
                                                                    <input
                                                                        value={wakeLockDuration}
                                                                        onChange={(e) => setWakeLockDuration(e.target.value)}
                                                                        placeholder="600000"
                                                                    />
                                                                </div>
                                                            ) : null}
                                                            <div className="android-muted">
                                                                Note: `wake_lock` garde surtout le CPU éveillé. Pour garder l’écran allumé,
                                                                utilise `keep_awake_activity`.
                                                            </div>
                                                        </>
                                                    ) : null}

                                                    {commandType === 'keep_awake_activity' ? (
                                                        <>
                                                            <div className="android-field">
                                                                <label>finishAfterMs (0 = ne pas fermer)</label>
                                                                <input
                                                                    value={keepAwakeFinishAfter}
                                                                    onChange={(e) => setKeepAwakeFinishAfter(e.target.value)}
                                                                    placeholder="0"
                                                                />
                                                            </div>
                                                            <div className="android-form-row">
                                                                <div className="android-field">
                                                                    <label>turnScreenOn</label>
                                                                    <select
                                                                        value={keepAwakeTurnScreenOn ? 'true' : 'false'}
                                                                        onChange={(e) => setKeepAwakeTurnScreenOn(e.target.value === 'true')}
                                                                    >
                                                                        <option value="true">true</option>
                                                                        <option value="false">false</option>
                                                                    </select>
                                                                </div>
                                                                <div className="android-field">
                                                                    <label>showWhenLocked</label>
                                                                    <select
                                                                        value={keepAwakeShowWhenLocked ? 'true' : 'false'}
                                                                        onChange={(e) => setKeepAwakeShowWhenLocked(e.target.value === 'true')}
                                                                    >
                                                                        <option value="false">false</option>
                                                                        <option value="true">true</option>
                                                                    </select>
                                                                </div>
                                                            </div>
                                                        </>
                                                    ) : null}

                                                    {commandType === 'open_settings' ? (
                                                        <div className="android-field">
                                                            <label>screen</label>
                                                            <select
                                                                value={settingsScreen}
                                                                onChange={(e) => setSettingsScreen(e.target.value)}
                                                            >
                                                                {SETTINGS_SCREENS.map((s) => (
                                                                    <option key={s.value} value={s.value}>
                                                                        {s.label}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </div>
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
                                                            setPlayerDay('');
                                                            setPlayerFrames([]);
                                                            setPlayerHours([]);
                                                            setPlayerIndex(0);
                                                            clearPlayerFrameCache();
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
                                                                <div className="android-hour-head">
                                                                    <div className="android-hour-title">{pad2(h.hour)}:00</div>
                                                                    <div className="android-muted android-hour-count">{h.count} frame(s)</div>
                                                                </div>
                                                                {h?.middleUrl ? (
                                                                    <img
                                                                        className="android-hour-thumb"
                                                                        src={h.middleUrl}
                                                                        alt={`Miniature ${pad2(h.hour)}:00`}
                                                                        loading="lazy"
                                                                    />
                                                                ) : null}
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
                                                                        {fmtStatusLabel(c.status)}
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
                                            onClick={async () => {
                                                setViewerMode('player');
                                                setAutoRefreshScreenshot(false);
                                                const day = String(selectedScreenDay || '');
                                                if (!day) return;
                                                const manifest = await loadPlayerManifest(day);
                                                if (manifest?.frames?.length) {
                                                    requestFrameByIndex(Math.min(playerIndex, manifest.frames.length - 1), {
                                                        expiresIn: 300
                                                    }).catch(() => {});
                                                }
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

                                                    {playerDisplayedUrl || nearestPlayerCached?.url ? (
                                                        <img
                                                            className="android-screenshot android-player-frame"
                                                            src={playerDisplayedUrl || nearestPlayerCached?.url}
                                                            alt="Player frame"
                                                            loading="eager"
                                                        />
                                                    ) : null}
                                                    {playerPendingUrl && playerPendingUrl !== playerDisplayedUrl ? (
                                                        <img
                                                            className="android-player-preload"
                                                            src={playerPendingUrl}
                                                            data-index={String(playerPendingIndex)}
                                                            alt=""
                                                            loading="eager"
                                                            onLoad={(e) => commitPendingFrameIfCurrent(e.currentTarget)}
                                                            onError={(e) => clearPendingFrameIfCurrent(e.currentTarget)}
                                                        />
                                                    ) : null}

                                                    <div className="android-player-overlay" aria-hidden={playerLoading ? 'true' : 'false'}>
                                                        <input
                                                            className="android-player-progress"
                                                            type="range"
                                                            min={0}
                                                            max={Math.max(0, playerFrames.length - 1)}
                                                            value={Math.min(playerIndex, playerFrames.length - 1)}
                                                            onPointerDown={() => setPlayerScrubbing(true)}
                                                            onPointerUp={() => setPlayerScrubbing(false)}
                                                            onMouseDown={() => setPlayerScrubbing(true)}
                                                            onMouseUp={() => setPlayerScrubbing(false)}
                                                            onTouchStart={() => setPlayerScrubbing(true)}
                                                            onTouchEnd={() => setPlayerScrubbing(false)}
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

                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="android-muted">
                                                    {playerDay && playerHour !== null
                                                        ? 'Aucune frame sur cette journée (ou scan limité).'
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

