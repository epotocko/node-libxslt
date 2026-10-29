'use strict';
const assert = require('node:assert');
const fc = require('fast-check');

const libxslt = require('..');

const XSL_OPEN = '<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">';
const XSL_CLOSE = '</xsl:stylesheet>';

// Any character allowed in an XML document, weighted towards characters with special meaning
const xmlChar = fc.oneof(
	{ weight: 3, arbitrary: fc.constantFrom('&', '<', '>', "'", ']', '\t', '\n', '\r', ' ') },
	{ weight: 3, arbitrary: fc.integer({ min: 0x20, max: 0x7e }).map((c) => String.fromCodePoint(c)) },
	{ weight: 1, arbitrary: fc.integer({ min: 0x80, max: 0xd7ff }).map((c) => String.fromCodePoint(c)) },
	{ weight: 1, arbitrary: fc.integer({ min: 0xe000, max: 0xfffd }).map((c) => String.fromCodePoint(c)) },
	{ weight: 1, arbitrary: fc.integer({ min: 0x10000, max: 0x10ffff }).map((c) => String.fromCodePoint(c)) }
);
const xmlText = fc.string({ unit: xmlChar, maxLength: 40 });

const escapeText = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// An element tree as { name, children } with string children for text
const tree = fc.letrec((tie) => ({
	element: fc.record({
		name: fc.stringMatching(/^[a-z][a-z0-9]{0,6}$/),
		children: fc.array(fc.oneof({ weight: 2, arbitrary: xmlText }, { weight: 1, arbitrary: tie('element') }), { maxLength: 4 })
	}, { noNullPrototype: true })
})).element;

function render(node) {
	if (typeof node === 'string') return escapeText(node);
	return `<${node.name}>${node.children.map(render).join('')}</${node.name}>`;
}
function countElements(node) {
	return typeof node === 'string' ? 0 : 1 + node.children.reduce((sum, child) => sum + countElements(child), 0);
}
// XML parsers normalize line endings in each run of serialized text, so adjacent text
// children merge into one run (\r then \n is one line ending), while a tag between them
// separates the runs
function textContent(node) {
	if (typeof node === 'string') return node.replace(/\r\n?/g, '\n');
	let text = '', run = '';
	for (let child of node.children) {
		if (typeof child === 'string') {
			run += child;
		} else {
			text += textContent(run) + textContent(child);
			run = '';
		}
	}
	return text + textContent(run);
}

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

	it('should pass any string parameter without double quotes through unchanged', function() {
		fc.assert(fc.property(xmlText.filter((value) => !value.includes('"')), (value) => {
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
				[{ name: 'a', children: ['\r', '\n'] }],
				// A carriage return and a line feed separated by a tag
				[{ name: 'a', children: [{ name: 'a', children: ['\r'] }, '\n'] }],
				[{ name: 'a', children: ['\r', { name: 'a', children: ['\n'] }] }]
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
			p: xmlText.filter((value) => !value.includes('"'))
		});
		await fc.assert(fc.asyncProperty(fc.array(job, { minLength: 1, maxLength: 40 }), async (jobs) => {
			let actual = await Promise.all(jobs.map((j) => applyAsync(stylesheets[j.stylesheet], render(j.root), { p: j.p })));
			let expected = jobs.map((j) => stylesheets[j.stylesheet].apply(render(j.root), { p: j.p }));
			assert.deepStrictEqual(actual, expected);
		}), { numRuns: 25 });
	});
});
