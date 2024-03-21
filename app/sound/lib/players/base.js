class NodeSoundPlayerOptions {
	/**
	 * @param {NodeSoundPlayerOptions} options 
	 */
	// eslint-disable-next-line no-unused-vars
	constructor(options) {
	}
}

let _NodeSoundPlayer_command = new WeakMap();
class NodeSoundPlayer {
	constructor(command) {
		this.command = command;
	}
	/**
	 * @param {string} file 
	 * @param {NodeSoundPlayerOptions} options 
	 * @returns {Promise<void>}
	 */
	// eslint-disable-next-line no-unused-vars
	play(file, options) {
		throw new Error('Method not implemented');
	}

	stop() {
		throw new Error('Method not implemented');
	}

	loop(file, options) {
		throw new Error('Method not implemented');
	}

	/**
	 * @type {string}
	 */
	get command() {
		return _NodeSoundPlayer_command.get(this);
	}

	set command(value) {
		_NodeSoundPlayer_command.set(this, typeof (value) === 'string' ? value : null);
	}
}

module.exports = {
	NodeSoundPlayer,
	NodeSoundPlayerOptions
};