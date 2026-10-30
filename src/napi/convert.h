// Conversions between JavaScript values and core types

#ifndef SRC_NAPI_CONVERT_H_
#define SRC_NAPI_CONVERT_H_

#include <string>
#include <vector>

#include <napi.h>

#include "../core/errors.h"

namespace nlx {

// Throws a TypeError "<name> must be a string" for any other type
std::string RequireString(const Napi::Value& value, const char* name);

// Converts every element of an array to a string, as String() does
std::vector<std::string> ToStrings(const Napi::Value& value, const char* name);

Napi::Function RequireFunction(const Napi::Value& value, const char* name);

// An Error with the properties libxmljs gave syntax errors (domain, code, level, line,
// column, file, str1-3, int1) when the failure is a libxml2 error, plus `details`
Napi::Error ToJsError(Napi::Env env, const Failure& failure);

}  // namespace nlx

#endif  // SRC_NAPI_CONVERT_H_
