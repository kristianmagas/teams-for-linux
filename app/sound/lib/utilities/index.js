const { execSync, spawn } = require('child_process');
class Utilities {
	/**
	 * Returns the first available command in the system from the list supplied.
	 * @param {Array<string>} executables 
	 */
	static getFirstInstalled(executables) {
		let commands = Array.isArray(executables) ? executables : [executables];
		for (const command of commands) {
			if (this.isInstalled(command)) {
				return command;
			}
		}
	}

	/**
	 * Checks if the specified executable is present in the system.
	 * @param {string} executable Executable command.
	 * @returns {boolean}
	 */
	static isInstalled(executable) {
		try {
			execSync(`which ${executable}`, { stdio:'ignore'});
			return true;
		}
		catch (e) {
			return false;
		}
	}

	static getCards(){
		var cards = {};
		try {
			var list = ("" + execSync("cat /proc/asound/cards | grep -o -e '[0-9] \\[.*\\]'")).trim().split("\n");
			list.forEach((i) => {
                var [num, name] = i.split(" ");
                cards[num] = name.substr(1);
			});
		}
		catch {}

		return cards;
	}

	static getDevices(){
		var cards = {};
		try {
			var list = ("" + execSync("cat /proc/asound/devices | grep playback | grep -o -e '\\[.*\\]'")).trim().split("\n");
			list.forEach((i) => {
                var [num, name] = i.split("-");
                num = num.substr(1).trim();
                name = name.substr(0, 2).trim()
                cards[num] = cards[num] || [];
                cards[num].push(name);
			});
		}
		catch {}

		return cards;
	}

	static resolveDevice(command, device){
	    var test = /^hw:[0-9]+,[0-9]+$/;

	    if(test.exec(device)){
	        if(command === "aplay"){
                return device;
	        }

	        if(command === "paplay"){
	            var cards = Utilities.getCards();
	            var devices = Utilities.getDevices();
	            var [iCard, iDev] = device.split(":")[1].split(",");
	            if(iCard in cards && iCard in devices && devices[iCard].indexOf(iDev) > -1){
                    return "alsa:pcm:" + iCard + ":hw:" + cards[iCard] + "," + iDev + ":playback";
	            }
	        }
	    }

	    return null;
	}

	static createEmptyPromise() {
		return new Promise((resolve) => {
			resolve();
		});
	}

	static createCommandExecutionPromise(...args) {
		return new Promise((resolve, reject) => {
			const proc = spawn(args[0], args.slice(1));
			proc.on('close', createSuccessHandler(resolve));
			proc.on('error', createFailureHandler(reject));
		});
	}
}

function createSuccessHandler(resolve) {
	return () => {
		resolve();
	};
}

function createFailureHandler(reject) {
	return (err) => {
		reject(err);
	};
}

module.exports = {
	Utilities
};