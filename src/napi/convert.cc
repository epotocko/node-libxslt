#include "convert.h"

namespace nlx {

std::string RequireString(const Napi::Value& value, const char* name) {
    if (!value.IsString()) {
        throw Napi::TypeError::New(value.Env(), std::string(name) + " must be a string");
    }
    return value.As<Napi::String>().Utf8Value();
}

std::vector<std::string> ToStrings(const Napi::Value& value, const char* name) {
    if (!value.IsArray()) {
        throw Napi::TypeError::New(value.Env(), std::string(name) + " must be an array");
    }
    Napi::Array array = value.As<Napi::Array>();
    std::vector<std::string> strings;
    strings.reserve(array.Length());
    for (uint32_t i = 0; i < array.Length(); i++) {
        strings.push_back(array.Get(i).ToString().Utf8Value());
    }
    return strings;
}

Napi::Function RequireFunction(const Napi::Value& value, const char* name) {
    if (!value.IsFunction()) {
        throw Napi::TypeError::New(value.Env(), std::string(name) + " must be a function");
    }
    return value.As<Napi::Function>();
}

Napi::Error ToJsError(Napi::Env env, const Failure& failure) {
    Napi::Error error = Napi::Error::New(env, failure.what());
    Napi::Object object = error.Value();
    if (failure.xmlError()) {
        const XmlError& xml = *failure.xmlError();
        object.Set("domain", xml.domain);
        object.Set("code", xml.code);
        object.Set("level", xml.level);
        object.Set("line", xml.line);
        object.Set("column", xml.column);
        if (xml.file) object.Set("file", *xml.file);
        if (xml.str1) object.Set("str1", *xml.str1);
        if (xml.str2) object.Set("str2", *xml.str2);
        if (xml.str3) object.Set("str3", *xml.str3);
        if (xml.int1 != 0) object.Set("int1", xml.int1);
    }
    if (!failure.details().empty()) object.Set("details", failure.details());
    return error;
}

}  // namespace nlx
