import crypto from 'node:crypto';

function getRapidApiConfig() {
    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
    const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST;

    const missing = [];
    if (!RAPIDAPI_KEY) missing.push('RAPIDAPI_KEY');
    if (!RAPIDAPI_HOST) missing.push('RAPIDAPI_HOST');

    if (missing.length) {
        const err = new Error(
            `Configuration RapidAPI/Temp-Mail incomplète (variables manquantes: ${missing.join(', ')})`
        );
        err.code = 'RAPIDAPI_ENV_MISSING';
        err.missingVariables = missing;
        throw err;
    }

    return {
        baseUrl: `https://${RAPIDAPI_HOST}`,
        headers: {
            'X-RapidAPI-Key': RAPIDAPI_KEY,
            'X-RapidAPI-Host': RAPIDAPI_HOST
        }
    };
}

async function rapidFetchJson(pathname) {
    const { baseUrl, headers } = getRapidApiConfig();
    const url = `${baseUrl}${pathname.startsWith('/') ? '' : '/'}${pathname}`;

    const res = await fetch(url, { headers });
    const text = await res.text();

    if (!res.ok) {
        const err = new Error(`Temp-Mail API error ${res.status}: ${text || res.statusText}`);
        err.status = res.status;
        err.body = text;
        throw err;
    }

    try {
        return text ? JSON.parse(text) : null;
    } catch {
        return text;
    }
}

export function md5Lower(input) {
    return crypto.createHash('md5').update(String(input || '').trim().toLowerCase()).digest('hex');
}

export async function fetchTempMailDomains() {
    // RapidAPI wrapper: /request/domains/
    const data = await rapidFetchJson('/request/domains/');
    return Array.isArray(data) ? data : [];
}

export async function fetchTempMailInboxEmails(email) {
    const hash = md5Lower(email);
    if (!hash) return [];
    const data = await rapidFetchJson(`/request/mail/id/${encodeURIComponent(hash)}/`);
    return Array.isArray(data) ? data : [];
}

