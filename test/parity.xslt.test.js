'use strict';
// Compares XSLT results with libxslt 0.10.2 on Node 18, recorded by npm run parity:capture.
//   PARITY_PRIVATE_DIR  also checks a private corpus (with its golden.json) kept outside the repository
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const libxslt = require('..');
const { transform } = require('../parity/xslt');
const { readCaseFiles } = require('../parity/xslt-corpus');
const { encode } = require('../parity/encode');

// libxml2 error properties libxmljs set on parse errors; `details` is new and not compared
const XML_ERROR_PROPS = ['code', 'column', 'domain', 'file', 'int1', 'level', 'line', 'str1', 'str2', 'str3'];

// The parts of an outcome the new package must reproduce
function comparable(outcome) {
	if (outcome.result !== undefined) return { result: outcome.result };
	let error = outcome.error.$error;
	let props = {};
	for (let key of XML_ERROR_PROPS) {
		if (key in error.props) props[key] = error.props[key];
	}
	return { stage: outcome.stage, message: error.message, props };
}

// Accepted differences from the production stack. Each case asserts the new behavior instead,
// so a further change still fails. Listed in docs/implementation-plan.md (Phase 1 findings).
const APPLY_FAILED = { stage: 'apply', message: 'Failed to apply stylesheet', props: {} };
const KNOWN_DIFFERENCES = {
	// libxslt 1.1.35 keeps whitespace-only text in an included stylesheet with xml:space="preserve",
	// as the XSLT spec requires; the bundled 1.1.28 dropped it (without xsl:include both agree)
	'public include/a': { result: '<?xml version="1.0"?>\n\n   Title - Lover Birds<BR/>\n\n   Title - The Sundered Grail<BR/>\n\n   Title - Splish Splash<BR/>\n\n' },
	// libxslt 1.1.35 fails the transform when <xsl:message terminate="yes"> runs; 1.1.28 returned the partial output
	'public xsl-message/b': APPLY_FAILED,
	// Decision D7: string parameters containing a double quote now arrive intact;
	// 0.x returned an empty string without an error
	'public params/d': { result: 'p=[say "hi"] n=[default] len=8' },
	'public params/e': { result: 'p=[both \' and "] n=[default] len=12' }
};

function corpora() {
	let list = [{ name: 'public', root: path.join(__dirname, '..', 'parity', 'corpus', 'xslt'), golden: path.join(__dirname, '..', 'parity', 'golden', 'xslt.json') }];
	let privateDir = process.env.PARITY_PRIVATE_DIR;
	if (privateDir) list.push({ name: 'private', root: privateDir, golden: path.join(privateDir, 'golden.json') });
	return list;
}

describe('XSLT parity with libxslt 0.10.2 on Node 18', function() {
	for (let corpus of corpora()) {
		// The golden files are generated, not committed; without them the public corpus is pending.
		// A private corpus was asked for explicitly, so a missing golden.json fails instead.
		if (corpus.name === 'public' && !fs.existsSync(corpus.golden)) {
			it(`${corpus.name} corpus (no golden files; run npm run parity:capture)`);
			continue;
		}
		describe(`${corpus.name} corpus`, function() {
			let golden = JSON.parse(fs.readFileSync(corpus.golden, 'utf8'));
			for (let c of golden.cases) {
				let known = KNOWN_DIFFERENCES[`${corpus.name} ${c.id}`];
				it(known ? `${c.id} (known difference)` : c.id, async function() {
					let files = readCaseFiles(corpus.root, c);
					let actual = encode(await transform(libxslt, { stylesheet: files.stylesheet, input: files.input, params: c.params }));
					assert.deepStrictEqual(comparable(actual), known || comparable(c.outcome));
				});
			}
		});
	}
});
