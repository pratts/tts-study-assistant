// Asking the user to log in from the background (shortcut, context menu).
//
// The popup is where login happens, so open it when the browser lets us.
// action.openPopup() is missing before Chrome 127, rejects when no browser
// window is focused, and in Firefox only works while handling a user action;
// that ends at the first `await`, which every caller has passed by now. So
// fall back to a notification instead of failing silently.

export const LOGIN_TITLE = 'Login Required';
export const LOGIN_MESSAGE = 'Click the TTS Study Assistant icon in the toolbar (or the Extensions menu) to log in and save notes.';

/**
 * Opens the popup to log in, or shows a notification when it can't.
 * @param {{ action?: { openPopup?: () => Promise<void> }, notify: (title: string, message: string) => void }} api
 * @returns {Promise<'popup' | 'notification'>} what the user got
 */
export async function promptLogin({ action, notify }) {
    if (typeof action?.openPopup === 'function') {
        try {
            await action.openPopup();
            return 'popup';
        } catch {
            // Not allowed here (Firefox outside a user action, no focused window).
        }
    }
    notify(LOGIN_TITLE, LOGIN_MESSAGE);
    return 'notification';
}
