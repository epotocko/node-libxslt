'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const libxslt = require('..');
const { xpathSelect, xpathSelectSync, xpathUpdate, xpathUpdateSync } = libxslt;

const ALL_FIELDS = ['type', 'name', 'text', 'attributes', 'xml', 'childXml'];
const DOC = '<a code="200" xml:lang="en" lang="fr" xmlns:p="urn:p"><b>text</b><c/><d id="1">one <e>two</e> three</d>' +
	'<!-- note --><?target data?><f><![CDATA[<raw> & ]]></f></a>';

const select = (expression, options) => xpathSelectSync(DOC, expression, Object.assign({ fields: ALL_FIELDS }, options));
const DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>\n';

describe('xpathSelect', function() {
	describe('node descriptors', function() {
		it('should describe an element', function() {
			assert.deepStrictEqual(select('/a/d', { first: true }), {
				type: 'element',
				name: 'd',
				text: 'one two three',
				attributes: { id: '1' },
				xml: '<d id="1">one <e>two</e> three</d>',
				childXml: ['one ', '<e>two</e>', ' three']
			});
		});
		it('should describe an attribute by its local name and value', function() {
			let node = select('/a/@xml:lang', { first: true });
			assert.strictEqual(node.type, 'attribute');
			assert.strictEqual(node.name, 'lang');
			assert.strictEqual(node.text, 'en');
			assert.strictEqual(node.attributes, null);
		});
		it('should describe text, CDATA and comment nodes, which have no name', function() {
			assert.deepStrictEqual(select('/a/b/text()', { first: true, fields: ['type', 'name', 'text', 'attributes'] }),
				{ type: 'text', name: null, text: 'text', attributes: null });
			assert.deepStrictEqual(select('/a/f/text()', { first: true, fields: ['type', 'name', 'text'] }),
				{ type: 'cdata', name: null, text: '<raw> & ' });
			assert.deepStrictEqual(select('/a/comment()', { first: true, fields: ['type', 'name', 'text', 'xml'] }),
				{ type: 'comment', name: null, text: ' note ', xml: '<!-- note -->' });
		});
		it('should describe a processing instruction by its target and data', function() {
			assert.deepStrictEqual(select('/a/processing-instruction()', { first: true, fields: ['type', 'name', 'text'] }),
				{ type: 'pi', name: 'target', text: 'data' });
		});
		it('should describe the document node', function() {
			assert.deepStrictEqual(select('/', { first: true, fields: ['type', 'name', 'text'] }),
				{ type: 'document', name: null, text: 'textone two three<raw> & ' });
		});
		it('should return attributes named like Object.prototype members as own properties', function() {
			let { attributes } = xpathSelectSync('<r __proto__="x" constructor="y" toString="z"/>', '/r', { first: true, fields: ['attributes'] });
			assert.deepStrictEqual(Object.keys(attributes), ['__proto__', 'constructor', 'toString']);
			assert.strictEqual(Object.getOwnPropertyDescriptor(attributes, '__proto__').value, 'x');
			assert.strictEqual(Object.getPrototypeOf(attributes), Object.prototype);
		});
		it('should key attributes by local name, the later one winning, without namespace declarations', function() {
			assert.deepStrictEqual(select('/a', { first: true }).attributes, { code: '200', lang: 'fr' });
		});
	});

	describe('options', function() {
		it('should return type, name and text by default', function() {
			assert.deepStrictEqual(xpathSelectSync(DOC, '/a/b'), [{ type: 'element', name: 'b', text: 'text' }]);
		});
		it('should return only the requested fields', function() {
			assert.deepStrictEqual(xpathSelectSync(DOC, '/a/d/@id', { fields: ['text'] }), [{ text: '1' }]);
		});
		it('should reject unknown fields', function() {
			assert.throws(() => xpathSelectSync(DOC, '/a', { fields: ['text', 'parent'] }), { name: 'TypeError', message: /parent/ });
		});
		it('should return every match in document order, or an empty array', function() {
			assert.deepStrictEqual(xpathSelectSync(DOC, '//b | //c', { fields: ['name'] }), [{ name: 'b' }, { name: 'c' }]);
			assert.deepStrictEqual(xpathSelectSync(DOC, '/missing'), []);
		});
		it('should evaluate relative expressions with the root element as the context node', function() {
			assert.deepStrictEqual(xpathSelectSync(DOC, 'd/e', { fields: ['name'] }), [{ name: 'e' }]);
		});
		it('should return the first match, or null, with first', function() {
			assert.deepStrictEqual(xpathSelectSync(DOC, '/a/*', { first: true, fields: ['name'] }), { name: 'b' });
			assert.strictEqual(xpathSelectSync(DOC, '/missing', { first: true }), null);
		});
	});

	describe('serialization', function() {
		it('should serialize nodes as they appear, without namespace declarations from ancestors', function() {
			let soap = '<s:Envelope xmlns:s="urn:s" xmlns:o="urn:o">\n  <s:Body>\n    <o:Order id="1">x &amp; y</o:Order>\n  </s:Body>\n</s:Envelope>';
			assert.deepStrictEqual(xpathSelectSync(soap, '/*/*', { first: true, fields: ['childXml'] }),
				{ childXml: ['\n    ', '<o:Order id="1">x &amp; y</o:Order>', '\n  '] });
		});
	});

	describe('asynchronous form', function() {
		it('should resolve to the same result as the synchronous form', async function() {
			assert.deepStrictEqual(await xpathSelect(DOC, '//*', { fields: ALL_FIELDS }), xpathSelectSync(DOC, '//*', { fields: ALL_FIELDS }));
		});
		it('should reject with errors instead of throwing', async function() {
			await assert.rejects(xpathSelect(42, '/a'), { name: 'TypeError' });
			await assert.rejects(xpathSelect('<a', '/a'), /Couldn't find end of Start Tag|expected/);
		});
	});
});

describe('xpathUpdate', function() {
	it('should set element content literally, replacing its children', function() {
		assert.strictEqual(xpathUpdateSync('<a><b>old <i>x</i></b></a>', '/a/b', 'a & b &amp; <c/>'),
			DECLARATION + '<a><b>a &amp; b &amp;amp; &lt;c/&gt;</b></a>\n');
	});
	it('should set attribute values literally', function() {
		assert.strictEqual(xpathUpdateSync('<a href="old"/>', '/a/@href', 'https://x/?a=1&b="2"'),
			DECLARATION + '<a href="https://x/?a=1&amp;b=&quot;2&quot;"/>\n');
	});
	it('should set text, comment and processing instruction content', function() {
		assert.strictEqual(xpathUpdateSync('<a>t<!--c--><?p d?></a>', '/a/node()', 'v'),
			DECLARATION + '<a>v<!--v--><?p v?></a>\n');
	});
	it('should update elements together with nodes inside them', function() {
		// Regression: the nodes inside were freed and then read again when the XPath result was freed
		let xml = '<!DOCTYPE r [<!ENTITY e "x &amp; y">]><r><item>&e; a<!--c--><![CDATA[d]]><b/></item><item/></r>';
		let updated = xpathUpdateSync(xml, '//item | //comment() | //item/node()', 'v');
		assert.match(updated, /<r><item>v<\/item><item>v<\/item><\/r>/);
	});
	it('should skip nodes that have no value, such as the document node', function() {
		assert.strictEqual(xpathUpdateSync('<a>t</a>', '/', 'v'), DECLARATION + '<a>t</a>\n');
	});
	it('should keep the layout by default and indent element-only content with format', function() {
		let xml = '<a><b>x</b><c><d/></c></a>';
		assert.strictEqual(xpathUpdateSync(xml, '/a/b', 'y'), DECLARATION + '<a><b>y</b><c><d/></c></a>\n');
		assert.strictEqual(xpathUpdateSync(xml, '/a/b', 'y', { format: true }),
			DECLARATION + '<a>\n  <b>y</b>\n  <c>\n    <d/>\n  </c>\n</a>\n');
	});
	it('should resolve to the same result in the asynchronous form', async function() {
		assert.strictEqual(await xpathUpdate('<a><b/></a>', '//b', 'v'), xpathUpdateSync('<a><b/></a>', '//b', 'v'));
	});
});

describe('XPath errors', function() {
	for (let [name, fn] of [['xpathSelectSync', (xml, expr) => xpathSelectSync(xml, expr)], ['xpathUpdateSync', (xml, expr) => xpathUpdateSync(xml, expr, 'v')]]) {
		describe(name, function() {
			it('should throw a libxml2 syntax error with its location for invalid xml', function() {
				assert.throws(() => fn('<a>\n<b>', '/a'), (err) => {
					assert.match(err.message, /Premature end of data/);
					assert.strictEqual(err.line, 2);
					assert.strictEqual(err.domain, 1);
					return true;
				});
			});
			it('should throw for empty input', function() {
				assert.throws(() => fn('', '/a'), { message: 'Could not parse XML string' });
			});
			it('should throw a libxml2 XPath error for an invalid expression', function() {
				assert.throws(() => fn('<a/>', '///'), (err) => {
					assert.match(err.message, /Invalid expression/);
					assert.strictEqual(err.domain, 12);
					return true;
				});
			});
			it('should throw for a namespace prefix that is not registered', function() {
				assert.throws(() => fn('<p:a xmlns:p="urn:p"/>', '/p:a'), /Undefined namespace prefix/);
			});
			it('should throw when the expression does not select nodes', function() {
				for (let [expr, type] of [['count(//*)', 'number'], ['string(/a)', 'string'], ['boolean(/a)', 'boolean']]) {
					assert.throws(() => fn('<a/>', expr), { message: `The XPath expression must select nodes, but it returned a ${type}` });
				}
			});
		});
	}
});

describe('XML security', function() {
	it('should not expand external entities', function() {
		let secret = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'node-libxslt-')), 'secret.txt');
		fs.writeFileSync(secret, 'TOP-SECRET');
		let xml = `<!DOCTYPE r [<!ENTITY x SYSTEM "file://${secret}">]><r>&x;</r>`;
		assert.doesNotMatch(xpathSelectSync(xml, '/r', { first: true }).text, /TOP-SECRET/);
		assert.doesNotMatch(xpathUpdateSync(xml, '/missing', ''), /TOP-SECRET/);
	});
});
