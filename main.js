const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
const DATA_FILE = path.resolve(__dirname, 'data.json');
console.log('Using Motion database file at:', DATA_FILE);

const DEFAULT_DATA = {
  total_pp: 0,
  streak: 0,
  last_completion_date: null,
  categories: [
    { id: 'dev', name: 'Development', subtext: 'Focus & Output', icon: 'code', color: '#7C3AED', weight: 1.0, active: true },
    { id: 'work', name: 'Work', subtext: 'Strategic Planning', icon: 'briefcase', color: '#3B82F6', weight: 1.0, active: true },
    { id: 'study', name: 'Study', subtext: 'Learning & Notes', icon: 'book', color: '#10B981', weight: 1.0, active: true },
    { id: 'exercise', name: 'Exercise', subtext: 'Health & Endurance', icon: 'activity', color: '#F59E0B', weight: 1.0, active: true },
    { id: 'meeting', name: 'Meeting', subtext: 'Sync & Collaboration', icon: 'users', color: '#EC4899', weight: 1.0, active: true },
    { id: 'admin', name: 'Admin', subtext: 'Operations & Maintenance', icon: 'check-square', color: '#6B7280', weight: 1.0, active: true }
  ],
  active_tasks: [],
  history: []
};

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const data = JSON.parse(raw);
      
      // Ensure required structure exists
      if (data.total_pp === undefined) data.total_pp = 0;
      if (data.streak === undefined) data.streak = 0;
      if (!Array.isArray(data.categories)) data.categories = DEFAULT_DATA.categories;
      if (!Array.isArray(data.active_tasks)) data.active_tasks = [];
      if (!Array.isArray(data.history)) data.history = [];
      
      return data;
    }
  } catch (err) {
    console.error('Error loading data.json:', err);
  }
  
  // Save default data if file missing
  saveData(DEFAULT_DATA);
  return DEFAULT_DATA;
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    return { success: true };
  } catch (err) {
    console.error('Error saving data.json:', err);
    return { success: false, error: err.message };
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: '#0C0C0E',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  ipcMain.handle('data:load', () => loadData());
  ipcMain.handle('data:save', (event, data) => saveData(data));

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
