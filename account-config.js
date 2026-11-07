/* Enable only after the session migration, Worker/RPC checks and staged tests are approved.
 * No fallback to unrestricted login when enabled and the RPC is unavailable. */
window.VZIP_SINGLE_SESSION_ENABLED ??= false;
