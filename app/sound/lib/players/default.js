const { Utilities } = require('../utilities');
// eslint-disable-next-line no-unused-vars
const { NodeSoundPlayer, NodeSoundPlayerOptions } = require('./base');
const { spawn } = require('child_process');

class DefaultPlayer extends NodeSoundPlayer {
	constructor(command) {
		super(command);
		this._process = null;
	}

	_startProcess(args, callback){
	    var proc;
	    this._killProcess();
	    proc = this._process = spawn(args[0], args.slice(1));
        proc.on('close', () => { callback && callback(); this._processEnded()});
        proc.on('error', () => { callback && callback(); this._processEnded()});
	}

	_processEnded(){
	    this._process = null;
	}

	_killProcess(){
	    if(this._process){
            this._process.kill('SIGTERM');
            this._processEnded();
	    }
	}

	/**
	 * @param {string} file 
	 * @param {NodeSoundPlayerOptions} options 
	 * @returns {Promise<void>}
	 */
	// eslint-disable-next-line no-unused-vars
	play(file, options) {
	    var soundDev = Utilities.resolveDevice(this.command, options?.device);
	    var cb = options?.callback || (() => {});

	    if(soundDev){
	        console.log(this.command, "--device", soundDev, file)
	        this._startProcess([this.command, "--device", soundDev, file], cb);
	        return;
	    }

		this._startProcess([this.command, file], cb);
	}

	loop(file, options) {
	    var that = this;
	    var opts = options || {};
	    opts.callback = () => {
	        if(this._process){
	            that.loop(file, options);
	        }
	    };
		this.play(file, options);
	}

	stop() {
		this._killProcess();
	}
}

module.exports = {
	DefaultPlayer
};