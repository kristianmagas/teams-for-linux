const {ipcRenderer} = require('electron');

ipcRenderer.on("set-content", (e, content) => {
    document.body.innerHTML = content;
});

function callVideo() { // eslint-disable-line no-unused-vars
	event.preventDefault();
	ipcRenderer.send('call-video', {});
}
function callAudio() { // eslint-disable-line no-unused-vars
	event.preventDefault();
	ipcRenderer.send('call-audio', {});
}
function callReject() { // eslint-disable-line no-unused-vars
	event.preventDefault();
	ipcRenderer.send('call-reject', {});
}
function closePopup() { // eslint-disable-line no-unused-vars
	event.preventDefault();
	ipcRenderer.send('close-popup', {});
}
function findButton(elm){
    if(elm.tagName === "BUTTON"){
        return elm;
    }

    if(elm.parentElement){
        return findButton(elm.parentElement);
    }

    return null;
}

(function(){
    document.onclick = (e) => {
        var tgt = findButton(e.target);
        if(!tgt){
            return;
        }
        if(tgt.classList.contains("call-video")){
            callVideo();
        }
        else if(tgt.classList.contains("call-audio")){
            callAudio();
        }
        else if(tgt.classList.contains("call-reject")){
            callReject();
        }
        else if(tgt.classList.contains("toast-close-button")){
            closePopup();
        }
    };
})();