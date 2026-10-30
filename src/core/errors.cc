#include "errors.h"

#include <cstdarg>
#include <cstdio>
#include <utility>

#include <libxml/globals.h>
#include <libxslt/xsltutils.h>

namespace nlx {

namespace {

thread_local ErrorCapture* currentCapture = nullptr;

std::optional<std::string> OptionalString(const char* value) {
    if (value == nullptr) return std::nullopt;
    return std::string(value);
}

std::string FormatV(const char* format, va_list args) {
    va_list sizing;
    va_copy(sizing, args);
    int size = std::vsnprintf(nullptr, 0, format, sizing);
    va_end(sizing);
    if (size <= 0) return std::string();
    std::string text(static_cast<size_t>(size) + 1, '\0');
    std::vsnprintf(&text[0], text.size(), format, args);
    text.resize(static_cast<size_t>(size));
    return text;
}

}  // namespace

XmlError XmlError::From(const xmlError* error) {
    XmlError copy;
    copy.message = error->message != nullptr ? error->message : "";
    copy.domain = error->domain;
    copy.code = error->code;
    copy.level = error->level;
    copy.line = error->line;
    copy.column = error->int2;
    copy.int1 = error->int1;
    copy.file = OptionalString(error->file);
    copy.str1 = OptionalString(error->str1);
    copy.str2 = OptionalString(error->str2);
    copy.str3 = OptionalString(error->str3);
    return copy;
}

Failure::Failure(const std::string& message, std::string details, std::optional<XmlError> xmlError)
    : std::runtime_error(message), details_(std::move(details)), xmlError_(std::move(xmlError)) {}

ErrorCapture::ErrorCapture()
    : previous_(currentCapture),
      previousHandler_(xmlStructuredError),
      previousHandlerContext_(xmlStructuredErrorContext) {
    currentCapture = this;
    xmlSetStructuredErrorFunc(this, OnXmlError);
}

ErrorCapture::~ErrorCapture() {
    xmlSetStructuredErrorFunc(previousHandlerContext_, previousHandler_);
    currentCapture = previous_;
}

void ErrorCapture::OnXmlError(void* self, XmlErrorParam error) {
    ErrorCapture* capture = static_cast<ErrorCapture*>(self);
    capture->xmlErrors_.push_back(XmlError::From(error));
    capture->text_ += capture->xmlErrors_.back().message;
}

void OnXsltError(void* /* context */, const char* format, ...) {
    va_list args;
    va_start(args, format);
    std::string message = FormatV(format, args);
    va_end(args);

    ErrorCapture* capture = currentCapture;
    if (capture == nullptr) {
        std::fputs(message.c_str(), stderr);
        return;
    }
    capture->text_ += message;
    capture->lastXsltMessage_ = std::move(message);
}

void InstallErrorHandlers() {
    xsltSetGenericErrorFunc(nullptr, OnXsltError);
}

}  // namespace nlx
