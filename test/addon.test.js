'use strict';
const assert = require('node:assert');
const path = require('node:path');
const { Worker } = require('node:worker_threads');

const libxslt = require('..');

const VERSION = /^\d+\.\d+\.\d+$/;

// Numeric comparison of two x.y.z version strings
function atLeast(version, minimum) {
	let a = version.split('.').map(Number), b = minimum.split('.').map(Number);
	for (let i = 0; i < 3; i++) {
		if (a[i] !== b[i]) return a[i] > b[i];
	}
	return true;
}

describe('native addon', function() {
	it('reports the libxml2, libxslt and libexslt versions it runs against', function() {
		assert.match(libxslt.versions.libxml2, VERSION);
		assert.match(libxslt.versions.libxslt, VERSION);
		assert.match(libxslt.versions.libexslt, VERSION);
	});

	it('runs against at least libxml2 2.9.14 and libxslt 1.1.35', function() {
		assert.ok(atLeast(libxslt.versions.libxml2, '2.9.14'), `libxml2 ${libxslt.versions.libxml2}`);
		assert.ok(atLeast(libxslt.versions.libxslt, '1.1.35'), `libxslt ${libxslt.versions.libxslt}`);
	});

	it('loads in a worker thread alongside the main thread', async function() {
		let worker = new Worker(
			'const { parentPort, workerData } = require("node:worker_threads");' +
			'parentPort.postMessage(require(workerData).versions);',
			{ eval: true, workerData: path.join(__dirname, '..') }
		);
		let [versions] = await Promise.all([
			new Promise((resolve, reject) => {
				worker.once('message', resolve);
				worker.once('error', reject);
			}),
			new Promise((resolve) => worker.once('exit', resolve))
		]);
		assert.deepStrictEqual(versions, libxslt.versions);
	});
});
