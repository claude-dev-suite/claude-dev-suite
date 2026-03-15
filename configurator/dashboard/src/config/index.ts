// SPDX-License-Identifier: MIT
/**
 * Frontend Configuration
 *
 * Centralized configuration for the dashboard frontend.
 * All hardcoded values should be moved here.
 */

export const config = {
  api: {
    /**
     * Base URL for API requests
     * In Electron/file protocol, use absolute URL. In dev mode, use relative.
     */
    baseUrl: import.meta.env.VITE_API_URL ||
      `http://localhost:${(window as Window & { electronAPI?: { serverPort?: number } }).electronAPI?.serverPort ?? 3456}`,
    /**
     * Default timeout for HTTP requests (30 seconds)
     */
    timeout: 30000,
  },
  websocket: {
    /**
     * Default WebSocket port
     */
    port: 3457,
    /**
     * Maximum reconnection attempts
     */
    reconnectAttempts: 5,
    /**
     * Base delay for exponential backoff (1 second)
     */
    reconnectBaseDelay: 1000,
    /**
     * Maximum reconnect delay (30 seconds)
     */
    reconnectMaxDelay: 30000,
    /**
     * Heartbeat interval for WebSocket connections (30 seconds)
     */
    heartbeatInterval: 30000,
  },
  ui: {
    /**
     * Default toast notification duration (5 seconds)
     */
    toastDuration: 5000,
    /**
     * Warning toast duration (7 seconds)
     */
    toastWarningDuration: 7000,
    /**
     * Error toast duration (0 = persistent)
     */
    toastErrorDuration: 0,
    /**
     * Debounce delay for input fields (150ms)
     */
    debounceDelay: 150,
  },
} as const;
