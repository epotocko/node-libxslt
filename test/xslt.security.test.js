'use strict';
// Decision D3: stylesheets may read local files, but never use the network or write files
const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const libxslt = require('..');

const XSL_OPEN = '<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform"';
const XSL_CLOSE = '</xsl:stylesheet>';

function applyAsync(stylesheet, source) {
	return new Promise((resolve, reject) => {
		stylesheet.apply(source, (err, result) => err ? reject(err) : resolve(result));
	});
}

describe('XSLT security', function() {
	let server, baseUrl, requests;

	// A local HTTP server serving a valid stylesheet and document, counting every request
	before(async function() {
		server = http.createServer((req, res) => {
			requests++;
			res.setHeader('Content-Type', 'application/xml');
			res.end(req.url.endsWith('.xsl') ?
				`${XSL_OPEN}><xsl:template match="/">remote</xsl:template>${XSL_CLOSE}` :
				'<remote>secret</remote>');
		});
		await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
		baseUrl = `http://127.0.0.1:${server.address().port}`;
	});
	after(function() {
		server.close();
	});
	beforeEach(function() {
		requests = 0;
	});

	it('should refuse to include a stylesheet over the network', function() {
		let source = `${XSL_OPEN}><xsl:include href="${baseUrl}/remote.xsl"/>${XSL_CLOSE}`;
		assert.throws(() => libxslt.parse(source), (err) => {
			assert.match(err.message, /unable to load/);
			assert.match(err.details, /refused/);
			return true;
		});
		assert.strictEqual(requests, 0);
	});

	it('should refuse to read a document over the network', async function() {
		let stylesheet = libxslt.parse(
			`${XSL_OPEN}><xsl:template match="/"><xsl:copy-of select="document('${baseUrl}/remote.xml')"/></xsl:template>${XSL_CLOSE}`);
		await assert.rejects(applyAsync(stylesheet, '<root/>'), (err) => {
			assert.strictEqual(err.message, 'Failed to apply stylesheet');
			assert.match(err.details, /refused/);
			return true;
		});
		assert.strictEqual(requests, 0);
	});

	it('should refuse to write a file with exsl:document', async function() {
		let target = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'node-libxslt-')), 'written.xml');
		let stylesheet = libxslt.parse(
			`${XSL_OPEN} xmlns:exsl="http://exslt.org/common" extension-element-prefixes="exsl">` +
			`<xsl:template match="/"><exsl:document href="${target}"><written/></exsl:document></xsl:template>${XSL_CLOSE}`);
		await assert.rejects(applyAsync(stylesheet, '<root/>'), (err) => {
			assert.strictEqual(err.message, 'Failed to apply stylesheet');
			assert.match(err.details, /refused/);
			return true;
		});
		assert.strictEqual(fs.existsSync(target), false);
	});

	it('should still read local files with document()', async function() {
		let stylesheet = libxslt.parse(
			`${XSL_OPEN}><xsl:output method="text"/><xsl:template match="/">` +
			`<xsl:value-of select="count(document('test/resources/cd.xml')//cd)"/></xsl:template>${XSL_CLOSE}`);
		assert.match(await applyAsync(stylesheet, '<root/>'), /^\d+$/);
	});

	it('should not expand external entities in the source document', async function() {
		let secret = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'node-libxslt-')), 'secret.txt');
		fs.writeFileSync(secret, 'TOP-SECRET');
		let stylesheet = libxslt.parse(
			`${XSL_OPEN}><xsl:output method="text"/><xsl:template match="/"><xsl:value-of select="/r"/></xsl:template>${XSL_CLOSE}`);
		let source = `<!DOCTYPE r [<!ENTITY x SYSTEM "file://${secret}">]><r>&x;</r>`;
		let result = await applyAsync(stylesheet, source);
		assert.doesNotMatch(result, /TOP-SECRET/);
	});
});
