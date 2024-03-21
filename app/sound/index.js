const { Utilities } = require('./lib/utilities');
// eslint-disable-next-line no-unused-vars
const { NodeSoundPlayer, DefaultPlayer } = require('./lib/players');

// List of supported players
const SUPPORTED_PLAYERS = [
	{
		command: 'paplay',
		platforms: ['linux'],
		handlerClass: DefaultPlayer
	},
	{
		command: 'aplay',
		platforms: ['linux'],
		handlerClass: DefaultPlayer
	},
	{
		command: 'afplay',
		platforms: ['darwin'],
		handlerClass: DefaultPlayer
	}
];

class NodeSound {
    static _cachedPlayer;
	/**
	 * @returns {NodeSoundPlayer}
	 */
	static getDefaultPlayer() {
        const player = Utilities.getFirstInstalled(getSupportedPlayerNames());
        if (!player) {
            throw new Error('No supported players installed in the system');
        } else {
            const handlerClass = getHandlerClass(player);
            return new handlerClass(player);
        }
	}

	/**
	 * @returns {NodeSoundPlayer}
	 */
	static getPlayer() {
	}
}

/**
 * @returns {Array<string>}
 */
function getSupportedPlayerNames() {
	return getSupportedPlayersForPlatform(process.platform).map(p => {
		return p.command;
	});
}

/**
 * @param {string} platform 
 */
function getSupportedPlayersForPlatform(platform) {
	return SUPPORTED_PLAYERS.filter(f => {
		return f.platforms.includes(platform);
	});
}

function getHandlerClass(command) {
	return SUPPORTED_PLAYERS.filter(p => {
		return p.command === command;
	})[0].handlerClass;
}

module.exports = {
	NodeSound,
	NodeSoundPlayer
};