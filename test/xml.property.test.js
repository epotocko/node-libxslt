'use strict';
const assert = require('node:assert');
const fc = require('fast-check');

const libxslt = require('..');
const { xmlText, tree, render, countElements, elementNames, textContent } = require('./support/arbitraries');

describe('XPath properties', function() {
	it('should select every element of any document, in document order', function() {
		fc.assert(fc.property(tree, (root) => {
			let nodes = libxslt.xpathSelectSync(render(root), '//*');
			assert.strictEqual(nodes.length, countElements(root));
			assert.deepStrictEqual(nodes.map((n) => n.type), nodes.map(() => 'element'));
			assert.deepStrictEqual(nodes.map((n) => n.name), elementNames(root));
		}));
	});

	it('should give any element its text content and attributes', function() {
		fc.assert(fc.property(tree, (root) => {
			let node = libxslt.xpathSelectSync(render(root), '/*', { first: true, fields: ['text', 'attributes'] });
			assert.strictEqual(node.text, textContent(root));
			assert.deepStrictEqual(node.attributes, Object.fromEntries(root.attributes));
		}));
	});

	it('should read back any value set on an element', function() {
		fc.assert(fc.property(tree, xmlText, (root, value) => {
			let updated = libxslt.xpathUpdateSync(render(root), '/*', value);
			assert.strictEqual(libxslt.xpathSelectSync(updated, '/*', { first: true, fields: ['text'] }).text, value);
		}));
	});

	it('should read back any value set on an attribute', function() {
		fc.assert(fc.property(tree, xmlText, (root, value) => {
			let xml = render(Object.assign({}, root, { attributes: [['target', 'old']].concat(root.attributes.filter(([n]) => n !== 'target')) }));
			let updated = libxslt.xpathUpdateSync(xml, '/*/@target', value);
			assert.strictEqual(libxslt.xpathSelectSync(updated, '/*/@target', { first: true, fields: ['text'] }).text, value);
		}));
	});

	it('should give every matched element the value, including elements inside other matches', function() {
		fc.assert(fc.property(tree, xmlText, (root, value) => {
			let updated = libxslt.xpathUpdateSync(render(root), '//*', value);
			assert.strictEqual(libxslt.xpathSelectSync(updated, '/*', { first: true, fields: ['text'] }).text, value);
		}));
	});

	it('should leave a document unchanged when nothing matches, apart from serializing it', function() {
		fc.assert(fc.property(tree, xmlText, xmlText, (root, a, b) => {
			let once = libxslt.xpathUpdateSync(render(root), '/missing', a);
			assert.strictEqual(libxslt.xpathUpdateSync(render(root), '/missing', b), once);
			assert.strictEqual(libxslt.xpathUpdateSync(once, '/missing', a), once);
		}));
	});

	it('should serialize any element so that it parses back to the same content', function() {
		fc.assert(fc.property(tree, (root) => {
			let { xml } = libxslt.xpathSelectSync(render(root), '/*', { first: true, fields: ['xml'] });
			let reparsed = libxslt.xpathSelectSync(xml, '/*', { first: true, fields: ['text', 'attributes'] });
			assert.strictEqual(reparsed.text, textContent(root));
			assert.deepStrictEqual(reparsed.attributes, Object.fromEntries(root.attributes));
		}));
	});

	it('should give the same results for concurrent asynchronous calls as for synchronous ones', async function() {
		this.timeout(60000);
		let job = fc.record({ root: tree, value: xmlText, update: fc.boolean() });
		await fc.assert(fc.asyncProperty(fc.array(job, { minLength: 1, maxLength: 40 }), async (jobs) => {
			let run = (j, sync) => j.update ?
				(sync ? libxslt.xpathUpdateSync : libxslt.xpathUpdate)(render(j.root), '//*', j.value) :
				(sync ? libxslt.xpathSelectSync : libxslt.xpathSelect)(render(j.root), '//node()', { fields: ['type', 'name', 'text', 'xml'] });
			let actual = await Promise.all(jobs.map((j) => run(j, false)));
			assert.deepStrictEqual(actual, jobs.map((j) => run(j, true)));
		}), { numRuns: 25 });
	});

	it('should reject any non-string document, expression or value with a TypeError', function() {
		let nonString = fc.anything().filter((v) => typeof v !== 'string');
		let notAString = { name: 'TypeError', message: /must be a string/ };
		fc.assert(fc.property(nonString, (v) => {
			assert.throws(() => libxslt.xpathSelectSync(v, '/*'), notAString);
			assert.throws(() => libxslt.xpathSelectSync('<a/>', v), notAString);
			assert.throws(() => libxslt.xpathUpdateSync(v, '/*', 'x'), notAString);
			assert.throws(() => libxslt.xpathUpdateSync('<a/>', '/*', v), notAString);
		}));
	});
});
