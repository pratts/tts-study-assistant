// Add Vite env type declaration for TypeScript
/// <reference types="vite/client" />
// Use Vite env variable for API URL
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

function getAuthHeaders(): HeadersInit | undefined {
    const token = localStorage.getItem('access_token');
    return token ? { 'Authorization': `Bearer ${token}` } : undefined;
}

function logoutAndRedirect() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    window.location.href = '/';
}

async function fetchWithAuth(input: RequestInfo, init: RequestInit = {}, retry = true): Promise<any> {
    const headers = { ...(init.headers || {}), ...getAuthHeaders() };
    const resp = await fetch(input, { ...init, headers });
    if (resp.status === 401) {
        let data: any = {};
        try { data = await resp.clone().json(); } catch { }
        if (data.code === 'TOKEN_EXPIRED' && retry) {
            // Try to refresh
            const refreshToken = localStorage.getItem('refresh_token');
            if (refreshToken) {
                const refreshed = await refreshTokenApi(refreshToken);
                if (refreshed.success) {
                    localStorage.setItem('access_token', refreshed.access_token);
                    localStorage.setItem('refresh_token', refreshed.refresh_token);
                    // Retry original request with new token
                    return fetchWithAuth(input, init, false);
                }
            }
            // Refresh failed
            logoutAndRedirect();
            throw new Error('Session expired. Please login again.');
        }
        if (data.message) throw new Error(data.message);
        throw new Error('Unauthorized');
    }
    if (!resp.ok) {
        let data: any = {};
        try { data = await resp.json(); } catch { }
        throw new Error(data.message || 'API error');
    }
    return resp.json();
}

export async function loginApi(email: string, password: string) {
    const resp = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    const data = await resp.json();
    if (resp.ok && data.data) {
        return {
            success: true,
            access_token: data.data.access_token,
            refresh_token: data.data.refresh_token,
            user: data.data.user
        };
    }
    return { success: false, message: data.message };
}

export async function refreshTokenApi(refreshToken: string) {
    const resp = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken })
    });
    const data = await resp.json();
    if (resp.ok && data.data) {
        return {
            success: true,
            access_token: data.data.access_token,
            refresh_token: data.data.refresh_token,
            user: data.data.user
        };
    }
    return { success: false };
}

export async function logoutApi() {
    const refreshToken = localStorage.getItem('refresh_token');
    if (refreshToken) {
        try {
            await fetch(`${API_URL}/auth/logout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: refreshToken })
            });
        } catch (error) {
            console.error('Logout request failed:', error);
        }
    }
    // Clear tokens from localStorage
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
}

// Dashboard stats: GET /notes/stats
export async function getNotesStats() {
    const data = await fetchWithAuth(`${API_URL}/notes/stats`);
    return data.data || [];
}

// Notes list: GET /notes
export async function getNotes(params: { domain?: string, page?: number, page_size?: number } = {}) {
    const search = new URLSearchParams();
    if (params.domain) search.set('domain', params.domain);
    if (params.page) search.set('page', params.page.toString());
    if (params.page_size) search.set('page_size', params.page_size.toString());
    const data = await fetchWithAuth(`${API_URL}/notes?${search.toString()}`);
    return data.data || [];
}

// Delete note: DELETE /notes/:id
export async function deleteNote(id: string) {
    await fetchWithAuth(`${API_URL}/notes/${id}`, { method: 'DELETE' });
    return true;
}

// Update password: PUT /user/password
export async function updatePassword(oldPassword: string, newPassword: string) {
    await fetchWithAuth(`${API_URL}/user/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ old_password: oldPassword, new_password: newPassword })
    });
    return true;
}

// Get user profile: GET /user/profile
export async function getUserProfile() {
    const data = await fetchWithAuth(`${API_URL}/user/profile`);
    return data.data || data;
}

// Get single note: GET /notes/:id
export async function getNote(id: string) {
    const data = await fetchWithAuth(`${API_URL}/notes/${id}`);
    return data.data || data;
}

// Generate summary: POST /notes/:id/summarize
export async function generateSummary(id: string) {
    const data = await fetchWithAuth(`${API_URL}/notes/${id}/summarize`, {
        method: 'POST'
    });
    return data.data || data;
} 