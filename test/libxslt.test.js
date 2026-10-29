'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const fc = require('fast-check');

const libxslt = require('..');

const stylesheetSource = fs.readFileSync('./test/resources/cd.xsl', 'utf8');
const docSource = fs.readFileSync('./test/resources/cd.xml', 'utf8');
const stylesheetIncludeSource = fs.readFileSync('./test/resources/xslinclude.xsl', 'utf8');
const stylesheetBadIncludeSource = fs.readFileSync('./test/resources/xslbadinclude.xsl', 'utf8');
const doc2Source = fs.readFileSync('./test/resources/collection.xml', 'utf8');

// Callback API as promises, so a failed assertion fails the test instead of escaping the callback
function parseAsync(source) {
	return new Promise((resolve, reject) => {
		libxslt.parse(source, (err, stylesheet) => err ? reject(err) : resolve(stylesheet));
	});
}

function applyAsync(stylesheet, source, params, options) {
	return new Promise((resolve, reject) => {
		stylesheet.apply(source, params || {}, options || {}, (err, result) => err ? reject(err) : resolve(result));
	});
}

function parseFileAsync(path) {
	return new Promise((resolve, reject) => {
		libxslt.parseFile(path, (err, stylesheet) => err ? reject(err) : resolve(stylesheet));
	});
}

function applyToFileAsync(stylesheet, path) {
	return new Promise((resolve, reject) => {
		stylesheet.applyToFile(path, (err, result) => err ? reject(err) : resolve(result));
	});
}

// The TypeError for an argument of the wrong type, as opposed to any TypeError
const notAString = { name: 'TypeError', message: /must be a string/ };

// Any value that is not a string, including a Buffer of valid XML
const nonString = fc.oneof(
	fc.anything().filter((value) => typeof value !== 'string'),
	fc.constant(Buffer.from('<root/>'))
);

describe('node-libxslt', function() {
	describe('synchronous parse function', function() {
		it('should parse a stylesheet from a xml string', function() {
			let stylesheet = libxslt.parse(stylesheetSource);
			assert.strictEqual(typeof stylesheet, 'object');
		});
		it('should parse a stylesheet with a include from a xml string', function() {
			let stylesheet = libxslt.parse(stylesheetIncludeSource);
			assert.strictEqual(typeof stylesheet, 'object');
		});
		it('should throw an error when parsing invalid stylesheet', function() {
			assert.throws(() => libxslt.parse('this is not a stylesheet!'), /Start tag expected/);
		});
		it('should throw an error when parsing stylesheet with invalid include', function() {
			assert.throws(() => libxslt.parse(stylesheetBadIncludeSource), /unable to load/);
		});
	});

	describe('parseFile function', function() {
		it('should parse a stylesheet from a file', async function() {
			let stylesheet = await parseFileAsync('./test/resources/cd.xsl');
			assert.strictEqual(typeof stylesheet, 'object');
		});
	});

	describe('asynchronous parse function', function() {
		it('should parse a stylesheet from a xml string', async function() {
			let stylesheet = await parseAsync(stylesheetSource);
			assert.strictEqual(typeof stylesheet, 'object');
		});
		it('should parse a stylesheet with a include from a xml string', async function() {
			let stylesheet = await parseAsync(stylesheetIncludeSource);
			assert.strictEqual(typeof stylesheet, 'object');
		});
		it('should return an error when parsing invalid stylesheet', async function() {
			await assert.rejects(parseAsync('this is not a stylesheet!'), /Start tag expected/);
		});
		it('should return an error when parsing stylesheet with invalid include', async function() {
			await assert.rejects(parseAsync(stylesheetBadIncludeSource), /unable to load/);
		});
	});

	describe('synchronous apply function', function() {
		it('should apply a stylesheet to a xml string', function() {
			let stylesheet = libxslt.parse(stylesheetSource);
			let result = stylesheet.apply(docSource);
			assert.strictEqual(typeof result, 'string');
			assert.match(result, /<td>Bob Dylan<\/td>/);
		});
		it('should apply a stylesheet to a xml string with output forced to string', function() {
			let stylesheet = libxslt.parse(stylesheetSource);
			let result = stylesheet.apply(docSource, {}, { outputFormat: 'string' });
			assert.strictEqual(typeof result, 'string');
			assert.match(result, /<td>Bob Dylan<\/td>/);
		});
		it('should apply a stylesheet with a parameter', function() {
			let stylesheet = libxslt.parse(stylesheetSource);
			let result = stylesheet.apply(docSource, { MyParam: 'MyParamValue' });
			assert.strictEqual(typeof result, 'string');
			assert.match(result, /<p>My param: MyParamValue<\/p>/);
		});
		it('should apply a stylesheet with the same parameter multiple times', function() {
			let stylesheet = libxslt.parse(stylesheetSource);
			let params = { MyParam: 'MyParamValue' };
			let result = stylesheet.apply(docSource, params);
			assert.match(result, /<p>My param: MyParamValue<\/p>/);
			result = stylesheet.apply(docSource, params);
			assert.match(result, /<p>My param: MyParamValue<\/p>/);
		});
		it('should throw an error if it fails to apply stylesheet', function() {
			let stylesheet = libxslt.parse(fs.readFileSync('./test/resources/xslbadparam.xsl', 'utf8'));
			assert.throws(() => stylesheet.apply('<data></data>'), (err) => {
				assert.strictEqual(err.message, 'Failed to apply stylesheet');
				assert.match(err.details, /MyOtherParam/);
				return true;
			});
		});
		it('should throw a libxml2 syntax error with its location for invalid xml', function() {
			let stylesheet = libxslt.parse(stylesheetSource);
			assert.throws(() => stylesheet.apply('<catalog>\n<cd>'), (err) => {
				assert.match(err.message, /Premature end of data/);
				assert.strictEqual(err.line, 2);
				assert.strictEqual(typeof err.column, 'number');
				assert.strictEqual(err.domain, 1);
				assert.strictEqual(typeof err.code, 'number');
				assert.strictEqual(typeof err.level, 'number');
				return true;
			});
		});
	});

	describe('asynchronous apply function', function() {
		it('should apply a stylesheet to a xml string', async function() {
			let stylesheet = libxslt.parse(stylesheetSource);
			let result = await applyAsync(stylesheet, docSource);
			assert.strictEqual(typeof result, 'string');
			assert.match(result, /<td>Bob Dylan<\/td>/);
		});
		it('should apply a stylesheet to a xml string with output forced to string', async function() {
			let stylesheet = libxslt.parse(stylesheetSource);
			let result = await applyAsync(stylesheet, docSource, {}, { outputFormat: 'string' });
			assert.strictEqual(typeof result, 'string');
			assert.match(result, /<td>Bob Dylan<\/td>/);
		});
		it('should apply a stylesheet with a include to a xml string', async function() {
			let stylesheet = libxslt.parse(stylesheetIncludeSource);
			let result = await applyAsync(stylesheet, doc2Source);
			assert.strictEqual(typeof result, 'string');
			assert.match(result, /Title - Lover Birds/);
		});
		it('should return an error if it fails to apply stylesheet', async function() {
			let stylesheet = libxslt.parse(fs.readFileSync('./test/resources/xslbadparam.xsl', 'utf8'));
			await assert.rejects(applyAsync(stylesheet, '<data></data>'), {
				message: 'Failed to apply stylesheet',
				details: /MyOtherParam/
			});
		});
		it('should run the transform without blocking the event loop', async function() {
			let items = '<item>x</item>'.repeat(200000);
			let stylesheet = libxslt.parse(
				'<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">' +
				'<xsl:template match="/"><xsl:copy-of select="."/></xsl:template></xsl:stylesheet>');
			let ranDuringTransform = false;
			setImmediate(() => { ranDuringTransform = true; });
			let observed = await new Promise((resolve, reject) => {
				stylesheet.apply(`<root>${items}</root>`, (err) => err ? reject(err) : resolve(ranDuringTransform));
			});
			assert.strictEqual(observed, true);
		});
	});

	describe('applyToFile function', function() {
		it('should apply a stylesheet to a xml file', async function() {
			let stylesheet = libxslt.parse(stylesheetSource);
			let result = await applyToFileAsync(stylesheet, './test/resources/cd.xml');
			assert.strictEqual(typeof result, 'string');
			assert.match(result, /<td>Bob Dylan<\/td>/);
		});
	});

	describe('disable-output-escaping attribute', function() {
		it('should be interpreted by a stylesheet', function() {
			let stylesheet = libxslt.parse(fs.readFileSync('test/resources/disable-output-escaping.xsl', 'utf8'));
			let result = stylesheet.apply('<root/>');
			assert.match(result, /<foo\/>/);
			assert.match(result, /&lt;bar\/&gt;/);
		});
	});

	describe('omit-xml-declaration directive', function() {
		it('should be respected by a stylesheet with output method text', function() {
			let data = '<root><!-- comment on xml data --></root>';
			let stylesheet = libxslt.parse(fs.readFileSync('test/resources/omit-xml-declaration-text-out.xsl', 'utf8'));
			let result = stylesheet.apply(data);
			assert.strictEqual(typeof result, 'string');
			assert.doesNotMatch(result, /\?xml/);
			assert.match(result, /<foo\/>/);
			assert.match(result, /<bar\/>/);
			assert.doesNotMatch(result, /<!-- comment/);
			assert.doesNotMatch(result, /<node/);
			assert.match(result, /with text/);
		});
		it('should be respected by a stylesheet with output method xml', function() {
			let data = '<root><!-- comment on xml data --></root>';
			let stylesheet = libxslt.parse(fs.readFileSync('test/resources/omit-xml-declaration-xml-out.xsl', 'utf8'));
			let result = stylesheet.apply(data);
			assert.strictEqual(typeof result, 'string');
			assert.doesNotMatch(result, /\?xml/);
			assert.match(result, /<foo\/>/);
			assert.match(result, /&lt;bar\/&gt;/);
			assert.doesNotMatch(result, /<!-- comment/);
			assert.match(result, /<node/);
			assert.match(result, /with text/);
		});
	});

	describe('implicitly omitted xml-declaration', function() {
		it('should be respected by a stylesheet with output method html', function() {
			let data = '<root><strong></strong><!-- comment on xml data --></root>';
			let stylesheet = libxslt.parse(fs.readFileSync('test/resources/implicit-omit-xml-declaration-html-out.xsl', 'utf8'));
			let result = stylesheet.apply(data);
			assert.strictEqual(typeof result, 'string');
			assert.doesNotMatch(result, /\?xml/);
			assert.match(result, /<foo\/>/);
			assert.match(result, /<strong><\/strong>/);
			assert.match(result, /&lt;bar\/&gt;/);
			assert.doesNotMatch(result, /<!-- comment/);
			assert.match(result, /<node/);
			assert.match(result, /with text/);
		});
		it('should be respected by a stylesheet with output method text', function() {
			let data = '<root><strong>some text </strong><!-- comment on xml data --></root>';
			let stylesheet = libxslt.parse(fs.readFileSync('test/resources/implicit-omit-xml-declaration-text-out.xsl', 'utf8'));
			let result = stylesheet.apply(data);
			assert.strictEqual(typeof result, 'string');
			assert.doesNotMatch(result, /\?xml/);
			assert.match(result, /<foo\/>/);
			assert.match(result, /<bar\/>/);
			assert.doesNotMatch(result, /<!-- comment/);
			assert.doesNotMatch(result, /<node/);
			assert.doesNotMatch(result, /<strong/);
			assert.match(result, /some text with text/);
		});
	});

	describe('handle quotes in strings', function() {
		it('should avoid conflict with xpath single quote by using double-quotes', function() {
			let stylesheet = libxslt.parse(fs.readFileSync('test/resources/handle-quotes-in-string-params.xsl', 'utf8'));
			let result = stylesheet.apply('<root/>', { strParam: "/root/item[@id='123']" });
			assert.match(result, /strParam:\/root\/item\[@id='123'\]/);
		});
	});

	describe('no params wrap', function() {
		it('should bypass parameter string wrap and deliver xpath expressions for nodesets', function() {
			let data = '<root><item id="123">Ok 123</item><item id="321"/><other/></root>';
			let stylesheet = libxslt.parse(fs.readFileSync('test/resources/use-xpath-params.xsl', 'utf8'));
			let result = stylesheet.apply(data, { at: "/root/item[@id='123']", testName: "'testing xpath selectors'" }, { noWrapParams: true });
			assert.match(result, /testing xpath selectors/);
			assert.match(result, /#selected nodes:1/);
			assert.match(result, /Node \[item id:123\] was selected./);
		});
	});

	describe('libexslt bindings', function() {
		it('should expose EXSLT functions', async function() {
			let stylesheet = await parseFileAsync('test/resources/min-value.xsl');
			let result = await applyToFileAsync(stylesheet, 'test/resources/values.xml');
			assert.match(result, /Minimum: 4/);
		});
	});

	// Decision D1: libxmljs documents are no longer accepted or produced
	describe('string-only inputs and outputs', function() {
		it('should not expose a libxmljs module', function() {
			assert.strictEqual(libxslt.libxmljs, undefined);
		});
		it('should throw a TypeError when parsing any non-string stylesheet', function() {
			fc.assert(fc.property(nonString, (source) => {
				assert.throws(() => libxslt.parse(source), notAString);
			}));
		});
		it('should throw a TypeError when parsing any non-string stylesheet with a callback', function() {
			fc.assert(fc.property(nonString, (source) => {
				assert.throws(() => libxslt.parse(source, () => {}), notAString);
			}));
		});
		it('should throw a TypeError when applying to any non-string source', function() {
			let stylesheet = libxslt.parse(stylesheetSource);
			fc.assert(fc.property(nonString, (source) => {
				assert.throws(() => stylesheet.apply(source), notAString);
				assert.throws(() => stylesheet.apply(source, {}, {}, () => {}), notAString);
			}));
		});
		it('should throw a TypeError when document output is requested', function() {
			let stylesheet = libxslt.parse(stylesheetSource);
			assert.throws(() => stylesheet.apply(docSource, {}, { outputFormat: 'document' }), { name: 'TypeError', message: /outputFormat/ });
			assert.throws(() => stylesheet.apply(docSource, {}, { outputFormat: 'document' }, () => {}), { name: 'TypeError', message: /outputFormat/ });
		});
	});
});
