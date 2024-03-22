const {ipcRenderer} = require('electron');

function callVideo(event) { // eslint-disable-line no-unused-vars
	event.preventDefault();
	ipcRenderer.send('call-video', {});
}
function callAudion(event) { // eslint-disable-line no-unused-vars
	event.preventDefault();
	ipcRenderer.send('call-audio', {});
}
function callReject(event) { // eslint-disable-line no-unused-vars
	event.preventDefault();
	ipcRenderer.send('call-reject', {});
}
