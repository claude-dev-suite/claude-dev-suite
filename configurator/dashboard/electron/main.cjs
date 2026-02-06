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

const { app, BrowserWindow, dialog, Menu, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');
const log = require('electron-log/main');
const { initAutoUpdater, stopUpdater } = require('./updater.cjs');

// Initialize electron-log
log.initialize();
log.transports.file.level = 'debug';
log.transports.console.level = 'debug';

// Override console.log to use electron-log
Object.assign(console, log.functions);

// Configuration
const SERVER_PORT = parseInt(process.env.PORT || '3456', 10);
const VITE_DEV_PORT = 5173;
const SERVER_STARTUP_TIMEOUT = 15000;
const SERVER_CHECK_INTERVAL = 500;

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

function findSplashPreload() {
  const exePath = app.getPath('exe');
  const exeDir = path.dirname(exePath);

  const candidates = [
    path.join(exeDir, 'resources', 'app.asar.unpacked', 'electron', 'splash-preload.cjs'),
    path.join(exeDir, 'resources', 'electron', 'splash-preload.cjs'),
    path.join(__dirname, 'splash-preload.cjs'),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return path.join(__dirname, 'splash-preload.cjs');
}

function findSplashHtml() {
  const exePath = app.getPath('exe');
  const exeDir = path.dirname(exePath);

  const candidates = [
    path.join(exeDir, 'resources', 'app.asar.unpacked', 'electron', 'splash.html'),
    path.join(exeDir, 'resources', 'electron', 'splash.html'),
    path.join(__dirname, 'splash.html'),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return path.join(__dirname, 'splash.html');
}

function findPreload() {
  const exePath = app.getPath('exe');
  const exeDir = path.dirname(exePath);

  const candidates = [
    path.join(exeDir, 'resources', 'app.asar.unpacked', 'electron', 'preload.cjs'),
    path.join(exeDir, 'resources', 'electron', 'preload.cjs'),
    path.join(__dirname, 'preload.cjs'),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return path.join(__dirname, 'preload.cjs');
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

function findBundledNode() {
  const exePath = app.getPath('exe');
  const exeDir = path.dirname(exePath);

  const candidates = [
    path.join(exeDir, 'resources', 'app.asar.unpacked', 'node', 'node.exe'),
    path.join(exeDir, 'resources', 'node', 'node.exe'),
    path.join(exeDir, 'node', 'node.exe'),
    path.join(__dirname, '..', 'node', 'node.exe'),
  ];

  console.log('[Electron] Looking for node.exe...');
  for (const p of candidates) {
    console.log('[Electron] Checking:', p, '- exists:', fs.existsSync(p));
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return null;
}

function findServerPath() {
  const exePath = app.getPath('exe');
  const exeDir = path.dirname(exePath);

  // Look for compiled TypeScript server
  const candidates = [
    path.join(exeDir, 'resources', 'app.asar.unpacked', 'server', 'dist', 'index.js'),
    path.join(exeDir, 'resources', 'app', 'server', 'dist', 'index.js'),
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
  const preloadPath = findSplashPreload();
  const htmlPath = findSplashHtml();

  console.log('[Electron] Creating splash window...');
  console.log('[Electron] Splash preload:', preloadPath);
  console.log('[Electron] Splash HTML:', htmlPath);

  splashWindow = new BrowserWindow({
    width: 400,
    height: 340,
    frame: false,
    transparent: false,
    resizable: false,
    center: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    show: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
    },
  });

  splashWindow.loadFile(htmlPath);
  splashWindow.on('closed', () => {
    splashWindow = null;
  });

  splashWindow.webContents.on('did-finish-load', () => {
    const defaultPath = process.cwd();
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
    },
    titleBarStyle: 'default',
    show: false,
  });

  // Load the app
  if (isDev) {
    // In development, try Vite dev server first, fallback to built files
    mainWindow
      .loadURL(`http://localhost:${VITE_DEV_PORT}`)
      .catch(() => {
        console.log('[Electron] Vite dev server not running, loading built files');
        mainWindow.loadFile(findFrontendPath());
      });
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(findFrontendPath());
  }

  mainWindow.once('ready-to-show', () => {
    closeSplash();
    mainWindow.show();

    // Initialize auto-updater after window is ready
    if (!isDev) {
      initAutoUpdater(mainWindow);
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
        { role: 'toggleDevTools' },
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
  selectedProjectPath = projectPath;
  if (pathConfirmResolver) {
    pathConfirmResolver(projectPath);
  }
  return true;
});

// ============================================
// APP LIFECYCLE
// ============================================

async function initialize() {
  try {
    // Show splash and wait for project selection
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

    console.log('[Electron] Project selected:', projectPath);
    updateSplash('init', 'done');

    // Show runtime step (Node.js)
    updateSplash('runtime', 'pending');
    await new Promise(r => setTimeout(r, 300)); // Brief visual pause
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
    dialog.showErrorBox('Startup Error', `Failed to start: ${error.message}`);
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
  stopUpdater();
  stopServer();
});
