'use strict';
// Parses and applies a stylesheet with the callback API, as 0.x and 1.x both support,
// returning the result or the stage that failed and its error
function transform(libxslt, { stylesheet, input, params }) {
	return new Promise((resolve) => {
		libxslt.parse(stylesheet, (err, parsed) => {
			if (err) return resolve({ stage: 'parse', error: err });
			parsed.apply(input, params || {}, (err, result) => {
				resolve(err ? { stage: 'apply', error: err } : { result });
			});
		});
	});
}

module.exports = { transform };
