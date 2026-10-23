// Serialized into the existing Electron CJS host; never contains credentials or
// a user's absolute path. The optional service lives in private per-user state.
export function startOfflineHost(dataFolder, nodeRequire) {
  try {
    if (globalThis.__cursorZhOfflineHost) return;
    globalThis.__cursorZhOfflineHost = true;
    const load = nodeRequire || require;
    const fs = load('node:fs'), path = load('node:path'), os = load('node:os');
    const state = path.join(os.homedir(), dataFolder, 'cursor-language-pack', 'offline');
    const modulePath = path.join(state, 'service.cjs');
    if (!fs.existsSync(modulePath)) return;
    const service = load(modulePath);
    const keepAlive = () => { Promise.resolve().then(() => service.start(state)).catch(() => {}); };
    keepAlive(); const timer = setInterval(keepAlive, 30000); timer.unref?.();
  } catch {}
}
export function offlineHostBootstrap(folder) {
  return `\n;(${startOfflineHost.toString()})(${JSON.stringify(folder)});\n`;
}
export function offlineMainBootstrap(folder) {
  return `\n;import('node:module').then(({createRequire})=>(${startOfflineHost.toString()})(${JSON.stringify(folder)},createRequire(import.meta.url))).catch(()=>{});\n`;
}
