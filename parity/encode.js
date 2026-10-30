'use strict';
// Converts operation results to JSON that keeps what JSON alone would lose:
// undefined (as { $undefined: true }) and errors (as { $error: {...} }).

function encodeError(error) {
	let props = {};
	for (let key of Object.keys(error).sort()) {
		props[key] = encode(error[key]);
	}
	return {
		name: error.name,
		constructor: error.constructor ? error.constructor.name : undefined,
		message: error.message,
		string: String(error),
		props
	};
}

function encode(value) {
	if (value === undefined) return { $undefined: true };
	if (value instanceof Error) return { $error: encodeError(value) };
	if (Array.isArray(value)) return value.map(encode);
	if (value !== null && typeof value === 'object') {
		let result = {};
		for (let key of Object.keys(value)) result[key] = encode(value[key]);
		return result;
	}
	return value;
}

module.exports = { encode };
