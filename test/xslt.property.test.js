'use strict';
const assert = require('node:assert');
const fc = require('fast-check');

const libxslt = require('..');
const { xmlText, tree, render, countElements, textContent } = require('./support/arbitraries');

const XSL_OPEN = '<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">';
const XSL_CLOSE = '</xsl:stylesheet>';

function applyAsync(stylesheet, source, params) {
	return new Promise((resolve, reject) => {
		stylesheet.apply(source, params, (err, result) => err ? reject(err) : resolve(result));
	});
}

describe('XSLT properties', function() {
	let echoParam, summarize, identity;

	before(function() {
		// Outputs the string parameter p as text
		echoParam = libxslt.parse(
			`${XSL_OPEN}<xsl:output method="text"/><xsl:param name="p"/>` +
			`<xsl:template match="/"><xsl:value-of select="$p"/></xsl:template>${XSL_CLOSE}`);
		// Outputs the element count and the document's text content
		summarize = libxslt.parse(
			`${XSL_OPEN}<xsl:output method="text"/>` +
			`<xsl:template match="/"><xsl:value-of select="count(//*)"/>|<xsl:value-of select="."/></xsl:template>${XSL_CLOSE}`);
		identity = libxslt.parse(
			`${XSL_OPEN}<xsl:template match="/"><xsl:copy-of select="."/></xsl:template>${XSL_CLOSE}`);
	});

	it('should pass any string parameter through unchanged', function() {
		fc.assert(fc.property(xmlText, (value) => {
			assert.strictEqual(echoParam.apply('<root/>', { p: value }), value);
		}));
	});

	it('should see every element and all text of any document', function() {
		fc.assert(fc.property(tree, (root) => {
			let result = summarize.apply(render(root));
			assert.strictEqual(result, `${countElements(root)}|${textContent(root)}`);
		}), {
			examples: [
				// A line ending split across two adjacent text nodes
				[{ name: 'a', attributes: [], children: ['\r', '\n'] }],
				// A carriage return and a line feed separated by a tag
				[{ name: 'a', attributes: [], children: [{ name: 'a', attributes: [], children: ['\r'] }, '\n'] }],
				[{ name: 'a', attributes: [], children: ['\r', { name: 'a', attributes: [], children: ['\n'] }] }]
			]
		});
	});

	it('should give the same result when the identity transform is applied twice', function() {
		fc.assert(fc.property(tree, (root) => {
			let once = identity.apply(render(root));
			assert.strictEqual(identity.apply(once), once);
		}));
	});

	it('should give the same results for concurrent asynchronous applies as for synchronous ones', async function() {
		this.timeout(60000);
		let stylesheets = [echoParam, summarize, identity];
		let job = fc.record({
			stylesheet: fc.nat({ max: stylesheets.length - 1 }),
			root: tree,
			p: xmlText
		});
		await fc.assert(fc.asyncProperty(fc.array(job, { minLength: 1, maxLength: 40 }), async (jobs) => {
			let actual = await Promise.all(jobs.map((j) => applyAsync(stylesheets[j.stylesheet], render(j.root), { p: j.p })));
			let expected = jobs.map((j) => stylesheets[j.stylesheet].apply(render(j.root), { p: j.p }));
			assert.deepStrictEqual(actual, expected);
		}), { numRuns: 25 });
	});
});
