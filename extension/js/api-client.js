// extension/js/api-client.js

import { AuthManager } from './auth-manager.js';
import { API_URL } from './config.js';

export class ApiClient {
    constructor() {
        this.API_URL = API_URL
        this.authManager = new AuthManager();
    }

    static async isAuthenticated() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['access_token'], (result) => {
                resolve(!!result['access_token']);
            });
        });
    }

    async _fetchWithAuth(url, options = {}, retry = true) {
        let token = await this.authManager.getAccessToken();
        if (!token) throw new Error('Not authenticated');
        options.headers = options.headers || {};
        options.headers['Authorization'] = `Bearer ${token}`;

        let resp = await fetch(url, options);
        if (resp.status === 401) {
            const data = await resp.json().catch(() => ({}));
            if (data.code === 'TOKEN_EXPIRED' && retry) {
                // Try to refresh and retry once
                const refreshed = await this.authManager.refreshToken();
                if (refreshed.success) {
                    token = await this.authManager.getAccessToken();
                    options.headers['Authorization'] = `Bearer ${token}`;
                    resp = await fetch(url, options);
                } else {
                    throw new Error('Session expired. Please login again.');
                }
            } else {
                throw data;
            }
        }
        if (!resp.ok) throw await resp.json();
        return resp.json();
    }

    async _getAccessToken() {
        // Deprecated: use this.authManager.getAccessToken()
        return this.authManager.getAccessToken();
    }

    async getNotes({ domain, source_url, page = 1, page_size = 10 } = {}) {
        const params = new URLSearchParams();
        if (domain) params.set('domain', domain);
        if (source_url) params.set('source_url', source_url);
        if (page) params.set('page', page);
        if (page_size) params.set('page_size', page_size);
        const url = `${this.API_URL}/notes?${params.toString()}`;
        const data = await this._fetchWithAuth(url);
        return data.data || [];
    }

    async createNote(noteData) {
        const data = await this._fetchWithAuth(`${this.API_URL}/notes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(noteData)
        });
        return data.data;
    }

    async deleteNote(noteId) {
        await this._fetchWithAuth(`${this.API_URL}/notes/${noteId}`, {
            method: 'DELETE'
        });
        return true;
    }
} 