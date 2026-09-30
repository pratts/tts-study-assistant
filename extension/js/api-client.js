// Client for the notes API. Contract: backend/openapi.json.
import { AuthManager } from './auth-manager.js';
import { API_URL } from './config.js';
import { ApiError, MESSAGES, toApiError } from './errors.js';

export { ApiError } from './errors.js';

/** The backend's marker for text that could not be summarized. */
export const SUMMARY_UNAVAILABLE = 'unavailable';

export class ApiClient {
    constructor() {
        this.authManager = new AuthManager();
    }

    static async isAuthenticated() {
        const { access_token } = await chrome.storage.local.get('access_token');
        return Boolean(access_token);
    }

    /**
     * Authenticated request; returns the envelope's `data`. On 401 with
     * TOKEN_EXPIRED (the backend's only signal for an invalid session) it
     * refreshes once and retries; if that fails the session is cleared.
     */
    async _request(path, { method = 'GET', body, query } = {}, retry = true) {
        const token = await this.authManager.getAccessToken();
        if (!token) throw new ApiError(401, MESSAGES.sessionEnded, 'TOKEN_EXPIRED');

        const url = new URL(API_URL + path);
        for (const [key, value] of Object.entries(query || {})) {
            if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
        }
        const headers = { Accept: 'application/json', Authorization: `Bearer ${token}` };
        if (body !== undefined) headers['Content-Type'] = 'application/json';

        let resp;
        try {
            resp = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
        } catch {
            throw new ApiError(0, MESSAGES.network);
        }

        if (!resp.ok) {
            const error = await toApiError(resp);
            if (resp.status === 401 && error.code === 'TOKEN_EXPIRED') {
                if (retry && (await this.authManager.refreshToken())) return this._request(path, { method, body, query }, false);
                await this.authManager.clearSession();
                throw new ApiError(401, MESSAGES.sessionEnded, 'TOKEN_EXPIRED');
            }
            throw error;
        }
        if (resp.status === 204) {
            await resp.arrayBuffer(); // read the empty body to the end
            return undefined;
        }
        const json = await resp.json().catch(() => null);
        if (!json || typeof json !== 'object') throw new ApiError(resp.status, MESSAGES.unexpected);
        return json.data;
    }

    /** GET /notes: newest first; page_size is clamped to 1..100 by the server. */
    async getNotes({ domain, source_url, page = 1, page_size = 10 } = {}) {
        return (await this._request('/notes', { query: { domain, source_url, page, page_size } })) || [];
    }

    /** GET /notes/stats: [{ domain, count }], most frequent first. */
    async getNotesStats() {
        return (await this._request('/notes/stats')) || [];
    }

    /** POST /notes: content is required; the server derives domain from source_url. */
    async createNote({ content, source_url, source_title }) {
        return this._request('/notes', { method: 'POST', body: { content, source_url, source_title } });
    }

    async deleteNote(noteId) {
        await this._request(`/notes/${encodeURIComponent(noteId)}`, { method: 'DELETE' });
    }

    /** POST /notes/{id}/summarize: { summary }, where summary may be SUMMARY_UNAVAILABLE. */
    async summarize(noteId) {
        return this._request(`/notes/${encodeURIComponent(noteId)}/summarize`, { method: 'POST' });
    }
}
