/** True when running inside the Tauri webview (filesystem, invoke, tray). */
export function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}
