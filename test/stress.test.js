'use strict';
// Concurrency and lifetime stress: many calls in flight at once, stylesheets garbage collected
// mid-transform, and several worker threads. Run under AddressSanitizer by npm run test:sanitize.
const assert = require('node:assert');
const path = require('node:path');
const { Worker } = require('node:worker_threads');
const fc = require('fast-check');

const libxslt = require('..');
const { xmlText, tree, render } = require('./support/arbitraries');

const XSL_OPEN = '<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">';
const XSL_CLOSE = '</xsl:stylesheet>';
const ECHO = `${XSL_OPEN}<xsl:output method="text"/><xsl:param name="p"/><xsl:template match="/">` +
	`<xsl:value-of select="count(//*)"/>|<xsl:value-of select="$p"/></xsl:template>${XSL_CLOSE}`;
// Not well-formed, with the error on the line after the leading line breaks
const badXml = (line) => '\n'.repeat(line) + '<a><b></a>';
const badStylesheet = (line) => '\n'.repeat(line) + `${XSL_OPEN}<xsl:template match="/"><open></xsl:template>${XSL_CLOSE}`;

// One library call; failing jobs are included so that concurrent error capture is checked too
const job = fc.oneof(
	fc.record({ kind: fc.constant('transform'), root: tree, p: xmlText }),
	fc.record({ kind: fc.constant('compileAndTransform'), root: tree, p: xmlText }),
	fc.record({ kind: fc.constant('select'), root: tree }),
	fc.record({ kind: fc.constant('update'), root: tree, value: xmlText }),
	fc.record({ kind: fc.constant('badXml'), line: fc.nat(50) }),
	fc.record({ kind: fc.constant('badXPath'), expression: fc.constantFrom('///', '/a[', 'x:a', 'count(/a)') }),
	fc.record({ kind: fc.constant('badStylesheet'), line: fc.nat(50) })
);

function outcome(error, result) {
	return error ? { error: error.message, line: error.line } : { result };
}

const callbackToPromise = (call) => new Promise((resolve) => call((err, result) => resolve(outcome(err, result))));
const settle = (promise) => promise.then((result) => outcome(null, result), (err) => outcome(err));
const syncOutcome = (fn) => {
	try {
		return outcome(null, fn());
	} catch (err) {
		return outcome(err);
	}
};

function runAsync(j, echo) {
	switch (j.kind) {
		case 'transform': return callbackToPromise((cb) => echo.apply(render(j.root), { p: j.p }, cb));
		case 'compileAndTransform': return callbackToPromise((cb) => libxslt.parse(ECHO, (err, s) => err ? cb(err) : s.apply(render(j.root), { p: j.p }, cb)));
		case 'select': return settle(libxslt.xpathSelect(render(j.root), '//node()', { fields: ['type', 'name', 'text', 'xml'] }));
		case 'update': return settle(libxslt.xpathUpdate(render(j.root), '//*', j.value));
		case 'badXml': return settle(libxslt.xpathSelect(badXml(j.line), '/a'));
		case 'badXPath': return settle(libxslt.xpathSelect('<a/>', j.expression));
		case 'badStylesheet': return callbackToPromise((cb) => libxslt.parse(badStylesheet(j.line), cb));
	}
}

function runSync(j, echo) {
	switch (j.kind) {
		case 'transform': return syncOutcome(() => echo.apply(render(j.root), { p: j.p }));
		case 'compileAndTransform': return syncOutcome(() => libxslt.parse(ECHO).apply(render(j.root), { p: j.p }));
		case 'select': return syncOutcome(() => libxslt.xpathSelectSync(render(j.root), '//node()', { fields: ['type', 'name', 'text', 'xml'] }));
		case 'update': return syncOutcome(() => libxslt.xpathUpdateSync(render(j.root), '//*', j.value));
		case 'badXml': return syncOutcome(() => libxslt.xpathSelectSync(badXml(j.line), '/a'));
		case 'badXPath': return syncOutcome(() => libxslt.xpathSelectSync('<a/>', j.expression));
		case 'badStylesheet': return syncOutcome(() => libxslt.parse(badStylesheet(j.line)));
	}
}

// A node-style callback whose closure holds only resolve and reject
function callbackFor(resolve, reject) {
	return (err, result) => err ? reject(err) : resolve(result);
}

function applyAsync(stylesheet, xml) {
	return new Promise((resolve, reject) => stylesheet.apply(xml, (err, result) => err ? reject(err) : resolve(result)));
}

// Runs code in a worker thread that has loaded the package, resolving to what it posts
function inWorker(body) {
	let worker = new Worker(
		'const { parentPort, workerData } = require("node:worker_threads");' +
		'const libxslt = require(workerData.root);' +
		`(async () => { ${body} })().then((r) => parentPort.postMessage(r), (e) => parentPort.postMessage({ error: e.stack }));`,
		{ eval: true, workerData: { root: path.join(__dirname, '..'), echo: ECHO } }
	);
	return { worker, result: new Promise((resolve, reject) => { worker.once('message', resolve); worker.once('error', reject); }) };
}

describe('stress', function() {
	this.timeout(120000);

	it('should give hundreds of concurrent calls, including failing ones, the same outcomes as sequential calls', async function() {
		let echo = libxslt.parse(ECHO);
		await fc.assert(fc.asyncProperty(fc.array(job, { minLength: 200, maxLength: 400 }), async (jobs) => {
			let actual = await Promise.all(jobs.map((j) => runAsync(j, echo)));
			assert.deepStrictEqual(actual, jobs.map((j) => runSync(j, echo)));
		}), { numRuns: 5 });
	});

	it('should finish transforms whose stylesheet is garbage collected while they run', async function() {
		assert.strictEqual(typeof global.gc, 'function', 'needs node --expose-gc');
		let input = `<root>${'<i>x</i>'.repeat(50000)}</root>`;
		let collected = false;
		let registry = new FinalizationRegistry(() => { collected = true; });
		let pending = [];
		(() => {
			// The only references to this stylesheet are dropped when this function returns. The
			// callbacks come from callbackFor so that their closures can't keep it alive.
			let stylesheet = libxslt.parse(`${XSL_OPEN}<xsl:output method="text"/><xsl:template match="/"><xsl:value-of select="count(//i)"/></xsl:template>${XSL_CLOSE}`);
			registry.register(stylesheet.stylesheetObj, 'stylesheet');
			for (let i = 0; i < 16; i++) {
				let callback;
				pending.push(new Promise((resolve, reject) => { callback = callbackFor(resolve, reject); }));
				stylesheet.apply(input, callback);
			}
		})();
		for (let i = 0; i < 10; i++) {
			global.gc();
			await new Promise((resolve) => setImmediate(resolve));
		}
		assert.deepStrictEqual(await Promise.all(pending), new Array(16).fill('50000'));
		// Once the transforms are done the stylesheet must be collectable, or this test proves nothing
		for (let i = 0; i < 20 && !collected; i++) {
			global.gc();
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
		assert.strictEqual(collected, true, 'the stylesheet was never garbage collected');
	});

	it('should free stylesheets that are no longer referenced', async function() {
		for (let round = 0; round < 20; round++) {
			for (let i = 0; i < 100; i++) libxslt.parse(ECHO);
			global.gc();
			await new Promise((resolve) => setImmediate(resolve));
		}
		assert.strictEqual(libxslt.parse(ECHO).apply('<a/>', { p: 'ok' }), '1|ok');
	});

	it('should run calls in several worker threads and the main thread at once', async function() {
		let body = `
			let echo = libxslt.parse(workerData.echo);
			let calls = [];
			for (let i = 0; i < 100; i++) {
				calls.push(new Promise((resolve, reject) => echo.apply('<a><b/></a>', { p: String(i) }, (e, r) => e ? reject(e) : resolve(r))));
				calls.push(libxslt.xpathUpdate('<a><b/></a>', '//b', String(i)));
			}
			let results = await Promise.all(calls);
			for (let i = 0; i < 100; i++) {
				if (results[2 * i] !== '2|' + i) throw new Error('transform ' + i + ': ' + results[2 * i]);
				if (!results[2 * i + 1].includes('<b>' + i + '</b>')) throw new Error('update ' + i + ': ' + results[2 * i + 1]);
			}
			return { ok: results.length };`;
		let workers = Array.from({ length: 4 }, () => inWorker(body));
		let echo = libxslt.parse(ECHO);
		let main = await Promise.all(Array.from({ length: 100 }, (_, i) => applyAsync(echo, '<a/>').then((r) => r === '1|' ? null : r)));
		assert.deepStrictEqual(await Promise.all(workers.map((w) => w.result)), new Array(4).fill({ ok: 200 }));
		assert.deepStrictEqual(main.filter(Boolean), []);
	});

	it('should survive a worker thread that is terminated with calls still running', async function() {
		for (let round = 0; round < 5; round++) {
			let { worker, result } = inWorker(`
				let input = '<root>' + '<i>x</i>'.repeat(20000) + '</root>';
				let echo = libxslt.parse(workerData.echo);
				for (let i = 0; i < 20; i++) {
					echo.apply(input, () => {});
					libxslt.xpathSelect(input, '//i').catch(() => {});
				}
				return { started: true };`);
			assert.deepStrictEqual(await result, { started: true });
			await worker.terminate();
		}
		// The main thread still works
		assert.strictEqual(libxslt.parse(ECHO).apply('<a/>', { p: 'alive' }), '1|alive');
	});
});
