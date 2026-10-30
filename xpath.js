'use strict';
/**
 * Select and update nodes in XML strings with XPath. Every call parses its input, works on it
 * and frees it, so no libxml2 node outlives the call; results are plain objects and strings.
 * @module libxslt/xpath
 */

const binding = require('node-gyp-build')(__dirname);

// Bit values of the descriptor fields (nlx::Field in src/core/xpath.h)
const FIELDS = { type: 1, name: 2, text: 4, attributes: 8, xml: 16, childXml: 32 };
const DEFAULT_FIELDS = ['type', 'name', 'text'];

function requireString(value, name) {
	if (typeof value !== 'string') throw new TypeError(`${name} must be a string`);
}

function fieldMask(fields) {
	if (!Array.isArray(fields)) throw new TypeError('fields must be an array');
	let mask = 0;
	for (let field of fields) {
		if (!Object.prototype.hasOwnProperty.call(FIELDS, field)) {
			throw new TypeError(`Unknown field "${field}"; expected one of ${Object.keys(FIELDS).join(', ')}`);
		}
		mask |= FIELDS[field];
	}
	return mask;
}

function selectArgs(xml, expression, options) {
	requireString(xml, 'The XML');
	requireString(expression, 'The XPath expression');
	options = options || {};
	return [xml, expression, fieldMask(options.fields === undefined ? DEFAULT_FIELDS : options.fields), Boolean(options.first)];
}

function updateArgs(xml, expression, value, options) {
	requireString(xml, 'The XML');
	requireString(expression, 'The XPath expression');
	requireString(value, 'The value');
	options = options || {};
	return [xml, expression, value, Boolean(options.format)];
}

/**
 * A selected node, with the fields that were asked for
 * @typedef {object} NodeDescriptor
 * @property {string} type - 'element', 'attribute', 'text', 'cdata', 'comment', 'pi', 'document', 'namespace', 'entity_ref' or 'other'
 * @property {?string} name - Local name of an element or attribute, target of a processing instruction; null otherwise
 * @property {string} text - All descendant text of an element or document, the value of an attribute, the content of other nodes
 * @property {?Object<string, string>} attributes - An element's attributes by local name (a later duplicate wins); null for other nodes
 * @property {string} xml - The node serialized as it appears, without namespace declarations inherited from ancestors
 * @property {string[]} childXml - Each child of an element or document, serialized; empty for other nodes
 */

/**
 * Selects nodes with an XPath expression, on the libuv threadpool. The root element is the context node.
 * @param {string} xml
 * @param {string} expression - An XPath 1.0 expression selecting nodes
 * @param {object} [options]
 * @param {boolean} [options.first=false] - Resolve to the first node, or null, instead of an array
 * @param {string[]} [options.fields=['type','name','text']] - Descriptor fields to compute
 * @return {Promise<NodeDescriptor[]|?NodeDescriptor>}
 */
exports.xpathSelect = function(xml, expression, options) {
	return new Promise((resolve, reject) => {
		binding.xpathSelectAsync(...selectArgs(xml, expression, options), (err, result) => err ? reject(err) : resolve(result));
	});
};

/**
 * The synchronous form of xpathSelect
 * @return {NodeDescriptor[]|?NodeDescriptor}
 */
exports.xpathSelectSync = function(xml, expression, options) {
	return binding.xpathSelectSync(...selectArgs(xml, expression, options));
};

/**
 * Sets the value of every node an XPath expression selects, on the libuv threadpool, and
 * resolves to the serialized document. Values are literal text. Elements get the value as
 * their only child; attributes, text, CDATA, comment and processing instruction nodes get it as
 * their value; other nodes are skipped.
 * @param {string} xml
 * @param {string} expression - An XPath 1.0 expression selecting nodes
 * @param {string} value
 * @param {object} [options]
 * @param {boolean} [options.format=false] - Indent element-only content
 * @return {Promise<string>}
 */
exports.xpathUpdate = function(xml, expression, value, options) {
	return new Promise((resolve, reject) => {
		binding.xpathUpdateAsync(...updateArgs(xml, expression, value, options), (err, result) => err ? reject(err) : resolve(result));
	});
};

/**
 * The synchronous form of xpathUpdate
 * @return {string}
 */
exports.xpathUpdateSync = function(xml, expression, value, options) {
	return binding.xpathUpdateSync(...updateArgs(xml, expression, value, options));
};
