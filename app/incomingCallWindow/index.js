const { app, ipcMain, BrowserWindow } = require('electron');
let activeWindow = null;


exports.hide = function hide(){
    if(activeWindow){
        try{
            activeWindow.close();
        }catch{}
        activeWindow = null;
    }
}

exports.show = function show(callbackVideo, callbackAudio, callbackReject) {
    hide();
	let win = new BrowserWindow({
	    x: 0,
	    y: 0,
		width: 320,
		height: 220,

		show: false,
		autoHideMenuBar: true,
		webPreferences: {
			contextIsolation: false,
			nodeIntegration: true
		}
	});
	require('@electron/remote/main').enable(win.webContents);

	win.once('ready-to-show', () => {
		win.show();
	});

	ipcMain.on('call-video', callHandler(callbackVideo));
	ipcMain.on('call-audio', callHandler(callbackAudio));
	ipcMain.on('call-reject', callHandler(callbackReject));

	win.on('closed', () => {
		win = null;
	});

	win.loadURL(`file://${__dirname}/index.html`);
	activeWindow = win;
};

function callHandler(callback) {
	return (event, data) => {
	    hide();
		callback();
	};
}
