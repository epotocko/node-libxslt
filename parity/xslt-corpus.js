'use strict';
// Loads XSLT cases from a corpus directory laid out as:
//   <case>/transform.xsl (or transform.xml)   the stylesheet
//   <case>/<x>-input.xml                      one input per letter
//   <case>/<x>-output.xml                     optional: the output recorded elsewhere (production)
//   <case>/<x>-params.json or params.json     optional: stylesheet parameters
const fs = require('node:fs');
const path = require('node:path');

function readOptionalJson(file) {
	return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : undefined;
}

function loadXsltCorpus(root) {
	let cases = [];
	for (let name of fs.readdirSync(root).sort()) {
		let dir = path.join(root, name);
		if (!fs.statSync(dir).isDirectory()) continue;
		let files = fs.readdirSync(dir);
		let stylesheet = files.find((f) => f === 'transform.xsl') || files.find((f) => f === 'transform.xml');
		if (!stylesheet) continue;
		let sharedParams = readOptionalJson(path.join(dir, 'params.json'));
		for (let input of files.filter((f) => /^[a-z0-9]+-input\.xml$/.test(f)).sort()) {
			let key = input.replace(/-input\.xml$/, '');
			let output = `${key}-output.xml`;
			cases.push({
				id: `${name}/${key}`,
				stylesheetFile: path.join(name, stylesheet),
				inputFile: path.join(name, input),
				outputFile: files.includes(output) ? path.join(name, output) : undefined,
				params: readOptionalJson(path.join(dir, `${key}-params.json`)) || sharedParams || {}
			});
		}
	}
	return cases;
}

function readCaseFiles(root, c) {
	return {
		stylesheet: fs.readFileSync(path.join(root, c.stylesheetFile), 'utf8'),
		input: fs.readFileSync(path.join(root, c.inputFile), 'utf8'),
		output: c.outputFile ? fs.readFileSync(path.join(root, c.outputFile), 'utf8') : undefined
	};
}

module.exports = { loadXsltCorpus, readCaseFiles };
