// extension/js/api-client.js

export class ApiClient {
    constructor() {
        this.API_URL = 'http://localhost:3000/api/v1'; // Update for production
    }

    static async isAuthenticated() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['access_token'], (result) => {
                resolve(!!result['access_token']);
            });
        });
    }

    async _getAccessToken() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['access_token'], (result) => {
                resolve(result['access_token'] || null);
            });
        });
    }

    async getNotes() {
        const token = await this._getAccessToken();
        if (!token) throw new Error('Not authenticated');
        const resp = await fetch(`${this.API_URL}/notes`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!resp.ok) throw await resp.json();
        const data = await resp.json();
        return data.data || [];
    }

    async createNote(noteData) {
        const token = await this._getAccessToken();
        if (!token) throw new Error('Not authenticated');
        const resp = await fetch(`${this.API_URL}/notes`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(noteData)
        });
        if (!resp.ok) throw await resp.json();
        const data = await resp.json();
        return data.data;
    }

    async deleteNote(noteId) {
        const token = await this._getAccessToken();
        if (!token) throw new Error('Not authenticated');
        const resp = await fetch(`${this.API_URL}/notes/${noteId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!resp.ok) throw await resp.json();
        return true;
    }
} 