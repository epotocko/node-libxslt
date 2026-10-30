// Parsing XML strings with options matching libxmljs parseXml()

#ifndef SRC_CORE_PARSE_H_
#define SRC_CORE_PARSE_H_

#include <memory>
#include <string>

#include <libxml/parser.h>

#include "errors.h"

namespace nlx {

struct DocDeleter {
    void operator()(xmlDoc* doc) const { xmlFreeDoc(doc); }
};
using DocPtr = std::unique_ptr<xmlDoc, DocDeleter>;

// libxmljs parseXml() sets no options by default: no entity substitution and no DTD loading.
// XML_PARSE_NONET is added as a security baseline; without DTD loading it changes nothing.
constexpr int kParseOptions = XML_PARSE_NONET;

// Parses a UTF-8 string with no base URL, so relative references resolve against the
// working directory. Throws Failure with the last libxml2 error, as libxmljs does.
DocPtr ParseXml(const std::string& xml, int options, const ErrorCapture& capture);

}  // namespace nlx

#endif  // SRC_CORE_PARSE_H_
