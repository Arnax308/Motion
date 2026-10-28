const { app, BrowserWindow, ipcMain, nativeTheme } = require('electron');
const path = require('path');
const dataFile = require('./data-file');

let mainWindow;

// Packaged builds can't write inside the app archive, so they keep data in the user profile
const DATA_FILE = process.env.MOTION_DATA_FILE
  ? path.resolve(process.env.MOTION_DATA_FILE)
  : app.isPackaged
    ? path.join(app.getPath('userData'), 'data.json')
    : path.resolve(__dirname, 'data.json');
console.log('Using Motion database file at:', DATA_FILE);

function themeBackground() {
  return nativeTheme.shouldUseDarkColors ? '#0B0B0F' : '#F7F7F9';
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: themeBackground(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  // The app is a single local page: never open new windows or navigate away
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', e => e.preventDefault());

  mainWindow.loadFile('index.html');
}

// Two running copies would overwrite each other's saves
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    // If an unreadable file couldn't be set aside, saving would destroy it, so block saves
    let saveBlockedReason = null;

    ipcMain.handle('data:load', () => {
      const result = dataFile.load(DATA_FILE);
      if (result.status === 'recovered' || result.status === 'corrupt') console.error('data.json could not be read:', result);
      if (result.unsafe) saveBlockedReason = `Saving is paused to protect ${DATA_FILE}: ${result.error}`;
      return result;
    });
    ipcMain.handle('data:save', (event, data) => {
      if (saveBlockedReason) return { success: false, error: saveBlockedReason };
      const result = dataFile.save(DATA_FILE, data);
      if (!result.success) console.error('Error saving data.json:', result.error);
      return result;
    });
    ipcMain.handle('theme:set', (event, mode) => {
      nativeTheme.themeSource = ['light', 'dark'].includes(mode) ? mode : 'system';
      if (mainWindow) mainWindow.setBackgroundColor(themeBackground());
    });

    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
