const { app, ipcMain, BrowserWindow, screen } = require('electron');
let activeWindow = null;

function hide(){
    if(activeWindow){
        try{
            activeWindow.close();
        }catch{}
        activeWindow = null;
    }
}
exports.hide = hide;

exports.show = function show(content, callbackVideo, callbackAudio, callbackReject) {
    hide();
    const primaryDisplay = screen.getPrimaryDisplay()
	let win = new BrowserWindow({
	    x: primaryDisplay.bounds.x + primaryDisplay.bounds.width - 340,
	    y: primaryDisplay.bounds.y + primaryDisplay.bounds.height - 240,
		width: 320,
		height: 220,

		resizable: false,
		alwaysOnTop: true,
		frame: false,

		show: false,
		autoHideMenuBar: true,
		webPreferences: {
			contextIsolation: false,
			nodeIntegration: true
		}
	});
	require('@electron/remote/main').enable(win.webContents);

	win.once('ready-to-show', () => {
	    win.webContents.send("set-content", content);
		win.show();
	});

	ipcMain.on('call-video', callHandler(callbackVideo));
	ipcMain.on('call-audio', callHandler(callbackAudio));
	ipcMain.on('call-reject', callHandler(callbackReject));
	ipcMain.on('close-popup', hide);

	win.on('closed', () => {
		win = null;
	});

	win.loadURL(`file://${__dirname}/index.html`);
	activeWindow = win;
};

function callHandler(callback) {
	return (event, data) => {
	    hide();
		callback && callback();
	};
}
