/**
 * Node.js bindings for libxslt
 * @module libxslt
 */

var fs = require('fs');
var binding = require('node-gyp-build')(__dirname);

/**
 * Versions of the libxml2, libxslt and libexslt libraries loaded at runtime, as x.y.z strings.
 */
exports.versions = binding.versions;

/**
 * A compiled stylesheet. Do not call this constructor, instead use parse or parseFile.
 *
 * @constructor
 * @param {object} stylesheetObj - Native wrapper of a compiled libxslt stylesheet
 */
var Stylesheet = function(stylesheetObj){
	this.stylesheetObj = stylesheetObj;
};

/**
 * Parse a XSL stylesheet
 *
 * If no callback is given the function will run synchronously and return the result or throw an error.
 *
 * @param {string} source - The content of the stylesheet
 * @param {parseCallback} [callback] - The callback that handles the response. Expects err and Stylesheet object.
 * @return {Stylesheet} Only if no callback is given.
 * @throws {TypeError} If source is not a string (libxmljs documents are no longer accepted)
 */
exports.parse = function(source, callback) {
	if (typeof source !== 'string') {
		throw new TypeError('The stylesheet source must be a string; libxmljs documents are no longer supported');
	}

	if (callback) {
		binding.compileStylesheetAsync(source, function(err, stylesheet){
			if (err) return callback(err);
			callback(null, new Stylesheet(stylesheet));
		});
	} else {
		return new Stylesheet(binding.compileStylesheetSync(source));
	}
};
/**
 * Callback to the parse function
 * @callback parseCallback
 * @param {error} [err]
 * @param {Stylesheet} [stylesheet]
 */

/**
 * Parse a XSL stylesheet
 *
 * @param {stringPath} sourcePath - The path of the file
 * @param {parseFileCallback} callback - The callback that handles the response. Expects err and Stylesheet object.
 */
exports.parseFile = function(sourcePath, callback) {
	fs.readFile(sourcePath, 'utf8', function(err, data){
		if (err) return callback(err);
		exports.parse(data, callback);
	});
};
/**
 * Callback to the parseFile function
 * @callback parseFileCallback
 * @param {error} [err]
 * @param {Stylesheet} [stylesheet]
 */

/**
 * Options for applying a stylesheet
 * @typedef applyOptions
 * @property {String} outputFormat - Only 'string' is supported; document output was removed with libxmljs.
 * @property {boolean} noWrapParams - If true then the parameters are XPath expressions, otherwise they are treated as strings. Default is false.
 */

/**
 * Apply a stylesheet to a XML document
 *
 * If no callback is given the function will run synchronously and return the result or throw an error.
 *
 * @param {string} source - The XML content to apply the stylesheet to
 * @param {object} [params] - Parameters passed to the stylesheet ({@link http://www.w3schools.com/xsl/el_with-param.asp})
 * @param {applyOptions} [options] - Options
 * @param {applyCallback} [callback] - The callback that handles the response. Expects err and the result string.
 * @return {string} Only if no callback is given.
 * @throws {TypeError} If source is not a string or outputFormat is not 'string'
 */
Stylesheet.prototype.apply = function(source, params, options, callback) {
	// params and options parameters are optional
	if (typeof options === 'function') {
		callback = options;
		options = {};
	}
	if (typeof params === 'function') {
		callback = params;
		params = {};
		options = {};
	}
	params = params || {};
	options = options || {};

	if (!options.noWrapParams) {
		var wrappedParams = {};
	  for(var p in params) {
	    // string parameters must be surrounded by quotes to be usable by the stylesheet
	    if (typeof params[p] === 'string') wrappedParams[p] = '"' + params[p] + '"';
			else wrappedParams[p] = params[p];
	  }
		params = wrappedParams;
	}

	if (typeof source !== 'string') {
		throw new TypeError('The XML source must be a string; libxmljs documents are no longer supported');
	}
	if (options.outputFormat && options.outputFormat !== 'string') {
		throw new TypeError("outputFormat must be 'string'; document output is no longer supported");
	}

	// flatten the params object in an array
	var paramsArray = [];
	for(var key in params) {
		paramsArray.push(key);
		paramsArray.push(params[key]);
	}

	if (callback) {
		binding.applyStylesheetAsync(this.stylesheetObj, source, paramsArray, callback);
	} else {
		return binding.applyStylesheetSync(this.stylesheetObj, source, paramsArray);
	}
};

/**
 * Callback to the Stylesheet.apply function
 * @callback applyCallback
 * @param {error} [err] - Error either from parsing the XML document if given as a string or from applying the styleshet
 * @param {string} [result] Result of the transformation
 */

/**
 * Apply a stylesheet to a XML file
 *
 * @param {string} sourcePath - The path of the file to read
 * @param {object} [params] - Parameters passed to the stylesheet ({@link http://www.w3schools.com/xsl/el_with-param.asp})
 * @param {applyOptions} [options] - Options
 * @param {applyToFileCallback} callback The callback that handles the response. Expects err and result as string.
 */
Stylesheet.prototype.applyToFile = function(sourcePath, params, options, callback) {
	var that = this;
	fs.readFile(sourcePath, 'utf8', function(err, data){
		if (err) return callback(err);
		that.apply(data, params, options, callback);
	});
};
/**
 * Callback to the Stylesheet.applyToFile function
 * @callback applyToFileCallback
 * @param {error} [err] - Error either from reading the file, parsing the XML document or applying the styleshet
 * @param {string} [result]
 */
