# Packaging & Distribution

## Electron Forge Configuration

```typescript
// forge.config.ts
import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { VitePlugin } from '@electron-forge/plugin-vite';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    icon: './resources/icon',
    appBundleId: 'com.company.app',
    appCategoryType: 'public.app-category.productivity',
    // macOS
    osxSign: {
      identity: 'Developer ID Application: Company Name (TEAMID)',
      hardenedRuntime: true,
      entitlements: './build/entitlements.mac.plist',
      'entitlements-inherit': './build/entitlements.mac.plist',
    },
    osxNotarize: {
      appleId: process.env.APPLE_ID!,
      appleIdPassword: process.env.APPLE_PASSWORD!,
      teamId: process.env.APPLE_TEAM_ID!,
    },
  },
  makers: [
    new MakerSquirrel({
      certificateFile: process.env.WIN_CERT_PATH,
      certificatePassword: process.env.WIN_CERT_PASSWORD,
    }),
    new MakerZIP({}, ['darwin']),
    new MakerDMG({ format: 'ULFO' }),
    new MakerDeb({
      options: {
        maintainer: 'Company Name',
        homepage: 'https://example.com',
        icon: './resources/icon.png',
      },
    }),
  ],
  plugins: [
    new VitePlugin({
      build: [
        { entry: 'src/main/index.ts', config: 'vite.main.config.ts' },
        { entry: 'src/preload/index.ts', config: 'vite.preload.config.ts' },
      ],
      renderer: [{ name: 'main_window', config: 'vite.renderer.config.ts' }],
    }),
  ],
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: { owner: 'company', name: 'app' },
        prerelease: false,
        draft: true,
      },
    },
  ],
};

export default config;
```

---

## Electron Builder Configuration

```yaml
# electron-builder.yml
appId: com.company.app
productName: My Application
copyright: Copyright © 2024 Company Name

directories:
  output: dist
  buildResources: resources

files:
  - "dist/**/*"
  - "package.json"

asar: true
asarUnpack:
  - "**/*.node"  # Native modules

mac:
  category: public.app-category.productivity
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
  target:
    - target: dmg
      arch: [x64, arm64]
    - target: zip
      arch: [x64, arm64]

win:
  target:
    - target: nsis
      arch: [x64, ia32]
    - target: portable
      arch: [x64]
  certificateFile: ${WIN_CSC_LINK}
  certificatePassword: ${WIN_CSC_KEY_PASSWORD}

linux:
  target:
    - AppImage
    - deb
    - rpm
  category: Utility
  maintainer: support@company.com

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  installerIcon: resources/icon.ico
  uninstallerIcon: resources/icon.ico

publish:
  provider: github
  owner: company
  repo: app
  releaseType: release
```

---

## Auto-Updates

```typescript
// src/main/updater.ts
import { autoUpdater } from 'electron-updater';
import { BrowserWindow, dialog, app } from 'electron';
import log from 'electron-log';

export function setupAutoUpdater(mainWindow: BrowserWindow) {
  autoUpdater.logger = log;
  log.transports.file.level = 'info';

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  // For development testing
  if (process.env.NODE_ENV === 'development') {
    autoUpdater.forceDevUpdateConfig = true;
  }

  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info.version);
    mainWindow.webContents.send('update:available', info.version);

    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: `Version ${info.version} is available.`,
      buttons: ['Download', 'Later'],
    }).then(({ response }) => {
      if (response === 0) autoUpdater.downloadUpdate();
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    mainWindow.webContents.send('update:progress', progress.percent);
    mainWindow.setProgressBar(progress.percent / 100);
  });

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow.setProgressBar(-1);

    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: 'Update downloaded. Restart now to install?',
      buttons: ['Restart', 'Later'],
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall(false, true);
    });
  });

  autoUpdater.on('error', (error) => {
    log.error('Update error:', error);
    dialog.showErrorBox('Update Error', error.message);
  });

  // Check for updates on startup
  app.whenReady().then(() => {
    setTimeout(() => autoUpdater.checkForUpdates(), 3000);
  });

  // Check periodically (every 4 hours)
  setInterval(() => autoUpdater.checkForUpdates(), 4 * 60 * 60 * 1000);
}
```
