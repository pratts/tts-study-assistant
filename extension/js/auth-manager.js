// AuthManager for Chrome Extension
export class AuthManager {
    constructor() {
        this.API_URL = 'http://localhost:3000/api/v1'; // Update for production
        this.ACCESS_KEY = 'access_token';
        this.REFRESH_KEY = 'refresh_token';
        this.USER_KEY = 'user';
        this.EXP_KEY = 'access_token_expiry';
        this.REFRESH_EXP_KEY = 'refresh_token_expiry';
        this.REFRESH_ALARM = 'refresh_token_alarm';
    }

    async hashPassword(password) {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
        return Array.from(new Uint8Array(buf)).map(x => x.toString(16).padStart(2, '0')).join('');
    }

    async login(email, password) {
        const hashed = await this.hashPassword(password);
        const resp = await fetch(`${this.API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: hashed, source: 'extension' })
        });
        const data = await resp.json();
        if (!resp.ok || !data.data) return { success: false, message: data.message || 'Login failed' };
        await this._storeTokens(data.data);
        this.setupTokenRefreshAlarm();
        return { success: true, user: data.data.user };
    }

    async checkSession() {
        const tokens = await this._getTokens();
        if (!tokens.access_token) return { loggedIn: false };
        // Verify token
        const verify = await fetch(`${this.API_URL}/auth/verify`, {
            headers: { 'Authorization': `Bearer ${tokens.access_token}` }
        });
        if (verify.ok) {
            const user = await verify.json();
            return { loggedIn: true, user };
        } else {
            // Try refresh
            const refreshed = await this.refreshToken();
            if (refreshed.success) {
                return { loggedIn: true, user: refreshed.user };
            }
            await this.logout();
            return { loggedIn: false };
        }
    }

    async refreshToken() {
        const tokens = await this._getTokens();
        if (!tokens.refresh_token) return { success: false };
        const resp = await fetch(`${this.API_URL}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: tokens.refresh_token })
        });
        const data = await resp.json();
        if (!resp.ok || !data.data) return { success: false };
        await this._storeTokens(data.data);
        this.setupTokenRefreshAlarm();
        return { success: true, user: data.data.user };
    }

    async logout() {
        const tokens = await this._getTokens();
        if (tokens.refresh_token) {
            await fetch(`${this.API_URL}/auth/logout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: tokens.refresh_token })
            });
        }
        await chrome.storage.local.remove([this.ACCESS_KEY, this.REFRESH_KEY, this.USER_KEY, this.EXP_KEY, this.REFRESH_EXP_KEY]);
        chrome.alarms.clear(this.REFRESH_ALARM);
    }

    setupTokenRefreshAlarm() {
        this._getTokens().then(tokens => {
            if (!tokens.access_token_expiry) return;
            // Set alarm 5 minutes before expiry
            const alarmTime = tokens.access_token_expiry - Date.now() - 5 * 60 * 1000;
            if (alarmTime > 0) {
                chrome.alarms.create(this.REFRESH_ALARM, { when: Date.now() + alarmTime });
            }
        });
    }

    async getAccessToken() {
        const tokens = await this._getTokens();
        if (!tokens.access_token) return null;
        if (tokens.access_token_expiry && Date.now() > tokens.access_token_expiry) {
            const refreshed = await this.refreshToken();
            if (refreshed.success) {
                return (await this._getTokens()).access_token;
            }
            return null;
        }
        return tokens.access_token;
    }

    // --- Internal helpers ---
    async _storeTokens(data) {
        // Decode JWT to get expiry
        const decode = (token) => {
            try {
                const payload = JSON.parse(atob(token.split('.')[1]));
                return payload.exp ? payload.exp * 1000 : null;
            } catch { return null; }
        };
        const access_token_expiry = decode(data.access_token);
        const refresh_token_expiry = Date.now() + 90 * 24 * 60 * 60 * 1000; // fallback 90 days
        await chrome.storage.local.set({
            [this.ACCESS_KEY]: data.access_token,
            [this.REFRESH_KEY]: data.refresh_token,
            [this.USER_KEY]: data.user,
            [this.EXP_KEY]: access_token_expiry,
            [this.REFRESH_EXP_KEY]: refresh_token_expiry
        });
    }

    async _getTokens() {
        return new Promise((resolve) => {
            chrome.storage.local.get([
                this.ACCESS_KEY, this.REFRESH_KEY, this.USER_KEY, this.EXP_KEY, this.REFRESH_EXP_KEY
            ], (result) => {
                resolve({
                    access_token: result[this.ACCESS_KEY],
                    refresh_token: result[this.REFRESH_KEY],
                    user: result[this.USER_KEY],
                    access_token_expiry: result[this.EXP_KEY],
                    refresh_token_expiry: result[this.REFRESH_EXP_KEY]
                });
            });
        });
    }
}

// Export for use in popup and background
if (typeof window !== 'undefined') {
    window.AuthManager = AuthManager;
} 