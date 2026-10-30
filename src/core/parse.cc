#include "parse.h"

#include <climits>

namespace nlx {

DocPtr ParseXml(const std::string& xml, int options, const ErrorCapture& capture) {
    // libxml2 2.12 and later report empty input as "Document is empty"; 2.9 reports no error.
    // The same message on every version, as 0.x gave.
    if (xml.empty()) {
        throw Failure("Could not parse XML string", "");
    }
    if (xml.size() > static_cast<size_t>(INT_MAX)) {
        throw Failure("XML input is too large", "");
    }
    DocPtr doc(xmlReadMemory(xml.data(), static_cast<int>(xml.size()), nullptr, "UTF-8", options));
    if (!doc) {
        if (capture.xmlErrors().empty()) {
            throw Failure("Could not parse XML string", capture.text());
        }
        const XmlError& last = capture.xmlErrors().back();
        throw Failure(last.message, capture.text(), last);
    }
    if (xmlDocGetRootElement(doc.get()) == nullptr) {
        throw Failure("parsed document has no root element", capture.text());
    }
    return doc;
}

}  // namespace nlx
