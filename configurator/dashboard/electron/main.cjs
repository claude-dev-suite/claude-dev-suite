// SPDX-License-Identifier: MIT
/**
 * Electron Main Process for Dev-Suite Dashboard v2
 *
 * Features:
 * - Splash screen with project selection
 * - Bundled Node.js support for packaged apps
 * - React frontend served from Vite build
 * - TypeScript backend server
 */

const { app, BrowserWindow, dialog, Menu, ipcMain, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');

// Lazy-load heavy modules to speed up splash screen display
let log = null;
let updaterModule = null;

function getLog() {
  if (!log) {
    log = require('electron-log/main');
    log.initialize();
    log.transports.file.level = 'debug';
    log.transports.console.level = 'debug';
    Object.assign(console, log.functions);
  }
  return log;
}

function getUpdater() {
  if (!updaterModule) {
    updaterModule = require('./updater.cjs');
  }
  return updaterModule;
}

// Configuration
const SERVER_PORT = parseInt(process.env.PORT || '3456', 10);
const WS_PORT = parseInt(process.env.ORCHESTRATOR_WS_PORT || String(SERVER_PORT + 1), 10);
const VITE_DEV_PORT = 5173;
const SERVER_STARTUP_TIMEOUT = 15000;
const SERVER_CHECK_INTERVAL = 500;

// ============================================
// SECURITY UTILITIES
// ============================================

/**
 * Validate a project path supplied via IPC.
 * - Must be a non-empty string
 * - Must be absolute after resolution
 * - Must not contain traversal components
 * - Must exist on disk
 * Returns the resolved absolute path, or throws on failure.
 */
function validateProjectPath(rawPath) {
  if (typeof rawPath !== 'string' || rawPath.trim() === '') {
    throw new Error('Invalid project path: must be a non-empty string');
  }
  const trimmed = rawPath.trim();

  // Detect Windows UNC paths — covers \\wsl$\..., \\wsl.localhost\..., and //server/share
  const isUNC = /^(\\\\|\/\/)/.test(trimmed);

  // Traversal check: for UNC paths, skip the server+share prefix (first two segments)
  const segments = trimmed.replace(/\\/g, '/').split('/').filter(Boolean);
  const bodySegments = isUNC ? segments.slice(2) : segments;
  if (bodySegments.some((seg) => seg === '..')) {
    throw new Error('Invalid project path: traversal components not allowed');
  }

  // For UNC paths normalise to backslashes (Windows expects \\server\share);
  // for regular paths use path.resolve() which handles drive letters and cwd.
  const resolved = isUNC
    ? trimmed.replace(/\//g, '\\')
    : path.resolve(trimmed);

  if (!isUNC && !path.isAbsolute(resolved)) {
    throw new Error('Invalid project path: must be absolute');
  }
  if (!fs.existsSync(resolved)) {
    throw new Error('Invalid project path: path does not exist');
  }
  return resolved;
}

/**
 * Sanitize an error before forwarding it to the renderer.
 * Returns only the message string — never the stack trace.
 */
function sanitizeError(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

// ============================================
// PERSISTENT PREFERENCES
// ============================================

const PREFS_FILE = path.join(app.getPath('userData'), 'dev-suite-prefs.json');

function loadPrefs() {
  try {
    return JSON.parse(fs.readFileSync(PREFS_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function savePrefs(prefs) {
  try {
    fs.writeFileSync(PREFS_FILE, JSON.stringify(prefs, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[Electron] Could not save preferences:', err.message);
  }
}

function loadLastPath() {
  const prefs = loadPrefs();
  const saved = prefs.lastProjectPath;
  if (saved && fs.existsSync(saved)) return saved;
  return null;
}

function saveLastPath(projectPath) {
  const prefs = loadPrefs();
  prefs.lastProjectPath = projectPath;
  savePrefs(prefs);
}

/**
 * Install Content Security Policy headers on the given session.
 * Called once per BrowserWindow session.
 */
function applyCSP(session) {
  session.webRequest.onHeadersReceived((details, callback) => {
    // In dev mode, Vite injects inline scripts for HMR and React refresh
    // that require 'unsafe-inline' and 'unsafe-eval' in script-src
    const scriptSrc = isDev
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      : "script-src 'self'";

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          [
            "default-src 'self'",
            scriptSrc,
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            `connect-src 'self' http://localhost:${SERVER_PORT} ws://localhost:${WS_PORT} http://localhost:${VITE_DEV_PORT} ws://localhost:${VITE_DEV_PORT}`,
            "img-src 'self' data:",
            "font-src 'self' data: https://fonts.gstatic.com",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
          ].join('; '),
        ],
      },
    });
  });
}

// State
let mainWindow = null;
let splashWindow = null;
let serverProcess = null;
let selectedProjectPath = null;
let isQuitting = false;
let pathConfirmResolver = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// ============================================
// PATH UTILITIES
// ============================================

// process.resourcesPath resolves to the right resources folder on every platform:
//   Windows : <install>/resources
//   macOS   : <App>.app/Contents/Resources
//   Linux   : <extracted>/resources (AppImage), /opt/<app>/resources (deb/rpm)
function findElectronAsset(fileName) {
  const resourcesPath = process.resourcesPath || '';
  const candidates = [
    path.join(resourcesPath, 'app.asar.unpacked', 'electron', fileName),
    path.join(resourcesPath, 'electron', fileName),
    path.join(__dirname, fileName),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return path.join(__dirname, fileName);
}

function findSplashPreload() {
  return findElectronAsset('splash-preload.cjs');
}

function findSplashHtml() {
  return findElectronAsset('splash.html');
}

function findPreload() {
  return findElectronAsset('preload.cjs');
}

function getDevSuitePath() {
  if (app.isPackaged) {
    const resourcesDevSuite = path.join(process.resourcesPath, 'dev-suite');
    console.log('[Electron] Looking for dev-suite at:', resourcesDevSuite);
    if (fs.existsSync(path.join(resourcesDevSuite, 'agents'))) {
      return resourcesDevSuite;
    }
    return resourcesDevSuite;
  }

  // In development, navigate up from dashboard-v2 to dev-suite root
  const devPath = path.resolve(__dirname, '..', '..', '..');
  if (fs.existsSync(path.join(devPath, 'agents'))) return devPath;
  return devPath;
}

// Probes the user's PATH for a working Node.js install. Required because MCP servers
// are launched by Claude Code (via .mcp.json), not by this Electron app — so even if
// we bundle Node for our own dashboard backend, Claude Code still needs a system Node.
function checkSystemNode() {
  return new Promise((resolve) => {
    const cmd = process.platform === 'win32' ? 'node.exe' : 'node';
    let stdout = '';
    let child;
    try {
      child = spawn(cmd, ['--version'], { stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      resolve({ available: false, version: null });
      return;
    }
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.on('error', () => resolve({ available: false, version: null }));
    child.on('exit', (code) => {
      if (code === 0) {
        const version = stdout.trim();
        resolve({ available: true, version });
      } else {
        resolve({ available: false, version: null });
      }
    });
  });
}

async function warnIfNodeMissing() {
  const { available, version } = await checkSystemNode();
  if (available) {
    console.log('[Electron] System Node detected:', version);
    return;
  }
  console.warn('[Electron] System Node.js not found on PATH — MCP servers will not start.');

  const downloadUrl = 'https://nodejs.org/en/download/';
  const result = await dialog.showMessageBox({
    type: 'warning',
    title: 'Node.js non trovato',
    message: 'Node.js non è installato su questo sistema.',
    detail:
      'Dev-Suite Dashboard si apre comunque, ma gli MCP server (avviati da Claude Code) ' +
      'non potranno partire senza Node.js v20 o superiore installato e accessibile dal PATH.\n\n' +
      'Scarica e installa Node.js, poi riavvia l\'app.',
    buttons: ['Scarica Node.js', 'Continua senza'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });

  if (result.response === 0) {
    shell.openExternal(downloadUrl);
  }
}

function findBundledNode() {
  // Windows ships Node as `node.exe` at the root of the Node distribution.
  // macOS and Linux ship it as `bin/node` inside the distribution folder.
  const nodeBin = process.platform === 'win32' ? 'node.exe' : path.join('bin', 'node');
  const resourcesPath = process.resourcesPath || '';

  const candidates = [
    path.join(resourcesPath, 'app.asar.unpacked', 'node', nodeBin),
    path.join(resourcesPath, 'node', nodeBin),
    path.join(__dirname, '..', 'node', nodeBin),
  ];

  console.log('[Electron] Looking for bundled node (' + nodeBin + ')...');
  for (const p of candidates) {
    console.log('[Electron] Checking:', p, '- exists:', fs.existsSync(p));
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return null;
}

function findServerPath() {
  // process.resourcesPath points to the correct resources folder on every platform:
  //   Windows : <install>/resources
  //   macOS   : <App>.app/Contents/Resources
  //   Linux   : <extracted>/resources (AppImage), /opt/<app>/resources (deb/rpm)
  const resourcesPath = process.resourcesPath || '';

  const candidates = [
    path.join(resourcesPath, 'app.asar.unpacked', 'server', 'dist', 'index.js'),
    path.join(resourcesPath, 'app', 'server', 'dist', 'index.js'),
    path.join(__dirname, '..', 'server', 'dist', 'index.js'),
  ];

  console.log('[Electron] Looking for server...');
  for (const p of candidates) {
    console.log('[Electron] Checking:', p, '- exists:', fs.existsSync(p));
    if (fs.existsSync(p)) return p;
  }

  return path.join(__dirname, '..', 'server', 'dist', 'index.js');
}

function findFrontendPath() {
  // For packaged app, dist is inside asar - use __dirname relative path
  // __dirname in asar = .../app.asar/electron, so ../dist = .../app.asar/dist
  const asarPath = path.join(__dirname, '..', 'dist', 'index.html');
  console.log('[Electron] Frontend path:', asarPath);
  return asarPath;
}

// ============================================
// SPLASH WINDOW
// ============================================

function createSplashWindow() {
  // Create window immediately with dark background (visible before HTML loads)
  splashWindow = new BrowserWindow({
    width: 520,
    height: 400,
    frame: false,
    transparent: false,
    resizable: false,
    center: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    show: !process.env.E2E_HEADLESS,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: findSplashPreload(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: 'splash',
    },
  });

  // Block navigation and new-window events on the splash screen
  splashWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });

  splashWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // NOTE: CSP is intentionally NOT applied to the splash window.
  // It is a trusted local HTML file with no user content or external resources.
  // CSP is applied to the main window session in createMainWindow().

  splashWindow.loadFile(findSplashHtml());
  splashWindow.on('closed', () => {
    splashWindow = null;
  });

  splashWindow.webContents.on('did-finish-load', () => {
    const defaultPath = loadLastPath() || process.cwd();
    console.log('[Electron] Sending default path:', defaultPath);
    splashWindow.webContents.send('set-default-path', defaultPath);
  });
}

// Map step names to indices matching splash.html
const STEP_MAP = {
  'init': 0,      // Select project folder
  'runtime': 1,   // Starting Node.js runtime
  'server': 2,    // Initializing server
  'window': 3     // Loading dashboard
};

function updateSplash(step, status) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    const stepIndex = typeof step === 'number' ? step : STEP_MAP[step] ?? 0;
    splashWindow.webContents.send('step-update', { step: stepIndex, status });
  }
}

function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    splashWindow = null;
  }
}

// ============================================
// SERVER MANAGEMENT
// ============================================

function checkServerReady() {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:' + SERVER_PORT + '/health', (res) =>
      resolve(res.statusCode === 200)
    );
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer() {
  const start = Date.now();
  while (Date.now() - start < SERVER_STARTUP_TIMEOUT) {
    if (await checkServerReady()) return true;
    await new Promise((r) => setTimeout(r, SERVER_CHECK_INTERVAL));
  }
  return false;
}

function startServer(projectPath) {
  return new Promise((resolve, reject) => {
    const nodeExe = findBundledNode();
    const serverPath = findServerPath();
    const devSuitePath = getDevSuitePath();
    // Get server directory for cwd (so Node finds server's package.json)
    const serverDir = path.dirname(path.dirname(serverPath)); // Go up from dist/index.js to server/

    console.log('[Electron] Node exe:', nodeExe);
    console.log('[Electron] Server path:', serverPath);
    console.log('[Electron] Server dir:', serverDir);
    console.log('[Electron] Dev-suite path:', devSuitePath);
    console.log('[Electron] Project path:', projectPath);

    // Build PATH with bundled Node directory so npm/npx commands work
    let envPath = process.env.PATH || '';
    if (nodeExe) {
      const nodeDir = path.dirname(nodeExe);
      envPath = nodeDir + path.delimiter + envPath;
    }

    const env = {
      ...process.env,
      PATH: envPath,
      PORT: SERVER_PORT.toString(),
      PROJECT_PATH: projectPath,
      DEV_SUITE_DIR: devSuitePath,
      ELECTRON_MODE: '1',
    };

    const spawnOptions = { env, stdio: 'pipe', cwd: serverDir };

    if (isDev && !nodeExe) {
      // Development mode without bundled Node
      console.log('[Electron] Development mode - using system Node');
      serverProcess = spawn('node', [serverPath], spawnOptions);
    } else if (nodeExe) {
      // Production mode with bundled Node
      console.log('[Electron] Using bundled Node');
      serverProcess = spawn(nodeExe, [serverPath], spawnOptions);
    } else {
      // Fallback to system Node
      console.log('[Electron] Bundled Node not found, using system Node');
      serverProcess = spawn('node', [serverPath], spawnOptions);
    }

    serverProcess.stdout.on('data', (data) => {
      console.log(`[Server] ${data.toString().trim()}`);
    });

    serverProcess.stderr.on('data', (data) => {
      console.error(`[Server Error] ${data.toString().trim()}`);
    });

    serverProcess.on('error', (error) => {
      console.error('[Electron] Failed to start server:', error);
      reject(error);
    });

    serverProcess.on('exit', (code) => {
      console.log('[Electron] Server exited with code:', code);
      if (!isQuitting) {
        serverProcess = null;
      }
    });

    // Wait for server to be ready
    waitForServer()
      .then((ready) => {
        if (ready) {
          console.log('[Electron] Server is ready');
          resolve();
        } else {
          reject(new Error('Server failed to start'));
        }
      })
      .catch(reject);
  });
}

function stopServer() {
  if (serverProcess) {
    console.log('[Electron] Stopping server...');
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
}

// ============================================
// MAIN WINDOW
// ============================================

function createMainWindow() {
  const preloadPath = findPreload();

  console.log('[Electron] Creating main window...');
  console.log('[Electron] Preload:', preloadPath);

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    titleBarStyle: 'default',
    show: false,
  });

  // Apply CSP before loading any content
  applyCSP(mainWindow.webContents.session);

  // Block navigation to external origins
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    try {
      const parsed = new URL(navigationUrl);
      const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
      if (!isLocalhost) {
        console.warn('[Electron] Blocked navigation to external URL:', navigationUrl);
        event.preventDefault();
      }
    } catch {
      event.preventDefault();
    }
  });

  // Block new window / popup creation
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
      if (!isLocalhost) {
        console.warn('[Electron] Blocked new-window to external URL:', url);
      }
    } catch {
      // malformed URL — deny
    }
    return { action: 'deny' };
  });

  // Load the app
  if (isDev && !process.env.E2E_HEADLESS) {
    // In development (non-E2E), check if Vite dev server is running before trying to connect.
    // E2E tests always load built files to avoid conflicts with a running dev server
    // and to prevent DevTools from opening (which confuses the Playwright window fixture).
    const viteCheck = http.get(`http://localhost:${VITE_DEV_PORT}`, (res) => {
      viteCheck.destroy();
      console.log('[Electron] Vite dev server detected, loading from it');
      mainWindow.loadURL(`http://localhost:${VITE_DEV_PORT}`);
      mainWindow.webContents.openDevTools();
    });
    viteCheck.on('error', () => {
      console.log('[Electron] Vite dev server not running, loading built files');
      mainWindow.loadFile(findFrontendPath());
    });
    viteCheck.setTimeout(1000, () => {
      viteCheck.destroy();
      console.log('[Electron] Vite dev server timeout, loading built files');
      mainWindow.loadFile(findFrontendPath());
    });
  } else {
    mainWindow.loadFile(findFrontendPath());
    // DevTools are intentionally disabled in production and E2E mode
  }

  // Log renderer errors to main process console
  mainWindow.webContents.on('console-message', (event) => {
    if (event.level >= 2) { // warnings and errors only
      console.log(`[Renderer ${event.level === 2 ? 'WARN' : 'ERROR'}] ${event.message} (${event.sourceId}:${event.line})`);
    }
  });

  mainWindow.once('ready-to-show', () => {
    closeSplash();
    if (!process.env.E2E_HEADLESS) mainWindow.show();

    // Initialize auto-updater after window is ready (lazy-loaded)
    if (!isDev) {
      getUpdater().initAutoUpdater(mainWindow);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Set up application menu
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Project...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              properties: ['openDirectory'],
              title: 'Select Project Directory',
            });
            if (!result.canceled && result.filePaths[0]) {
              mainWindow.webContents.send('project-selected', result.filePaths[0]);
            }
          },
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        // DevTools only available in development builds
        ...(isDev ? [{ role: 'toggleDevTools' }] : []),
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Dev-Suite',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About Dev-Suite Dashboard',
              message: 'Dev-Suite Dashboard v2',
              detail: `Version: ${app.getVersion()}\nElectron: ${process.versions.electron}\nNode: ${process.versions.node}`,
            });
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ============================================
// IPC HANDLERS
// ============================================

ipcMain.handle('browse-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Project Directory',
  });
  return result.filePaths[0] || null;
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-project-path', () => {
  return selectedProjectPath;
});

// Splash window handlers
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Select Project Folder',
    properties: ['openDirectory'],
    buttonLabel: 'Select Project',
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('confirm-path', (event, projectPath) => {
  let validatedPath;
  try {
    validatedPath = validateProjectPath(projectPath);
  } catch (err) {
    console.error('[Electron] confirm-path validation failed:', sanitizeError(err));
    return { success: false, error: sanitizeError(err) };
  }
  selectedProjectPath = validatedPath;
  saveLastPath(validatedPath);
  if (pathConfirmResolver) {
    pathConfirmResolver(validatedPath);
  }
  return { success: true };
});

// ============================================
// APP LIFECYCLE
// ============================================

async function initialize() {
  try {
    // Show splash FIRST, before any heavy initialization
    createSplashWindow();
    updateSplash('init', 'pending');

    // Wait for user to confirm project path
    const projectPath = await new Promise((resolve) => {
      pathConfirmResolver = resolve;
    });

    if (!projectPath) {
      app.quit();
      return;
    }

    // Initialize logger only after user has selected a project
    getLog();
    console.log('[Electron] Project selected:', projectPath);
    updateSplash('init', 'done');

    // Show runtime step (Node.js) — warn the user if Node is not on PATH,
    // because Claude Code's MCP servers won't start without it.
    updateSplash('runtime', 'pending');
    await warnIfNodeMissing();
    updateSplash('runtime', 'done');

    // Start server
    updateSplash('server', 'pending');
    await startServer(projectPath);
    updateSplash('server', 'done');

    // Create main window
    updateSplash('window', 'pending');
    createMainWindow();
    updateSplash('window', 'done');
  } catch (error) {
    console.error('[Electron] Initialization error:', error);
    dialog.showErrorBox('Startup Error', `Failed to start: ${sanitizeError(error)}`);
    app.quit();
  }
}

app.whenReady().then(initialize);

app.on('window-all-closed', () => {
  stopServer();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    initialize();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  if (updaterModule) updaterModule.stopUpdater();
  stopServer();
});
