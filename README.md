# node-libxslt

Node.js bindings for [libxslt](https://gitlab.gnome.org/GNOME/libxslt), the XSLT 1.0 processor from the GNOME project, and a small XPath API on [libxml2](https://gitlab.gnome.org/GNOME/libxml2), built on [Node-API](https://nodejs.org/api/n-api.html).

- **libxslt behavior, exactly.** Use it when a transformation has to match what libxslt (and `xsltproc`) produce, including EXSLT extensions.
- **One binary for every Node.js version.** Node-API is ABI-stable, so a build works on all supported Node.js releases without rebuilding.
- **Runs off the main thread.** The callback forms parse and transform on the libuv threadpool, so large transforms don't block the event loop.
- **Uses the system libraries.** It links the operating system's libxml2 and libxslt, so security updates from your distribution apply without rebuilding this package.

It is a rewrite of [albanm/node-libxslt](https://github.com/albanm/node-libxslt) that keeps its XSLT API. See [Changes from 0.x](#changes-from-0x).

> Status: 1.0 pre-release.

## Requirements

- Node.js 22 or later
- Linux, with libxml2 2.9.14 or later and libxslt 1.1.35 or later. The Debian images `node:22`, `node:24` and `node:26` meet this. macOS is untested; Windows isn't supported.
- To build: `pkg-config`, a C++17 compiler, Python 3 and the development headers

| Image | Build | Run |
|---|---|---|
| `node:<version>` (Debian) | everything is preinstalled | everything is preinstalled |
| `node:<version>-slim` (Debian) | `apt-get install python3 make g++ pkg-config libxml2-dev libxslt1-dev` | `apt-get install libxml2 libxslt1.1` |

## Installation

The package isn't published to the npm registry. Install it from GitHub:

```sh
npm install epotocko/node-libxslt
```

The native addon builds during installation.

## Usage

```js
const libxslt = require('@epotocko/node-libxslt');

const stylesheet = libxslt.parse(xslString);
const result = stylesheet.apply(xmlString, { title: 'Report' });
```

`parse` and `apply` run synchronously when called without a callback, and asynchronously (on the libuv threadpool) when given one. `parseFile` and `applyToFile` always take a callback.

```js
libxslt.parse(xslString, (err, stylesheet) => {
	if (err) return handle(err);
	stylesheet.apply(xmlString, { title: 'Report' }, (err, result) => {
		if (err) return handle(err);
		console.log(result);
	});
});
```

### `libxslt.parse(source, [callback])`

Parses and compiles a stylesheet. `source` must be a string. CDATA sections in the stylesheet are merged into text. Relative `xsl:include` and `xsl:import` paths, and relative `document()` URIs, resolve against the process's working directory.

Returns a `Stylesheet`, or calls `callback(err, stylesheet)`.

### `libxslt.parseFile(path, callback)`

Reads a file as UTF-8 and parses it as `parse` does.

### `stylesheet.apply(source, [params], [options], [callback])`

Applies the stylesheet to an XML string and returns the serialized result as a string, or calls `callback(err, result)`.

- `params`: an object of stylesheet parameters (top-level `xsl:param`). String values are passed as XPath string literals, so any string arrives unchanged. Other values (such as numbers) are converted with `String()` and evaluated as XPath expressions.
- `options.noWrapParams`: when `true`, every parameter value is an XPath expression instead, for example `{ items: "/root/item[@id='123']" }`.
- `options.outputFormat`: only `'string'` (the default) is supported.

A compiled stylesheet is read-only, so it can be applied many times, including concurrently.

### `stylesheet.applyToFile(path, [params], [options], callback)`

Reads a file as UTF-8 and applies the stylesheet to it, as `apply` does.

### `libxslt.versions`

The versions of the libraries loaded at runtime, for example `{ libxml2: '2.9.14', libxslt: '1.1.35', libexslt: '0.8.20' }`.

## XPath

Select or update nodes in an XML string. Each call parses the string, does its work and frees everything, so results are plain objects and strings, and nothing needs to be released.

```js
const { xpathSelect, xpathUpdate } = require('@epotocko/node-libxslt');

const status = await xpathSelect(cxml, '//Response/Status', { first: true, fields: ['text', 'attributes'] });
// { text: 'Accepted', attributes: { code: '200', text: 'OK' } }

const updated = await xpathUpdate(xml, '//BrowserFormPost/URL', 'https://example.com/return?id=1&lang=en');
```

Expressions are XPath 1.0, evaluated with the root element as the context node. No namespace prefixes are registered, so match namespaced nodes with `local-name()`, for example `/*[local-name()='Envelope']/*[local-name()='Body']`.

### `xpathSelect(xml, expression, [options])` and `xpathSelectSync`

Resolves to an array of node descriptors in document order. `xpathSelectSync` returns the same result synchronously.

- `options.first`: resolve to the first node, or `null`, instead of an array.
- `options.fields`: the descriptor fields to compute; the default is `['type', 'name', 'text']`. Only requested fields are computed, which matters for `text`, `xml` and `childXml` on large elements.

| Field | Value |
|---|---|
| `type` | `'element'`, `'attribute'`, `'text'`, `'cdata'`, `'comment'`, `'pi'`, `'document'`, `'namespace'`, `'entity_ref'` or `'other'` |
| `name` | The local name (no prefix) of an element or attribute, the target of a processing instruction; `null` for other nodes |
| `text` | All descendant text of an element or the document; the value of an attribute; the content of other nodes |
| `attributes` | An element's attributes as `{ localName: value }`, without namespace declarations. If two attributes share a local name (`xml:lang` and `lang`), the later one wins. `null` for other nodes |
| `xml` | The node serialized as it appears in the document. Namespace declarations inherited from ancestors are not added |
| `childXml` | An array with each child of an element or the document serialized as `xml` is, including whitespace-only text; empty for other nodes |

### `xpathUpdate(xml, expression, value, [options])` and `xpathUpdateSync`

Sets the value of every selected node and resolves to the serialized document. `xpathUpdateSync` returns it synchronously.

- Values are literal text: `a & b` is written as `a &amp; b`, and `&amp;` as `&amp;amp;`.
- An element's children are replaced by the value. Attributes, text, CDATA, comment and processing instruction nodes get the value as their content. Other selected nodes (such as the document node) are skipped.
- When the selected nodes include an element and nodes inside it, the element's value wins.
- An expression that selects nothing returns the document unchanged (re-serialized).
- `options.format`: indent element-only content. The default keeps the document's layout.

The result is UTF-8 and starts with `<?xml version="1.0" encoding="UTF-8"?>`.

### XPath errors

Invalid XML is reported as for XSLT (see [Errors](#errors)). An invalid expression or an unregistered namespace prefix gives an `Error` with libxml2's XPath message (for example `Invalid expression`) and `domain` 12. An expression that doesn't select nodes, such as `count(//item)`, gives `The XPath expression must select nodes, but it returned a number`. The promise forms reject; the synchronous forms throw.

## Errors

- **Invalid XML** (stylesheet or source) throws, or passes to the callback, an `Error` whose message is libxml2's. It has the properties `domain`, `code`, `level`, `line`, `column`, and, when libxml2 provides them, `file`, `str1`, `str2`, `str3` and `int1`.
- **A stylesheet that fails to compile** gives an `Error` with libxslt's last message, for example `xsl:include : unable to load missing.xsl`.
- **A transform that fails** gives an `Error` with the message `Failed to apply stylesheet`.
- **Every error has a `details` property** with everything libxml2 and libxslt reported during the operation, for example `Variable 'name' has not been declared.`
- **Wrong argument types** throw a `TypeError` synchronously, including in the callback forms.

Messages from a successful transform, such as `xsl:message` output, are written to stderr.

## Security

Stylesheets and documents often come from outside the application, so the defaults are restrictive:

| Action | Allowed |
|---|---|
| Reading local files (`xsl:include`, `xsl:import`, `document()`) | Yes |
| Reading over the network | No |
| Writing files or creating directories (`exsl:document`) | No |
| Writing over the network | No |
| Expanding external entities in documents (XSLT and XPath) | No |
| Loading external DTDs | No |

A refused action fails the parse or the transform, and the error's `details` says what was refused. The policy can't be changed yet.

## Threading

The callback forms of `parse` and `apply`, and `xpathSelect` and `xpathUpdate`, run on the libuv threadpool, which Node.js also uses for file system, DNS, compression and crypto work. It has 4 threads by default. Applications that run many transforms at once can raise this with the `UV_THREADPOOL_SIZE` environment variable, set before Node.js starts.

The addon can be loaded in [worker threads](https://nodejs.org/api/worker_threads.html); each thread gets its own state.

## Changes from 0.x

This release replaces the libxmljs-based implementation of albanm/node-libxslt 0.x. Code that passes strings works unchanged, apart from the following. Code that used `require('libxslt').libxmljs` for XPath can use [`xpathSelect` and `xpathUpdate`](#xpath).

**Removed**

- libxmljs documents: `parse()` and `apply()` accept only strings, and `require('libxslt').libxmljs` no longer exists. Passing anything else throws a `TypeError`.
- `outputFormat: 'document'`. Results are always strings.

**Changed behavior**

- **String parameters containing a double quote** now arrive intact. In 0.x the transform returned an empty string without an error.
- **`<xsl:message terminate="yes">`** now fails the transform. 0.x returned the output produced up to that point.
- **Whitespace in included stylesheets** marked `xml:space="preserve"` is now kept, as the XSLT specification requires.
- **Network access, file writes and external entities** are blocked (see [Security](#security)).
- **Errors** have a new `details` property.
- **The callback forms** now also parse the XML off the main thread, so errors from invalid XML reach the callback asynchronously. 0.x called the callback synchronously for those errors.

**Unchanged, but worth knowing**

- Results are decoded as UTF-8. A stylesheet with `<xsl:output encoding="ISO-8859-1"/>` (or another non-UTF-8 encoding) produces bytes that aren't valid UTF-8, so non-ASCII characters become U+FFFD. Use UTF-8 output.

## Development

The tests build and run the addon in Docker against each supported Node.js version, on full and slim images:

```sh
npm run test:matrix                                      # Node 22, 24 and 26
NODE_VERSIONS=24 TARGETS=full npm run test:matrix        # one combination
npm run test:matrix -- npx mocha test/addon.test.js      # one test file
```

To build and test locally, install the build requirements above and run `npm install && npm test`.

`npm run parity:capture` records the behavior of libxslt 0.10.2 on Node.js 18 (in Docker) for the parity tests in `test/parity.xslt.test.js`. Its output isn't committed.

## License

MIT. Originally written by Alban Mouton, with contributions from Rui Azevedo.
