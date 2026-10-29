#include "xpath.h"

#include <memory>

#include <libxml/xmlsave.h>
#include <libxml/xpath.h>
#include <libxml/xpathInternals.h>

#include "errors.h"
#include "parse.h"

namespace nlx {

namespace {

struct XPathContextDeleter {
    void operator()(xmlXPathContext* context) const { xmlXPathFreeContext(context); }
};
struct XPathObjectDeleter {
    void operator()(xmlXPathObject* object) const { xmlXPathFreeObject(object); }
};
using XPathObjectPtr = std::unique_ptr<xmlXPathObject, XPathObjectDeleter>;

struct XmlCharDeleter {
    void operator()(xmlChar* text) const { xmlFree(text); }
};

std::string TakeString(xmlChar* text) {
    std::unique_ptr<xmlChar, XmlCharDeleter> owned(text);
    return text != nullptr ? std::string(reinterpret_cast<const char*>(text)) : std::string();
}

const char* ResultTypeName(xmlXPathObjectType type) {
    switch (type) {
        case XPATH_BOOLEAN: return "boolean";
        case XPATH_NUMBER: return "number";
        case XPATH_STRING: return "string";
        default: return "value";
    }
}

// Evaluates expression against doc and returns its node-set, which may be empty
XPathObjectPtr EvaluateNodeSet(xmlDoc* doc, const std::string& expression, const ErrorCapture& capture) {
    std::unique_ptr<xmlXPathContext, XPathContextDeleter> context(xmlXPathNewContext(doc));
    if (!context) throw Failure("Failed to create an XPath context", capture.text());
    context->node = xmlDocGetRootElement(doc);

    XPathObjectPtr result(xmlXPathEvalExpression(reinterpret_cast<const xmlChar*>(expression.c_str()), context.get()));
    if (!result) {
        if (capture.xmlErrors().empty()) throw Failure("Failed to evaluate the XPath expression", capture.text());
        const XmlError& last = capture.xmlErrors().back();
        throw Failure(last.message, capture.text(), last);
    }
    if (result->type != XPATH_NODESET) {
        throw Failure(std::string("The XPath expression must select nodes, but it returned a ") +
                      ResultTypeName(result->type), capture.text());
    }
    return result;
}

std::vector<xmlNode*> Nodes(const xmlXPathObject* result) {
    std::vector<xmlNode*> nodes;
    if (result->nodesetval != nullptr) {
        nodes.assign(result->nodesetval->nodeTab, result->nodesetval->nodeTab + result->nodesetval->nodeNr);
    }
    return nodes;
}

const char* TypeName(xmlElementType type) {
    switch (type) {
        case XML_ELEMENT_NODE: return "element";
        case XML_ATTRIBUTE_NODE: return "attribute";
        case XML_TEXT_NODE: return "text";
        case XML_CDATA_SECTION_NODE: return "cdata";
        case XML_COMMENT_NODE: return "comment";
        case XML_PI_NODE: return "pi";
        case XML_DOCUMENT_NODE:
        case XML_HTML_DOCUMENT_NODE: return "document";
        case XML_NAMESPACE_DECL: return "namespace";
        case XML_ENTITY_REF_NODE: return "entity_ref";
        default: return "other";
    }
}

std::string Serialize(xmlNode* node, int options) {
    std::unique_ptr<xmlBuffer, decltype(&xmlBufferFree)> buffer(xmlBufferCreate(), xmlBufferFree);
    xmlSaveCtxt* save = xmlSaveToBuffer(buffer.get(), "UTF-8", options);
    if (save == nullptr) throw Failure("Failed to serialize XML", "");
    xmlSaveTree(save, node);
    xmlSaveClose(save);
    return std::string(reinterpret_cast<const char*>(xmlBufferContent(buffer.get())),
                       static_cast<size_t>(xmlBufferLength(buffer.get())));
}

NodeDescriptor Describe(xmlNode* node, unsigned fields) {
    NodeDescriptor descriptor;
    // XPath returns copies of namespace nodes as xmlNs, which shares only the type field with xmlNode
    if (node->type == XML_NAMESPACE_DECL) {
        xmlNs* ns = reinterpret_cast<xmlNs*>(node);
        descriptor.type = "namespace";
        if (ns->prefix != nullptr) descriptor.name = reinterpret_cast<const char*>(ns->prefix);
        if (ns->href != nullptr) descriptor.text = reinterpret_cast<const char*>(ns->href);
        return descriptor;
    }
    if (fields & kFieldType) descriptor.type = TypeName(node->type);
    if (fields & kFieldName) {
        bool named = node->type == XML_ELEMENT_NODE || node->type == XML_ATTRIBUTE_NODE ||
                     node->type == XML_PI_NODE || node->type == XML_ENTITY_REF_NODE;
        if (named && node->name != nullptr) descriptor.name = reinterpret_cast<const char*>(node->name);
    }
    if (fields & kFieldText) descriptor.text = TakeString(xmlNodeGetContent(node));
    if ((fields & kFieldAttributes) && node->type == XML_ELEMENT_NODE) {
        descriptor.attributes.emplace();
        for (xmlAttr* attr = node->properties; attr != nullptr; attr = attr->next) {
            descriptor.attributes->emplace_back(reinterpret_cast<const char*>(attr->name),
                                                TakeString(xmlNodeGetContent(reinterpret_cast<xmlNode*>(attr))));
        }
    }
    if (fields & kFieldXml) descriptor.xml = Serialize(node, 0);
    if ((fields & kFieldChildXml) &&
        (node->type == XML_ELEMENT_NODE || node->type == XML_DOCUMENT_NODE || node->type == XML_HTML_DOCUMENT_NODE)) {
        for (xmlNode* child = node->children; child != nullptr; child = child->next) {
            descriptor.childXml.push_back(Serialize(child, 0));
        }
    }
    return descriptor;
}

void SetValue(xmlNode* node, const std::string& value) {
    const xmlChar* content = reinterpret_cast<const xmlChar*>(value.c_str());
    switch (node->type) {
        case XML_ELEMENT_NODE:
            // xmlNodeSetContent would interpret entity references; adding a text node is literal
            xmlNodeSetContent(node, nullptr);
            xmlNodeAddContentLen(node, content, static_cast<int>(value.size()));
            break;
        case XML_ATTRIBUTE_NODE: {
            xmlAttr* attr = reinterpret_cast<xmlAttr*>(node);
            xmlSetNsProp(attr->parent, attr->ns, attr->name, content);
            break;
        }
        case XML_TEXT_NODE:
        case XML_CDATA_SECTION_NODE:
        case XML_COMMENT_NODE:
        case XML_PI_NODE:
            // Literal for these node types
            xmlNodeSetContent(node, content);
            break;
        default:
            break;
    }
}

}  // namespace

std::vector<NodeDescriptor> XPathSelect(const std::string& xml, const std::string& expression,
                                        unsigned fields, bool first) {
    ErrorCapture capture;
    DocPtr doc = ParseXml(xml, kParseOptions, capture);
    XPathObjectPtr result = EvaluateNodeSet(doc.get(), expression, capture);
    std::vector<NodeDescriptor> descriptors;
    for (xmlNode* node : Nodes(result.get())) {
        descriptors.push_back(Describe(node, fields));
        if (first) break;
    }
    return descriptors;
}

std::string XPathUpdate(const std::string& xml, const std::string& expression,
                        const std::string& value, bool format) {
    ErrorCapture capture;
    DocPtr doc = ParseXml(xml, kParseOptions, capture);
    XPathObjectPtr result = EvaluateNodeSet(doc.get(), expression, capture);
    // Free the result before changing the tree: setting an element's value frees the nodes inside
    // it, and freeing a node-set reads the type of every node in it. Namespace nodes in a result
    // are copies that the node-set owns, and have no value to set, so they are left out.
    std::vector<xmlNode*> nodes;
    for (xmlNode* node : Nodes(result.get())) {
        if (node->type != XML_NAMESPACE_DECL) nodes.push_back(node);
    }
    result.reset();
    // Reverse document order: a node inside another matched element is set before that
    // element replaces its children, so no freed node is touched
    for (auto node = nodes.rbegin(); node != nodes.rend(); ++node) {
        SetValue(*node, value);
    }
    return Serialize(reinterpret_cast<xmlNode*>(doc.get()), format ? XML_SAVE_FORMAT : 0);
}

}  // namespace nlx
