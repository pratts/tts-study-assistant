// Session storage and auth API calls, shared by the popup and the background
// worker (both read the same chrome.storage.local keys).
import { API_URL } from './config.js';
import { ApiError, MESSAGES, toApiError } from './errors.js';

const KEYS = {
    access: 'access_token',
    refresh: 'refresh_token',
    user: 'user',
    expiry: 'access_token_expiry',
};

// Refresh a little before expiry so a request never races the deadline.
const EXPIRY_SKEW_MS = 30 * 1000;

function jwtExpiry(token) {
    try {
        const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const exp = JSON.parse(atob(payload)).exp;
        return typeof exp === 'number' ? exp * 1000 : null;
    } catch {
        return null;
    }
}

async function postJson(path, body) {
    let resp;
    try {
        resp = await fetch(`${API_URL}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(body),
        });
    } catch {
        throw new ApiError(0, MESSAGES.network);
    }
    if (!resp.ok) throw await toApiError(resp);
    const json = await resp.json().catch(() => null);
    if (!json || !json.data) throw new ApiError(resp.status, MESSAGES.unexpected);
    return json.data;
}

export class AuthManager {
    constructor() {
        this._refreshing = null;
    }

    /**
     * Logs in with the raw password (sent over HTTPS; the server stores only a
     * bcrypt hash). `source: 'extension'` gets the longer extension session.
     */
    async login(email, password) {
        const data = await postJson('/auth/login', { email, password, source: 'extension' });
        await this._store(data);
        return data.user;
    }

    async register(name, email, password) {
        const data = await postJson('/auth/register', { name, email, password });
        await this._store(data);
        return data.user;
    }

    /** Revokes the refresh token (best effort) and clears the local session. */
    async logout() {
        const { [KEYS.refresh]: refreshToken } = await chrome.storage.local.get(KEYS.refresh);
        await this.clearSession();
        if (refreshToken) {
            try {
                await fetch(`${API_URL}/auth/logout`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refresh_token: refreshToken }),
                });
            } catch {
                // Offline: the token expires on its own.
            }
        }
    }

    async clearSession() {
        await chrome.storage.local.remove(Object.values(KEYS));
    }

    async getUser() {
        const { [KEYS.user]: user } = await chrome.storage.local.get(KEYS.user);
        return user || null;
    }

    /** A valid access token, refreshing it first if it is about to expire. */
    async getAccessToken() {
        const stored = await chrome.storage.local.get([KEYS.access, KEYS.expiry]);
        const token = stored[KEYS.access];
        if (!token) return null;
        const expiry = stored[KEYS.expiry];
        if (expiry && Date.now() > expiry - EXPIRY_SKEW_MS) {
            return (await this.refreshToken()) ? (await chrome.storage.local.get(KEYS.access))[KEYS.access] : null;
        }
        return token;
    }

    /**
     * Rotates the refresh token. Refresh tokens are single-use on the server,
     * so concurrent callers in this context share one request. Returns false
     * (and clears the session) when the server rejects the token.
     */
    refreshToken() {
        if (!this._refreshing) {
            this._refreshing = this._refresh().finally(() => {
                this._refreshing = null;
            });
        }
        return this._refreshing;
    }

    async _refresh() {
        const { [KEYS.refresh]: refreshToken } = await chrome.storage.local.get(KEYS.refresh);
        if (!refreshToken) return false;
        try {
            const data = await postJson('/auth/refresh', { refresh_token: refreshToken });
            await this._store(data);
            return true;
        } catch (error) {
            // A rejected token is final; a network error is not.
            if (error instanceof ApiError && error.status === 401) await this.clearSession();
            return false;
        }
    }

    async _store(data) {
        await chrome.storage.local.set({
            [KEYS.access]: data.access_token,
            [KEYS.refresh]: data.refresh_token,
            [KEYS.user]: data.user,
            [KEYS.expiry]: jwtExpiry(data.access_token),
        });
    }
}
