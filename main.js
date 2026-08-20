const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

function createWindow() {
  // 无边框、无菜单栏、固定尺寸 550x600
  const win = new BrowserWindow({
    width: 550,
    height: 600,
    resizable: false,
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // 移除默认菜单
  Menu.setApplicationMenu(null);

  win.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
