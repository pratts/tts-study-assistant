// Errors shared by the API client and the auth manager.

export const MESSAGES = {
    network: 'Could not reach the server. Check your connection and try again.',
    server: 'Something went wrong on our side. Please try again.',
    rateLimited: 'Too many requests. Please wait a minute and try again.',
    sessionEnded: 'Your session has ended. Please log in again.',
    unexpected: 'Unexpected response from the server.',
};

/** Every API failure. `message` is always safe to show to the user. */
export class ApiError extends Error {
    constructor(status, message, code) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
    }
}

/**
 * Converts a failed Response into an ApiError. The backend answers errors
 * with { error, message, code? }; 5xx and 429 get fixed messages so internal
 * details never reach the UI.
 */
export async function toApiError(resp) {
    let body = {};
    try {
        body = await resp.json();
    } catch {
        // Non-JSON error body: fall back to a generic message.
    }
    const code = typeof body.code === 'string' ? body.code : undefined;
    if (resp.status === 429) return new ApiError(429, MESSAGES.rateLimited, code);
    if (resp.status >= 500) return new ApiError(resp.status, MESSAGES.server, code);
    const message = typeof body.message === 'string' && body.message ? body.message : MESSAGES.unexpected;
    return new ApiError(resp.status, message, code);
}

export function errorMessage(error) {
    return error instanceof ApiError ? error.message : MESSAGES.server;
}
