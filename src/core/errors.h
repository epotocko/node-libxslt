// Error capture for libxml2 and libxslt, safe to use from any thread

#ifndef SRC_CORE_ERRORS_H_
#define SRC_CORE_ERRORS_H_

#include <optional>
#include <stdexcept>
#include <string>
#include <vector>

#include <libxml/xmlerror.h>
#include <libxml/xmlversion.h>

#ifndef LIBXML_THREAD_ENABLED
#error "libxml2 must be built with thread support"
#endif

namespace nlx {

// libxml2 2.12 made the error parameter of structured error callbacks const
#if LIBXML_VERSION >= 21200
using XmlErrorParam = const xmlError*;
#else
using XmlErrorParam = xmlError*;
#endif

// Copy of a libxml2 error. libxml2 reuses its error structs, so the strings are owned here.
struct XmlError {
    std::string message;
    int domain = 0;
    int code = 0;
    int level = 0;
    int line = 0;
    int column = 0;
    int int1 = 0;
    std::optional<std::string> file;
    std::optional<std::string> str1;
    std::optional<std::string> str2;
    std::optional<std::string> str3;

    static XmlError From(const xmlError* error);
};

// Thrown by core operations. `xmlError` is set when the failure is a libxml2 error,
// and `details` holds every libxml2 and libxslt message reported during the operation.
class Failure : public std::runtime_error {
  public:
    Failure(const std::string& message, std::string details,
            std::optional<XmlError> xmlError = std::nullopt);

    const std::string& details() const { return details_; }
    const std::optional<XmlError>& xmlError() const { return xmlError_; }

  private:
    std::string details_;
    std::optional<XmlError> xmlError_;
};

// Collects the libxml2 and libxslt errors raised on the current thread while it is alive.
// libxml2's structured error handler is per thread, so it is set and restored here.
// libxslt's generic error handler is a process-wide variable, so it is installed once
// (InstallErrorHandlers) and writes to the active capture of the thread that raised the error.
class ErrorCapture {
  public:
    ErrorCapture();
    ~ErrorCapture();
    ErrorCapture(const ErrorCapture&) = delete;
    ErrorCapture& operator=(const ErrorCapture&) = delete;

    const std::vector<XmlError>& xmlErrors() const { return xmlErrors_; }
    // Every message, in the order reported
    const std::string& text() const { return text_; }
    // The last libxslt message, which the 0.x releases reported as the error message
    const std::string& lastXsltMessage() const { return lastXsltMessage_; }

  private:
    static void OnXmlError(void* self, XmlErrorParam error);
    friend void OnXsltError(void* context, const char* format, ...);

    ErrorCapture* previous_;
    xmlStructuredErrorFunc previousHandler_;
    void* previousHandlerContext_;
    std::vector<XmlError> xmlErrors_;
    std::string text_;
    std::string lastXsltMessage_;
};

// Points libxslt's process-wide error handler at the calling thread's ErrorCapture.
// Messages raised outside any capture go to stderr, as libxslt's default handler does.
void InstallErrorHandlers();

}  // namespace nlx

#endif  // SRC_CORE_ERRORS_H_
