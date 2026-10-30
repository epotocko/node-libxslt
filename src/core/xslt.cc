#include "xslt.h"

#include <cstdio>

#include <libxml/xmlmemory.h>
#include <libxslt/documents.h>
#include <libxslt/security.h>
#include <libxslt/transform.h>
#include <libxslt/xsltutils.h>
#include <libexslt/exslt.h>

#include "errors.h"
#include "parse.h"

namespace nlx {

namespace {

void InstallSecurityPolicy() {
    xsltSecurityPrefsPtr prefs = xsltNewSecurityPrefs();
    xsltSetSecurityPrefs(prefs, XSLT_SECPREF_READ_NETWORK, xsltSecurityForbid);
    xsltSetSecurityPrefs(prefs, XSLT_SECPREF_WRITE_NETWORK, xsltSecurityForbid);
    xsltSetSecurityPrefs(prefs, XSLT_SECPREF_WRITE_FILE, xsltSecurityForbid);
    xsltSetSecurityPrefs(prefs, XSLT_SECPREF_CREATE_DIRECTORY, xsltSecurityForbid);
    // Applies to xsl:include/xsl:import at compile time and is copied into every transform context
    xsltSetDefaultSecurityPrefs(prefs);
}

// libxslt's own loader, which LoadDocument delegates to
xsltDocLoaderFunc defaultLoader = nullptr;

// Loads xsl:include and xsl:import stylesheets and document() resources. libxslt parses these with
// its own options (XSLT_PARSE_OPTIONS), which substitute entities and load DTDs; the security
// policy checks only the resource itself, not what the parser then loads from inside it. Parse
// them like every other document instead: no external entities, DTDs, XInclude or network.
xmlDocPtr LoadDocument(const xmlChar* uri, xmlDictPtr dict, int options, void* context, xsltLoadType type) {
    options &= ~(XML_PARSE_NOENT | XML_PARSE_DTDLOAD | XML_PARSE_DTDATTR | XML_PARSE_DTDVALID | XML_PARSE_XINCLUDE);
    return defaultLoader(uri, dict, options | kParseOptions, context, type);
}

}  // namespace

void InitXslt() {
    InstallErrorHandlers();
    exsltRegisterAll();
    InstallSecurityPolicy();
    defaultLoader = xsltDocDefaultLoader;
    xsltSetLoaderFunc(LoadDocument);
}

StylesheetPtr CompileStylesheet(const std::string& source) {
    ErrorCapture capture;
    DocPtr doc = ParseXml(source, kParseOptions | XML_PARSE_NOCDATA, capture);
    StylesheetPtr stylesheet(xsltParseStylesheetDoc(doc.get()));
    if (!stylesheet) {
        // On failure the document still belongs to the caller
        const std::string& message = capture.lastXsltMessage();
        throw Failure(message.empty() ? "Failed to parse stylesheet" : message, capture.text());
    }
    // On success the stylesheet owns the document
    doc.release();
    return stylesheet;
}

std::string ApplyStylesheet(xsltStylesheet* stylesheet, const std::string& xml,
                            const std::vector<std::string>& params) {
    ErrorCapture capture;
    DocPtr doc = ParseXml(xml, kParseOptions, capture);

    std::vector<const char*> paramPointers;
    paramPointers.reserve(params.size() + 1);
    for (const std::string& param : params) paramPointers.push_back(param.c_str());
    paramPointers.push_back(nullptr);

    DocPtr result(xsltApplyStylesheet(stylesheet, doc.get(), paramPointers.data()));
    if (!result) {
        throw Failure("Failed to apply stylesheet", capture.text());
    }

    xmlChar* buffer = nullptr;
    int length = 0;
    if (xsltSaveResultToString(&buffer, &length, result.get(), stylesheet) != 0) {
        if (buffer != nullptr) xmlFree(buffer);
        throw Failure("Failed to save XSLT result to string", capture.text());
    }
    std::string output;
    if (buffer != nullptr) {
        output.assign(reinterpret_cast<const char*>(buffer), static_cast<size_t>(length));
        xmlFree(buffer);
    }

    // Messages from a successful transform (such as xsl:message) went to stderr in 0.x
    if (!capture.text().empty()) std::fputs(capture.text().c_str(), stderr);
    return output;
}

}  // namespace nlx
