/* ------------------------------------------------------------------
* node-beacon-scanner - scanner.js
*
* Copyright (c) 2017, Futomi Hatano, All rights reserved.
* Released under the MIT license
* Date: 2017-09-06
* ---------------------------------------------------------------- */
'use strict';
const mBeaconParser = require('./parser.js');

/* ------------------------------------------------------------------
* Constructor: BeaconScanner(params)
* - params:
*     noble  : The Nobel object created by the noble module.
*              This parameter is optional. If you don't specify
*              this parameter, this module automatically creates it.
* ---------------------------------------------------------------- */
const BeaconScanner = function(params) {
	// Public properties
	this.noble = null;
	if(params && 'noble' in params) {
		if(typeof(params['noble']) === 'object') {
			this.noble = params['noble'];
		} else {
			throw new Error('The value of the "noble" property is invalid.');
		}
	} else {
		this.noble = require('@abandonware/noble');
	}
	this.onadvertisement = null;

	// Private properties
	this._initialized = false;
	this._is_scanning = false;

	this._beacons = {};
};

/* ------------------------------------------------------------------
* Method: stopScan()
* ---------------------------------------------------------------- */
BeaconScanner.prototype.stopScan = function() {
	this.noble.removeAllListeners('discover');
	this._beacons = {};
	clearInterval(this._oldBeaconRemovalInterval);
	if(this._is_scanning === true) {
		this.noble.stopScanning();
		this._is_scanning = false;
	}
};

/* ------------------------------------------------------------------
* Method: startScan()
* ---------------------------------------------------------------- */
BeaconScanner.prototype.startScan = function(gracePeriod) {
	let promise = new Promise((resolve, reject) => {
		this._init().then(() => {
			this._prepareScan();
		}).then(() => {
			resolve();
		}).catch((error) => {
			reject(error);
		});
	});

	this._gracePeriod = gracePeriod;
	this.noDuplicates = (gracePeriod > 0);

	if (this.noDuplicates) {
		this._oldBeaconRemovalInterval = setInterval(this.oldBeaconRemoval.bind(this), this._gracePeriod / 2);
	} else {
		if (this._oldBeaconRemovalInterval != null) {
			clearInterval(this._oldBeaconRemovalInterval);
		}
	}

	return promise;
};

BeaconScanner.prototype._prepareScan = function() {
	let promise = new Promise((resolve, reject) => {
		this.noble.startScanning([], true, (error) => {
			if(error) {
				reject(error);
			} else {
				this.noble.on('discover', (peripheral) => {
					if(this.onadvertisement && typeof(this.onadvertisement) === 'function') {
						let parsed = this.parse(peripheral);
						if(parsed) {
							parsed['lastSeen'] = Date.now();
							if (this.noDuplicates) {
								let id = parsed['id'];
								if (parsed['beaconType'] === 'estimoteTelemetry') {
									id = parsed['estimoteTelemetry']['telemetryId'];
								}

								let oldBeacon = this._beacons[id];
								if (!oldBeacon) {
									this.onadvertisement(parsed);
									this._beacons[id] = parsed;
								}
							} else {
								this.onadvertisement(parsed);
							}
						}
					}
				});
				this._is_scanning = true;
				resolve();
			}
		});
	});
	return promise;
};

BeaconScanner.prototype.oldBeaconRemoval = function() {
	for (var id in this._beacons) {
		if (this._beacons[id]['lastSeen'] < (Date.now() - this._gracePeriod)) {
			delete this._beacons[id];
		}
	}
};

BeaconScanner.prototype._init = function() {
	let promise = new Promise((resolve, reject) => {
		this._initialized = false;
		if(this.noble.state === 'poweredOn') {
			this._initialized = true;
			resolve();
		} else {
			this.noble.once('stateChange', (state) => {
				if(state === 'poweredOn') {
					this._initialized = true;
					resolve();
				} else {
					let err = new Error('Failed to initialize the Noble object: ' + state);
					reject(err);
				}
			});
		}
	});
	return promise;
};

/* ------------------------------------------------------------------
* Method: parse(peripheral)
* - buf: `Peripheral` object of the noble)
* ---------------------------------------------------------------- */
BeaconScanner.prototype.parse = function(peripheral) {
	return mBeaconParser.parse(peripheral);
};

module.exports = BeaconScanner;
