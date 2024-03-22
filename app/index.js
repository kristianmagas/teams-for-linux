const { app, ipcMain, desktopCapturer, systemPreferences, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');
const { LucidLog } = require('lucid-log');
const { httpHelper } = require('./helpers');

const isDev = require('electron-is-dev');
const os = require('os');
const isMac = os.platform() === 'darwin';
if (app.commandLine.hasSwitch('customUserDir')) {
	app.setPath('userData', app.commandLine.getSwitchValue('customUserDir'));
}

const { AppConfiguration } = require('./appConfiguration');
const appConfig = new AppConfiguration(app.getPath('userData'), app.getVersion());

const config = appConfig.startupConfig;
config.appPath = path.join(__dirname, isDev ? '' : '../../');

const logger = new LucidLog({
	levels: config.appLogLevels.split(',')
});

const notificationSounds = [{
	type: 'new-message',
	file: path.join(config.appPath, 'assets/sounds/new_message.wav')
},
{
	type: 'meeting-started',
	file: path.join(config.appPath, 'assets/sounds/meeting_started.wav')
}];

let userStatus = -1;
let idleTimeUserStatus = -1;

// Notification sound player
/**
 * @type {NodeSoundPlayer}
 */
let player;
try {
	// eslint-disable-next-line no-unused-vars
	const { NodeSound } = require('./sound');
	player = NodeSound.getDefaultPlayer();
} catch (e) {
	logger.info('No audio players found. Audio notifications might not work.');
}

const certificateModule = require('./certificate');
const gotTheLock = app.requestSingleInstanceLock();
const mainAppWindow = require('./mainAppWindow');

if (config.proxyServer) app.commandLine.appendSwitch('proxy-server', config.proxyServer);
app.commandLine.appendSwitch('auth-server-whitelist', config.authServerWhitelist);
app.commandLine.appendSwitch('enable-ntlm-v2', config.ntlmV2enabled);
app.commandLine.appendSwitch('try-supported-channel-layouts');

const disabledFeatures = app.commandLine.hasSwitch('disable-features') ? app.commandLine.getSwitchValue('disable-features').split(',') : ['HardwareMediaKeyHandling'];

if (!disabledFeatures.includes('HardwareMediaKeyHandling'))
	disabledFeatures.push('HardwareMediaKeyHandling');

app.commandLine.appendSwitch('disable-features', disabledFeatures.join(','));

if (isMac) {
	requestMediaAccess();

} else if (process.env.XDG_SESSION_TYPE === 'wayland') {
	logger.info('Running under Wayland, switching to PipeWire...');

	const features = app.commandLine.hasSwitch('enable-features') ? app.commandLine.getSwitchValue('enable-features').split(',') : [];
	if (!features.includes('WebRTCPipeWireCapturer'))
		features.push('WebRTCPipeWireCapturer');

	app.commandLine.appendSwitch('enable-features', features.join(','));
	app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
}

const protocolClient = 'msteams';
if (!app.isDefaultProtocolClient(protocolClient, process.execPath)) {
	app.setAsDefaultProtocolClient(protocolClient, process.execPath);
}

app.allowRendererProcessReuse = false;

if (config.disableGpu) {
	logger.info('Disabling GPU support...');
	app.commandLine.appendSwitch('disable-gpu');
	app.commandLine.appendSwitch('disable-software-rasterizer');
}

if (!gotTheLock) {
	logger.info('App already running');
	app.quit();
} else {
	app.on('second-instance', mainAppWindow.onAppSecondInstance);
	app.on('ready', handleAppReady);
	app.on('quit', () => logger.debug('quit'));
	app.on('render-process-gone', onRenderProcessGone);
	app.on('will-quit', () => logger.debug('will-quit'));
	app.on('certificate-error', handleCertificateError);
	ipcMain.handle('getConfig', handleGetConfig);
	ipcMain.handle('getSystemIdleTime', handleGetSystemIdleTime);
	ipcMain.handle('getSystemIdleState', handleGetSystemIdleState);
	ipcMain.handle('getZoomLevel', handleGetZoomLevel);
	ipcMain.handle('saveZoomLevel', handleSaveZoomLevel);
	ipcMain.handle('desktopCapturerGetSources', (event, opts) => desktopCapturer.getSources(opts));
	ipcMain.handle('getCustomBGList', handleGetCustomBGList);
	ipcMain.handle('play-notification-sound', playNotificationSound);
	ipcMain.handle('user-status-changed', userStatusChangedHandler);
	ipcMain.handle('set-badge-count', setBadgeCountHandler);
}

// eslint-disable-next-line no-unused-vars
async function playNotificationSound(event, options) {
	logger.debug(`Notificaion => Type: ${options.type}, Audio: ${options.audio}, Title: ${options.title}, Body: ${options.body}`);
	// Player failed to load or notification sound disabled in config
	if (!player || config.disableNotificationSound) {
		logger.debug('Notification sounds are disabled');
		return;
	}
	// Notification sound disabled if not available set in config and user status is not "Available" (or is unknown)
	if (config.disableNotificationSoundIfNotAvailable && userStatus !== 1 && userStatus !== -1) {
		logger.debug('Notification sounds are disabled when user is not active');
		return;
	}
	const sound = notificationSounds.filter(ns => {
		return ns.type === options.type;
	})[0];

	if (sound) {
		logger.debug(`Playing file: ${sound.file}`);
		player.play(sound.file, { device: config.secondRingDevice });
		return;
	}

	logger.debug('No notification sound played', player, options);
}

function onRenderProcessGone() {
	logger.debug('render-process-gone');
	app.quit();
}

function onAppTerminated(signal) {
	if (signal === 'SIGTERM') {
		process.abort();
	} else {
		app.quit();
	}
}

function handleAppReady() {
	downloadCustomBGServiceRemoteConfig();
	process.on('SIGTRAP', onAppTerminated);
	process.on('SIGINT', onAppTerminated);
	process.on('SIGTERM', onAppTerminated);
	//Just catch the error
	process.stdout.on('error', () => { });
	mainAppWindow.onAppReady(appConfig);

//    var incomingCallWindow = require("./incomingCallWindow");
//    incomingCallWindow.show(`<div id="toast-container" class="toast-bottom-right" style="pointer-events: auto;">
//                                 <div class="meetup-and-call call toast-wrapper" ng-click="!!message.primaryAction ? message.primaryAction.action() : tapToast()" analytics-panel="4" analytics-panel-view="{ panel: {type: 69 }}" tabindex="1" track-summary="call Toast" track-name="186" track-type="72" track-data="{ toastType: 'call' }" track-outcome="1" toast="">
//                                     <button class="toast-close-button toast-icon app-icons-fill-hover ng-scope" aria-label="Close" ng-click="close()"><!----><ng-include class="ng-scope" src="'svg/icons-close.html'"><svg role="presentation" focusable="false" class="app-svg icons-close" viewBox="-6 -6 32 32"><g class="icons-default-fill"><path class="icons-unfilled" d="M4.08859 4.21569L4.14645 4.14645C4.32001 3.97288 4.58944 3.9536 4.78431 4.08859L4.85355 4.14645L10 9.293L15.1464 4.14645C15.32 3.97288 15.5894 3.9536 15.7843 4.08859L15.8536 4.14645C16.0271 4.32001 16.0464 4.58944 15.9114 4.78431L15.8536 4.85355L10.707 10L15.8536 15.1464C16.0271 15.32 16.0464 15.5894 15.9114 15.7843L15.8536 15.8536C15.68 16.0271 15.4106 16.0464 15.2157 15.9114L15.1464 15.8536L10 10.707L4.85355 15.8536C4.67999 16.0271 4.41056 16.0464 4.21569 15.9114L4.14645 15.8536C3.97288 15.68 3.9536 15.4106 4.08859 15.2157L4.14645 15.1464L9.293 10L4.14645 4.85355C3.97288 4.67999 3.9536 4.41056 4.08859 4.21569L4.14645 4.14645L4.08859 4.21569Z"></path><path class="icons-filled" d="M3.89705 4.05379L3.96967 3.96967C4.23594 3.7034 4.6526 3.6792 4.94621 3.89705L5.03033 3.96967L10 8.939L14.9697 3.96967C15.2359 3.7034 15.6526 3.6792 15.9462 3.89705L16.0303 3.96967C16.2966 4.23594 16.3208 4.6526 16.1029 4.94621L16.0303 5.03033L11.061 10L16.0303 14.9697C16.2966 15.2359 16.3208 15.6526 16.1029 15.9462L16.0303 16.0303C15.7641 16.2966 15.3474 16.3208 15.0538 16.1029L14.9697 16.0303L10 11.061L5.03033 16.0303C4.76406 16.2966 4.3474 16.3208 4.05379 16.1029L3.96967 16.0303C3.7034 15.7641 3.6792 15.3474 3.89705 15.0538L3.96967 14.9697L8.939 10L3.96967 5.03033C3.7034 4.76406 3.6792 4.3474 3.89705 4.05379L3.96967 3.96967L3.89705 4.05379Z"></path></g></svg></ng-include></button>
//                                     <div class="toastbody toast-actions" ng-class="{ 'toast-files': message.notificationIcon, 'toast-actions': !!message.actions, 'toast-reply-band': message.replyBand }" data-tid="incoming-notification">
//                                         <div aria-hidden="true" class="background-image-container" ng-if="message.toastType == 'call'">
//                                             <img aria-hidden="true" picture-load="" ng-src="data:image/pjpeg;base64,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" class="background-image" alt="" src="data:image/pjpeg;base64,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">
//                                         </div>
//
//                                         <div class="avatar">
//                                             <div class="profile-img-parent toast-profile-img pull-left" ng-if="(!!message.userImage &amp;&amp; !message.isConnector) || message.showIconsInsteadOfAvatar">
//                                                 <img ng-if="!!message.userImage" ng-src="data:image/pjpeg;base64,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" alt="" src="data:image/pjpeg;base64,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"><!---->
//                                                 <ng-include ng-if="!!message.icon" src="message.icon"><svg viewBox="-6 -6 32 32" class="app-svg icons-call app-bar-icons-fill-colors" focusable="false" role="presentation"><g class="icons-default-fill"><path class="icons-filled" d="M6.98804 2.06583C7.89642 1.79202 8.86352 2.19473 9.31516 3.01218L9.38939 3.16069L10.0508 4.63206C10.4634 5.54986 10.2831 6.61902 9.60852 7.34954L9.47627 7.48242L8.43292 8.45535C8.24514 8.63292 8.3861 9.32175 9.06625 10.4998C9.67814 11.5596 10.1758 12.0552 10.4208 12.0823L10.4638 12.0819L10.5168 12.0715L12.5675 11.4445C13.1342 11.2713 13.7447 11.4487 14.1308 11.8865L14.2225 12.0013L15.5791 13.8815C16.1308 14.6462 16.0699 15.6841 15.4543 16.3779L15.3324 16.5039L14.7896 17.0179C13.7958 17.9591 12.3445 18.2346 11.0749 17.723C9.13964 16.9432 7.38174 15.1606 5.78466 12.3944C4.18421 9.62236 3.51998 7.20432 3.81695 5.13559C4.00075 3.85533 4.87398 2.78668 6.07846 2.34614L6.27134 2.28186L6.98804 2.06583Z"></path><path class="icons-unfilled" d="M6.98804 2.06583L6.27134 2.28186C4.96781 2.67478 4.01042 3.78795 3.81695 5.13559C3.51998 7.20432 4.18421 9.62236 5.78466 12.3944C7.38174 15.1606 9.13964 16.9432 11.0749 17.723C12.3445 18.2346 13.7958 17.9591 14.7896 17.0179L15.3324 16.5039C16.0599 15.8149 16.1653 14.694 15.5791 13.8815L14.2225 12.0013C13.8468 11.4807 13.1814 11.2568 12.5675 11.4445L10.5168 12.0715L10.4638 12.0819C10.2376 12.1149 9.71638 11.6259 9.06625 10.4998C8.3861 9.32175 8.24514 8.63292 8.43292 8.45535L9.47627 7.48242C10.2582 6.75326 10.4892 5.60722 10.0508 4.63206L9.38939 3.16069C8.97749 2.24445 7.94986 1.77591 6.98804 2.06583ZM8.47731 3.57071L9.13877 5.04209C9.40161 5.62676 9.26309 6.31388 8.79427 6.75107L7.74837 7.72639C7.07928 8.35912 7.30089 9.44212 8.20022 10.9998C9.04643 12.4655 9.81842 13.1898 10.6479 13.0642L10.7723 13.0376L12.8599 12.4008C13.0645 12.3383 13.2863 12.4129 13.4115 12.5864L14.7681 14.4666C15.0613 14.8728 15.0085 15.4333 14.6448 15.7778L14.102 16.2918C13.3921 16.9641 12.3555 17.1609 11.4486 16.7955C9.75054 16.1112 8.14573 14.4839 6.65069 11.8944C5.15258 9.29963 4.54629 7.09248 4.80681 5.27769C4.945 4.31509 5.62885 3.51997 6.55994 3.23931L7.27664 3.02328C7.75755 2.87832 8.27137 3.11259 8.47731 3.57071Z"></path></g></svg></ng-include><!---->
//                                             </div><!---->
//                                         <!-- Connector -->
//                                         <!---->
//                                         </div>
//
//                                         <div class="toast-message ">
//                                             <ng-include class="toast-icon " ng-if="!!message.icon" src="message.icon"><svg viewBox="-6 -6 32 32" class="app-svg icons-call app-bar-icons-fill-colors" focusable="false" role="presentation"><g class="icons-default-fill"><path class="icons-filled" d="M6.98804 2.06583C7.89642 1.79202 8.86352 2.19473 9.31516 3.01218L9.38939 3.16069L10.0508 4.63206C10.4634 5.54986 10.2831 6.61902 9.60852 7.34954L9.47627 7.48242L8.43292 8.45535C8.24514 8.63292 8.3861 9.32175 9.06625 10.4998C9.67814 11.5596 10.1758 12.0552 10.4208 12.0823L10.4638 12.0819L10.5168 12.0715L12.5675 11.4445C13.1342 11.2713 13.7447 11.4487 14.1308 11.8865L14.2225 12.0013L15.5791 13.8815C16.1308 14.6462 16.0699 15.6841 15.4543 16.3779L15.3324 16.5039L14.7896 17.0179C13.7958 17.9591 12.3445 18.2346 11.0749 17.723C9.13964 16.9432 7.38174 15.1606 5.78466 12.3944C4.18421 9.62236 3.51998 7.20432 3.81695 5.13559C4.00075 3.85533 4.87398 2.78668 6.07846 2.34614L6.27134 2.28186L6.98804 2.06583Z"></path><path class="icons-unfilled" d="M6.98804 2.06583L6.27134 2.28186C4.96781 2.67478 4.01042 3.78795 3.81695 5.13559C3.51998 7.20432 4.18421 9.62236 5.78466 12.3944C7.38174 15.1606 9.13964 16.9432 11.0749 17.723C12.3445 18.2346 13.7958 17.9591 14.7896 17.0179L15.3324 16.5039C16.0599 15.8149 16.1653 14.694 15.5791 13.8815L14.2225 12.0013C13.8468 11.4807 13.1814 11.2568 12.5675 11.4445L10.5168 12.0715L10.4638 12.0819C10.2376 12.1149 9.71638 11.6259 9.06625 10.4998C8.3861 9.32175 8.24514 8.63292 8.43292 8.45535L9.47627 7.48242C10.2582 6.75326 10.4892 5.60722 10.0508 4.63206L9.38939 3.16069C8.97749 2.24445 7.94986 1.77591 6.98804 2.06583ZM8.47731 3.57071L9.13877 5.04209C9.40161 5.62676 9.26309 6.31388 8.79427 6.75107L7.74837 7.72639C7.07928 8.35912 7.30089 9.44212 8.20022 10.9998C9.04643 12.4655 9.81842 13.1898 10.6479 13.0642L10.7723 13.0376L12.8599 12.4008C13.0645 12.3383 13.2863 12.4129 13.4115 12.5864L14.7681 14.4666C15.0613 14.8728 15.0085 15.4333 14.6448 15.7778L14.102 16.2918C13.3921 16.9641 12.3555 17.1609 11.4486 16.7955C9.75054 16.1112 8.14573 14.4839 6.65069 11.8944C5.15258 9.29963 4.54629 7.09248 4.80681 5.27769C4.945 4.31509 5.62885 3.51997 6.55994 3.23931L7.27664 3.02328C7.75755 2.87832 8.27137 3.11259 8.47731 3.57071Z"></path></g></svg></ng-include><!---->
//                                             <p ng-if="!message.isSkypeConsumerCall" ng-class="{ 'app-max-2-lines-base': message.toastType != 'DesktopNotification', 'max-3-lines': message.toastType == 'DesktopNotification' }" class="title app-max-2-lines-base">Magas Kristian (External) </p><!---->
//                                             <p ng-if="!message.isSpamCall" class="app-max-2-lines-base subtitle">is calling you</p><!---->
//                                             <p class="toast-channel message"></p>
//
//                                             <div class="actions" ng-if="!!message.actions">
//                                                 <button ng-repeat="action in message.actions" type="button" role="button" class="action-button call-video" title="Accept with video" aria-label="Accept with video" data-tid="" ng-click="action.action(); $event.stopPropagation();">
//                                                     <ng-include class="icon-wrapper" ng-if="!!action.imagePath &amp;&amp; message.toastType != 'DesktopNotification'" src="action.imagePath"><svg viewBox="-6 -6 32 32" class="app-svg icons-call-video icons-video" role="presentation" focusable="false"><g class="icons-default-fill"><path class="icons-unfilled" d="M4.5 4C3.11929 4 2 5.11929 2 6.5V13.5C2 14.8807 3.11929 16 4.5 16H11.5C12.8807 16 14 14.8807 14 13.5V12.5L16.4 14.3C17.0592 14.7944 18 14.324 18 13.5V6.49998C18 5.67594 17.0592 5.20556 16.4 5.69998L14 7.49998V6.5C14 5.11929 12.8807 4 11.5 4H4.5ZM14 8.74998L17 6.49998V13.5L14 11.25V8.74998ZM13 6.5V13.5C13 14.3284 12.3284 15 11.5 15H4.5C3.67157 15 3 14.3284 3 13.5V6.5C3 5.67157 3.67157 5 4.5 5H11.5C12.3284 5 13 5.67157 13 6.5Z"></path><g class="icons-filled"><path d="M13 6.5C13 5.11929 11.8807 4 10.5 4H4.5C3.11929 4 2 5.11929 2 6.5V13.5C2 14.8807 3.11929 16 4.5 16H10.5C11.8807 16 13 14.8807 13 13.5V6.5Z"></path><path d="M14 7.93082V12.0815L16.7642 14.4319C17.2512 14.8461 18 14.4999 18 13.8606V6.19315C18 5.55685 17.2575 5.20962 16.7692 5.61756L14 7.93082Z"></path></g></g></svg></ng-include><!---->
//                                         <!---->
//                                                 </button><!---->
//                                                 <button ng-repeat="action in message.actions" type="button" role="button" class="action-button call-audio" title="Accept with audio" aria-label="Accept with audio" data-tid="" ng-click="action.action(); $event.stopPropagation();">
//                                                     <ng-include class="icon-wrapper" ng-if="!!action.imagePath &amp;&amp; message.toastType != 'DesktopNotification'" src="action.imagePath"><svg viewBox="-6 -6 32 32" class="app-svg icons-call app-bar-icons-fill-colors" focusable="false" role="presentation"><g class="icons-default-fill"><path class="icons-filled" d="M6.98804 2.06583C7.89642 1.79202 8.86352 2.19473 9.31516 3.01218L9.38939 3.16069L10.0508 4.63206C10.4634 5.54986 10.2831 6.61902 9.60852 7.34954L9.47627 7.48242L8.43292 8.45535C8.24514 8.63292 8.3861 9.32175 9.06625 10.4998C9.67814 11.5596 10.1758 12.0552 10.4208 12.0823L10.4638 12.0819L10.5168 12.0715L12.5675 11.4445C13.1342 11.2713 13.7447 11.4487 14.1308 11.8865L14.2225 12.0013L15.5791 13.8815C16.1308 14.6462 16.0699 15.6841 15.4543 16.3779L15.3324 16.5039L14.7896 17.0179C13.7958 17.9591 12.3445 18.2346 11.0749 17.723C9.13964 16.9432 7.38174 15.1606 5.78466 12.3944C4.18421 9.62236 3.51998 7.20432 3.81695 5.13559C4.00075 3.85533 4.87398 2.78668 6.07846 2.34614L6.27134 2.28186L6.98804 2.06583Z"></path><path class="icons-unfilled" d="M6.98804 2.06583L6.27134 2.28186C4.96781 2.67478 4.01042 3.78795 3.81695 5.13559C3.51998 7.20432 4.18421 9.62236 5.78466 12.3944C7.38174 15.1606 9.13964 16.9432 11.0749 17.723C12.3445 18.2346 13.7958 17.9591 14.7896 17.0179L15.3324 16.5039C16.0599 15.8149 16.1653 14.694 15.5791 13.8815L14.2225 12.0013C13.8468 11.4807 13.1814 11.2568 12.5675 11.4445L10.5168 12.0715L10.4638 12.0819C10.2376 12.1149 9.71638 11.6259 9.06625 10.4998C8.3861 9.32175 8.24514 8.63292 8.43292 8.45535L9.47627 7.48242C10.2582 6.75326 10.4892 5.60722 10.0508 4.63206L9.38939 3.16069C8.97749 2.24445 7.94986 1.77591 6.98804 2.06583ZM8.47731 3.57071L9.13877 5.04209C9.40161 5.62676 9.26309 6.31388 8.79427 6.75107L7.74837 7.72639C7.07928 8.35912 7.30089 9.44212 8.20022 10.9998C9.04643 12.4655 9.81842 13.1898 10.6479 13.0642L10.7723 13.0376L12.8599 12.4008C13.0645 12.3383 13.2863 12.4129 13.4115 12.5864L14.7681 14.4666C15.0613 14.8728 15.0085 15.4333 14.6448 15.7778L14.102 16.2918C13.3921 16.9641 12.3555 17.1609 11.4486 16.7955C9.75054 16.1112 8.14573 14.4839 6.65069 11.8944C5.15258 9.29963 4.54629 7.09248 4.80681 5.27769C4.945 4.31509 5.62885 3.51997 6.55994 3.23931L7.27664 3.02328C7.75755 2.87832 8.27137 3.11259 8.47731 3.57071Z"></path></g></svg></ng-include><!---->
//                                         <!---->
//                                                 </button><!---->
//                                                 <button ng-repeat="action in message.actions" type="button" role="button" class="action-button call-reject" title="Decline call" aria-label="Decline call" data-tid="" ng-click="action.action(); $event.stopPropagation();">
//                                         <!----><!----><ng-include class="icon-wrapper" ng-if="!!action.imagePath &amp;&amp; message.toastType != 'DesktopNotification'" src="action.imagePath"><svg role="presentation" class="app-svg icons-call-end" viewBox="-6 -6 32 32"><path class="icons-default-fill" d="M17.9594 10.94L17.8015 11.7691C17.6535 12.546 16.9272 13.0678 16.1042 12.9883L14.4666 12.8301C13.753 12.7612 13.2241 12.24 13 11.5C12.6957 10.4952 12.5 9.75 12.5 9.75C11.7522 9.44348 11.0138 9.24996 10 9.24996C8.98623 9.24996 8.26225 9.46483 7.5 9.75C7.5 9.75 7.29566 10.4959 7 11.5C6.80244 12.1709 6.49595 12.7566 5.79708 12.8268L4.16895 12.9904C3.35656 13.0721 2.57765 12.5554 2.3467 11.7817L2.09921 10.9525C1.85286 10.1272 2.0727 9.2586 2.67633 8.67236C4.10141 7.28834 6.6656 6.50821 9.99245 6.50389C13.3241 6.4996 15.5858 7.27551 17.154 8.65967C17.8139 9.24211 18.116 10.1178 17.9594 10.94Z"></path></svg></ng-include><!---->
//                                         <!---->
//                                                 </button><!---->
//                                             </div>
//                                         </div>
//                                     </div>
//                                 <!---->
//                                 </div>
//                             </div>`);
}

async function handleGetConfig() {
	return config;
}

async function handleGetSystemIdleTime() {
	return powerMonitor.getSystemIdleTime();
}

async function handleGetSystemIdleState() {
	const systemIdleState = powerMonitor.getSystemIdleState(config.appIdleTimeout);
	logger.debug(`GetSystemIdleState => IdleTimeout: ${config.appIdleTimeout}s, IdleTimeoutPollInterval: ${config.appIdleTimeoutCheckInterval}s, ActiveCheckPollInterval: ${config.appActiveCheckInterval}s, IdleTime: ${powerMonitor.getSystemIdleTime()}s, IdleState: '${systemIdleState}'`);

	if (systemIdleState !== 'active' && idleTimeUserStatus == -1) {
		idleTimeUserStatus = userStatus;
	}

	const state = {
		...{
			system: systemIdleState,
			userIdle: idleTimeUserStatus,
			userCurrent: userStatus
		}
	};

	if (systemIdleState === 'active') {
		idleTimeUserStatus = -1
	}
	
	return state;
}

async function handleGetZoomLevel(_, name) {
	const partition = getPartition(name) || {};
	return partition.zoomLevel ? partition.zoomLevel : 0;
}

async function handleSaveZoomLevel(_, args) {
	let partition = getPartition(args.partition) || {};
	partition.name = args.partition;
	partition.zoomLevel = args.zoomLevel;
	savePartition(partition);
}

async function handleGetCustomBGList() {
	const file = path.join(app.getPath('userData'), 'custom_bg_remote.json');
	if (!fs.existsSync(file)) {
		return [];
	} else {
		return JSON.parse(fs.readFileSync(file));
	}
}

function getPartitions() {
	return appConfig.settingsStore.get('app.partitions') || [];
}

function getPartition(name) {
	const partitions = getPartitions();
	return partitions.filter(p => {
		return p.name === name;
	})[0];
}

function savePartition(arg) {
	const partitions = getPartitions();
	const partitionIndex = partitions.findIndex(p => {
		return p.name === arg.name;
	});

	if (partitionIndex >= 0) {
		partitions[partitionIndex] = arg;
	} else {
		partitions.push(arg);
	}
	appConfig.settingsStore.set('app.partitions', partitions);
}

function handleCertificateError() {
	const arg = {
		event: arguments[0],
		webContents: arguments[1],
		url: arguments[2],
		error: arguments[3],
		certificate: arguments[4],
		callback: arguments[5],
		config: config
	};
	certificateModule.onAppCertificateError(arg, logger);
}

async function requestMediaAccess() {
	['camera', 'microphone', 'screen'].map(async (permission) => {
		const status = await systemPreferences.askForMediaAccess(permission);
		logger.debug(`mac permission ${permission} asked current status ${status}`);
	});
}

/**
 * Handle user-status-changed message
 * 
 * @param {*} event 
 * @param {*} options 
 */
async function userStatusChangedHandler(event, options) {
	userStatus = options.data.status;
	logger.debug(`User status changed to '${userStatus}'`);
}

/**
 * Handle user-status-changed message
 * 
 * @param {*} event 
 * @param {*} count 
 */
async function setBadgeCountHandler(event, count) {
	logger.debug(`Badge count set to '${count}'`);
	app.setBadgeCount(count);
}

async function downloadCustomBGServiceRemoteConfig() {
	let customBGUrl;
	try {
		customBGUrl = new URL('', config.customBGServiceBaseUrl);
	}
	catch (err) {
		customBGUrl = new URL('', 'http://localhost');
	}

	const remotePath = httpHelper.joinURLs(customBGUrl.href, 'config.json');
	logger.debug(`Fetching custom background configuration from '${remotePath}'`);
	httpHelper.getAsync(remotePath)
		.then(onCustomBGServiceConfigDownloadSuccess)
		.catch(onCustomBGServiceConfigDownloadFailure);
	if (config.customBGServiceConfigFetchInterval > 0) {
		setTimeout(downloadCustomBGServiceRemoteConfig, config.customBGServiceConfigFetchInterval * 1000);
	}
}

function onCustomBGServiceConfigDownloadSuccess(data) {
	const downloadPath = path.join(app.getPath('userData'), 'custom_bg_remote.json');
	try {
		const configJSON = JSON.parse(data);
		for (let i = 0; i < configJSON.length; i++) {
			setPath(configJSON[i]);
		}
		fs.writeFileSync(downloadPath, JSON.stringify(configJSON));
		logger.debug(`Custom background service remote configuration stored at '${downloadPath}'`);
	}
	catch (err) {
		logger.error(`Failed to save remote configuration at '${downloadPath}'`);
	}
}

/**
 * @param {{filetype: string,id: string, name: string, src: string, thumb_src: string }} cfg 
 */
function setPath(cfg) {
	if (!cfg.src.startsWith('/teams-for-linux/custom-bg/')) {
		cfg.src = httpHelper.joinURLs('/teams-for-linux/custom-bg/', cfg.src);
	}

	if (!cfg.thumb_src.startsWith('/teams-for-linux/custom-bg/')) {
		cfg.thumb_src = httpHelper.joinURLs('/teams-for-linux/custom-bg/', cfg.thumb_src);
	}
}

function onCustomBGServiceConfigDownloadFailure(err) {
	const dlpath = path.join(app.getPath('userData'), 'custom_bg_remote.json');
	logger.error(err.message);
	try {
		fs.writeFileSync(dlpath, JSON.stringify([]));
	}
	catch (err) {
		logger.error(`Failed to save remote configuration at '${dlpath}'`);
	}
}