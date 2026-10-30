'use strict';
// fast-check generators for XML documents, with a model of what a parser sees in them
const fc = require('fast-check');

// Any character allowed in an XML document, weighted towards characters with special meaning
const xmlChar = fc.oneof(
	{ weight: 3, arbitrary: fc.constantFrom('&', '<', '>', "'", '"', ']', '\t', '\n', '\r', ' ') },
	{ weight: 3, arbitrary: fc.integer({ min: 0x20, max: 0x7e }).map((c) => String.fromCodePoint(c)) },
	{ weight: 1, arbitrary: fc.integer({ min: 0x80, max: 0xd7ff }).map((c) => String.fromCodePoint(c)) },
	{ weight: 1, arbitrary: fc.integer({ min: 0xe000, max: 0xfffd }).map((c) => String.fromCodePoint(c)) },
	{ weight: 1, arbitrary: fc.integer({ min: 0x10000, max: 0x10ffff }).map((c) => String.fromCodePoint(c)) }
);
const xmlText = fc.string({ unit: xmlChar, maxLength: 40 });
const xmlName = fc.stringMatching(/^[a-z][a-z0-9]{0,6}$/);
// Attribute names, including ones with special meaning to JavaScript objects. Not xmlns, which
// declares a namespace instead of an attribute.
const attributeName = fc.oneof(
	{ weight: 4, arbitrary: xmlName.filter((name) => name !== 'xmlns') },
	{ weight: 1, arbitrary: fc.constantFrom('__proto__', 'constructor', 'hasOwnProperty', 'toString') }
);

// An element tree as { name, attributes, children } with string children for text
const tree = fc.letrec((tie) => ({
	element: fc.record({
		name: xmlName,
		attributes: fc.uniqueArray(fc.tuple(attributeName, xmlText), { selector: ([name]) => name, maxLength: 3 }),
		children: fc.array(fc.oneof({ weight: 2, arbitrary: xmlText }, { weight: 1, arbitrary: tie('element') }), { maxLength: 4 })
	}, { noNullPrototype: true })
})).element;

const escapeText = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Character references keep tabs and line breaks, which attribute-value normalization would turn into spaces
const escapeAttribute = (value) => escapeText(value).replace(/"/g, '&quot;')
	.replace(/\t/g, '&#9;').replace(/\n/g, '&#10;').replace(/\r/g, '&#13;');

function render(node) {
	if (typeof node === 'string') return escapeText(node);
	let attributes = node.attributes.map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`).join('');
	return `<${node.name}${attributes}>${node.children.map(render).join('')}</${node.name}>`;
}

function countElements(node) {
	return typeof node === 'string' ? 0 : 1 + node.children.reduce((sum, child) => sum + countElements(child), 0);
}

// Element names in document order
function elementNames(node) {
	return typeof node === 'string' ? [] : [node.name].concat(...node.children.map(elementNames));
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

module.exports = { xmlChar, xmlText, xmlName, attributeName, tree, render, countElements, elementNames, textContent };
