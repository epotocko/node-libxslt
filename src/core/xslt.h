// Compiling and applying XSLT stylesheets

#ifndef SRC_CORE_XSLT_H_
#define SRC_CORE_XSLT_H_

#include <memory>
#include <string>
#include <vector>

#include <libxslt/xsltInternals.h>

namespace nlx {

struct StylesheetDeleter {
    void operator()(xsltStylesheet* stylesheet) const { xsltFreeStylesheet(stylesheet); }
};
using StylesheetPtr = std::unique_ptr<xsltStylesheet, StylesheetDeleter>;

// Process-wide setup: error handlers, EXSLT and the default security policy.
// Stylesheets may read local files but may not use the network or write files.
void InitXslt();

// Parses (merging CDATA into text, as libxslt 0.x did) and compiles a stylesheet.
// Throws Failure with the parse error, or with the last libxslt message.
StylesheetPtr CompileStylesheet(const std::string& source);

// Applies a compiled stylesheet to an XML string and serializes the result.
// params alternates names and XPath expressions. A compiled stylesheet is read-only
// here, so it can be applied on several threads at once.
std::string ApplyStylesheet(xsltStylesheet* stylesheet, const std::string& xml,
                            const std::vector<std::string>& params);

}  // namespace nlx

#endif  // SRC_CORE_XSLT_H_
