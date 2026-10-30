// Selecting and updating nodes with XPath, entirely within one call

#ifndef SRC_CORE_XPATH_H_
#define SRC_CORE_XPATH_H_

#include <optional>
#include <string>
#include <utility>
#include <vector>

namespace nlx {

// Descriptor fields, as a bit mask; only requested fields are computed
enum Field : unsigned {
    kFieldType = 1,
    kFieldName = 2,
    kFieldText = 4,
    kFieldAttributes = 8,
    kFieldXml = 16,
    kFieldChildXml = 32,
};

// A plain copy of what was selected, so no libxml2 node outlives the call
struct NodeDescriptor {
    std::string type;
    std::optional<std::string> name;  // nullopt for nodes without a name
    std::string text;
    // In document order (a later duplicate local name wins); nullopt for non-elements
    std::optional<std::vector<std::pair<std::string, std::string>>> attributes;
    std::string xml;
    std::vector<std::string> childXml;
};

// Evaluates an XPath expression with the root element as the context node and no namespace
// prefixes registered. Returns at most one descriptor when first is set. Throws Failure for
// invalid XML, an invalid expression, or a result that is not a node-set.
std::vector<NodeDescriptor> XPathSelect(const std::string& xml, const std::string& expression,
                                        unsigned fields, bool first);

// Sets the value of every selected node, literally (no entity references are interpreted):
// elements get a single text child, attributes a new value, and text, CDATA, comment and
// processing instruction nodes new content. Other nodes are skipped. Returns the document
// serialized as UTF-8, indenting element-only content when format is set.
std::string XPathUpdate(const std::string& xml, const std::string& expression,
                        const std::string& value, bool format);

}  // namespace nlx

#endif  // SRC_CORE_XPATH_H_
