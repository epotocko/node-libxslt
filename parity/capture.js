'use strict';
// Records how libxslt 0.10.2 transforms the parity corpus. Runs inside the image built from
// parity/legacy.Dockerfile, with the repository as the working directory (stylesheet includes
// resolve against it). See parity/capture.sh.
//   PARITY_PRIVATE_DIR  optional corpus with the same layout, kept outside the repository; its
//                       golden.json is written inside it
const fs = require('node:fs');
const path = require('node:path');

const libxslt = require('/legacy/xml_modules/libxslt');
const { transform } = require('./xslt');
const { loadXsltCorpus, readCaseFiles } = require('./xslt-corpus');
const { encode } = require('./encode');

const META = {
	node: process.version,
	libxslt: require('/legacy/xml_modules/libxslt/package.json').version,
	libxml2: libxslt.libxmljs.libxml_version
};

async function capture(root) {
	let cases = [];
	for (let c of loadXsltCorpus(root)) {
		let files = readCaseFiles(root, c);
		let outcome = encode(await transform(libxslt, { stylesheet: files.stylesheet, input: files.input, params: c.params }));
		let entry = { id: c.id, stylesheetFile: c.stylesheetFile, inputFile: c.inputFile, params: c.params, outcome };
		if (files.output !== undefined) {
			entry.providedOutputMatches = outcome.result === files.output;
		}
		cases.push(entry);
	}
	return cases;
}

function write(file, cases) {
	// One case per line, so changes to the golden files diff readably
	let lines = cases.map((c) => '\t' + JSON.stringify(c));
	fs.writeFileSync(file, `{\n"meta": ${JSON.stringify(META)},\n"cases": [\n${lines.join(',\n')}\n]}\n`);
	console.log(`${cases.length} cases -> ${file}`);
}

async function main() {
	fs.mkdirSync('parity/golden', { recursive: true });
	write('parity/golden/xslt.json', await capture('parity/corpus/xslt'));

	let privateDir = process.env.PARITY_PRIVATE_DIR;
	if (privateDir) {
		let cases = await capture(privateDir);
		write(path.join(privateDir, 'golden.json'), cases);
		let mismatched = cases.filter((c) => c.providedOutputMatches === false).map((c) => c.id);
		console.log(mismatched.length ?
			`Provided outputs that differ from libxslt 0.10.2: ${mismatched.join(', ')}` :
			'Every provided output matches libxslt 0.10.2');
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
