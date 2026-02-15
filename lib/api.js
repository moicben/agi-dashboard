export const CONFIG_API_URL = '/api/config';
export const CONTAINERS_API_URL = '/api/instances';
export const MEETINGS_API_URL = '/api/meetings';
export const ANALYTICS_API_URL = '/api/analytics';
export const CONVERSIONS_API_URL = '/api/conversions';
export const BEST_QUERIES_API_URL = '/api/best-queries';
export const ANDROID_DEVICES_API_URL = '/api/android/devices';
export const ANDROID_EVENTS_API_URL = '/api/android/events';
export const ANDROID_COMMANDS_API_URL = '/api/android/commands';
export const ANDROID_SEND_COMMAND_API_URL = '/api/android/send-command';
export const ANDROID_LATEST_SCREENSHOT_API_URL = '/api/android/latest-screenshot';
export const ANDROID_SCREENSHOT_DAYS_API_URL = '/api/android/screenshot-days';
export const ANDROID_SCREENSHOT_DAY_INDEX_API_URL = '/api/android/screenshot-day-index';
export const ANDROID_SCREENSHOT_FRAMES_API_URL = '/api/android/screenshot-frames';
export const ANDROID_SCREENSHOT_DAY_MANIFEST_API_URL = '/api/android/screenshot-day-manifest';
export const ANDROID_SCREENSHOT_FRAME_URL_API_URL = '/api/android/screenshot-frame-url';

async function parseJsonResponse(response) {
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage =
            errorData.message ||
            errorData.error ||
            `Erreur HTTP ${response.status}: ${response.statusText}`;
        throw new Error(errorMessage);
    }
    return response.json();
}

export async function fetchConfig() {
    const response = await fetch(CONFIG_API_URL);
    const config = await parseJsonResponse(response);

    if (!config.incusServer || !config.ipPrefix) {
        throw new Error('Configuration incomplète reçue du serveur');
    }

    return config;
}

export async function fetchContainers() {
    const response = await fetch(CONTAINERS_API_URL);
    const data = await parseJsonResponse(response);
    return data.containers || [];
}

export async function fetchMeetings(startDate, endDate) {
    const response = await fetch(
        `${MEETINGS_API_URL}?start=${startDate.toISOString()}&end=${endDate.toISOString()}`
    );
    const data = await parseJsonResponse(response);
    return data.meetings || [];
}

export async function fetchAnalytics(startDate = null, endDate = null, identityId = null) {
    let url = ANALYTICS_API_URL;

    const params = new URLSearchParams();
    if (startDate && endDate) {
        params.set('start', startDate.toISOString());
        params.set('end', endDate.toISOString());
    }
    if (identityId) {
        params.set('identityId', String(identityId));
    }

    const qs = params.toString();
    if (qs) url += `?${qs}`;

    const response = await fetch(url);
    const data = await parseJsonResponse(response);
    return data;
}

export async function fetchConversions(startDate = null, endDate = null, identityId = null, page = 0, eventType = null) {
    let url = CONVERSIONS_API_URL;

    const params = new URLSearchParams();
    if (startDate && endDate) {
        params.set('start', startDate.toISOString());
        params.set('end', endDate.toISOString());
    }
    if (identityId) {
        params.set('identityId', String(identityId));
    }
    params.set('page', String(page));
    if (eventType && String(eventType).trim().toLowerCase() !== 'all') {
        params.set('eventType', String(eventType));
    }

    const qs = params.toString();
    if (qs) url += `?${qs}`;

    const response = await fetch(url);
    const data = await parseJsonResponse(response);
    return data;
}

export async function fetchBestQueries(startDate = null, endDate = null, identityId = null, limit = 25) {
    let url = BEST_QUERIES_API_URL;

    const params = new URLSearchParams();
    if (startDate && endDate) {
        params.set('start', startDate.toISOString());
        params.set('end', endDate.toISOString());
    }
    if (identityId) {
        params.set('identityId', String(identityId));
    }
    params.set('limit', String(limit));

    const qs = params.toString();
    if (qs) url += `?${qs}`;

    const response = await fetch(url);
    const data = await parseJsonResponse(response);
    return data;
}

export async function fetchAndroidDevices() {
    const response = await fetch(ANDROID_DEVICES_API_URL, { cache: 'no-store' });
    const data = await parseJsonResponse(response);
    return Array.isArray(data?.devices) ? data.devices : [];
}

export async function fetchAndroidEvents(deviceId, limit = 120) {
    const params = new URLSearchParams();
    params.set('deviceId', String(deviceId ?? ''));
    params.set('limit', String(limit));
    const response = await fetch(`${ANDROID_EVENTS_API_URL}?${params.toString()}`, { cache: 'no-store' });
    const data = await parseJsonResponse(response);
    return Array.isArray(data?.events) ? data.events : [];
}

export async function fetchAndroidCommands(deviceId, limit = 80) {
    const params = new URLSearchParams();
    params.set('deviceId', String(deviceId ?? ''));
    params.set('limit', String(limit));
    const response = await fetch(`${ANDROID_COMMANDS_API_URL}?${params.toString()}`, { cache: 'no-store' });
    const data = await parseJsonResponse(response);
    return Array.isArray(data?.commands) ? data.commands : [];
}

export async function sendAndroidCommand({ deviceId, commandType, payload }) {
    const response = await fetch(ANDROID_SEND_COMMAND_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            deviceId,
            commandType,
            payload: payload ?? {}
        })
    });
    const data = await parseJsonResponse(response);
    return data?.command ?? null;
}

export async function fetchAndroidLatestScreenshot(deviceId) {
    const params = new URLSearchParams();
    params.set('deviceId', String(deviceId ?? ''));
    const response = await fetch(`${ANDROID_LATEST_SCREENSHOT_API_URL}?${params.toString()}`, { cache: 'no-store' });
    const data = await parseJsonResponse(response);
    return data;
}

export async function fetchAndroidScreenshotDays(deviceId) {
    const params = new URLSearchParams();
    params.set('deviceId', String(deviceId ?? ''));
    const response = await fetch(`${ANDROID_SCREENSHOT_DAYS_API_URL}?${params.toString()}`, { cache: 'no-store' });
    const data = await parseJsonResponse(response);
    return Array.isArray(data?.days) ? data.days : [];
}

export async function fetchAndroidScreenshotDayIndex(deviceId, day, { maxFiles = 5000 } = {}) {
    const params = new URLSearchParams();
    params.set('deviceId', String(deviceId ?? ''));
    params.set('day', String(day ?? ''));
    params.set('maxFiles', String(maxFiles));
    const response = await fetch(`${ANDROID_SCREENSHOT_DAY_INDEX_API_URL}?${params.toString()}`, { cache: 'no-store' });
    const data = await parseJsonResponse(response);
    return data;
}

export async function fetchAndroidScreenshotFrames(deviceId, day, hour, { limit = 1200 } = {}) {
    const params = new URLSearchParams();
    params.set('deviceId', String(deviceId ?? ''));
    params.set('day', String(day ?? ''));
    params.set('hour', String(hour ?? ''));
    params.set('limit', String(limit));
    const response = await fetch(`${ANDROID_SCREENSHOT_FRAMES_API_URL}?${params.toString()}`, { cache: 'no-store' });
    const data = await parseJsonResponse(response);
    return data;
}

export async function fetchAndroidScreenshotDayManifest(deviceId, day, { maxFiles = 20000 } = {}) {
    const params = new URLSearchParams();
    params.set('deviceId', String(deviceId ?? ''));
    params.set('day', String(day ?? ''));
    params.set('maxFiles', String(maxFiles));
    const response = await fetch(`${ANDROID_SCREENSHOT_DAY_MANIFEST_API_URL}?${params.toString()}`, { cache: 'no-store' });
    const data = await parseJsonResponse(response);
    return data;
}

export async function fetchAndroidScreenshotFrameUrl(deviceId, day, name, { expiresIn = 300 } = {}) {
    const params = new URLSearchParams();
    params.set('deviceId', String(deviceId ?? ''));
    params.set('day', String(day ?? ''));
    params.set('name', String(name ?? ''));
    params.set('expiresIn', String(expiresIn));
    const response = await fetch(`${ANDROID_SCREENSHOT_FRAME_URL_API_URL}?${params.toString()}`, { cache: 'no-store' });
    const data = await parseJsonResponse(response);
    return data;
}
