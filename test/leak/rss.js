'use strict';
// Memory growth check: makes many calls of every kind, including failing ones, in PASSES equal
// passes, and fails if resident memory grows by more than LIMIT bytes per call over the last
// MEASURED passes. The earlier passes let the allocators reach a steady state (on Node 24 about
// 250,000 calls, after which RSS stays flat). Small leaks are LeakSanitizer's job (test/native).
// Usage: node --expose-gc test/leak/rss.js [calls per pass]
const assert = require('node:assert');
const libxslt = require('../..');

const CALLS = Number(process.argv[2]) || 50000;
const PASSES = 10;
const MEASURED = 4;
const BATCH = 100;
const LIMIT = 16;

const XSL = '<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform"><xsl:param name="p"/>' +
	'<xsl:template match="/"><out p="{$p}"><xsl:copy-of select="//item[@id &gt; 10]"/></out></xsl:template></xsl:stylesheet>';
const DOC = '<?xml version="1.0"?><!DOCTYPE root [<!ENTITY e "entity &amp; text">]><root xmlns:n="urn:n">' +
	Array.from({ length: 50 }, (_, i) => `<item id="${i}" n:k="v${i}">&e; ${i} <![CDATA[<c>]]><!--c--></item>`).join('') + '</root>';
const BAD_XML = '<root><a></root>';

const stylesheet = libxslt.parse(XSL);
const callback = (resolve) => () => resolve();

// Each call resolves whether it succeeds or fails
const calls = [
	() => Promise.resolve(stylesheet.apply(DOC, { p: 'sync' })),
	() => new Promise((resolve) => stylesheet.apply(DOC, { p: 'async' }, callback(resolve))),
	() => new Promise((resolve) => libxslt.parse(XSL, (err, s) => s.apply(DOC, callback(resolve)))),
	() => new Promise((resolve) => stylesheet.apply(BAD_XML, callback(resolve))),
	() => new Promise((resolve) => libxslt.parse(BAD_XML, callback(resolve))),
	() => Promise.resolve(libxslt.xpathSelectSync(DOC, '//node()', { fields: ['type', 'name', 'text', 'attributes', 'xml', 'childXml'] })),
	() => libxslt.xpathSelect(DOC, '//@*', { fields: ['text', 'xml'] }),
	() => libxslt.xpathUpdate(DOC, '//item | //comment()', 'new & value', { format: true }),
	() => Promise.resolve(libxslt.xpathUpdateSync(DOC, '//item/@id', 'x')),
	() => libxslt.xpathSelect(BAD_XML, '/root').catch(() => {}),
	() => libxslt.xpathSelect(DOC, '///').catch(() => {}),
	() => libxslt.xpathUpdate(DOC, 'count(//item)', 'x').catch(() => {})
];

async function pass() {
	for (let i = 0; i < CALLS; i += BATCH) {
		await Promise.all(Array.from({ length: BATCH }, (_, j) => calls[(i + j) % calls.length]()));
	}
}

async function settledRss() {
	for (let i = 0; i < 3; i++) {
		global.gc();
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	return process.memoryUsage().rss;
}

async function main() {
	assert.strictEqual(typeof global.gc, 'function', 'run with node --expose-gc');
	const mb = (bytes) => (bytes / 1048576).toFixed(1);
	let rss = [await settledRss()];
	for (let p = 1; p <= PASSES; p++) {
		await pass();
		rss.push(await settledRss());
	}
	let perCall = (rss[PASSES] - rss[PASSES - MEASURED]) / (MEASURED * CALLS);
	console.log(`RSS (MB) at the start and after each pass of ${CALLS} calls: ${rss.map(mb).join(', ')}`);
	console.log(`Growth over the last ${MEASURED} passes: ${perCall.toFixed(2)} bytes per call (limit ${LIMIT})`);
	if (perCall > LIMIT) {
		console.error('FAILED: memory keeps growing');
		process.exit(1);
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
