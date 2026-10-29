#include "xpath.h"

#include <optional>
#include <string>
#include <utility>
#include <vector>

#include "../core/xpath.h"
#include "convert.h"

namespace nlx {

namespace {

Napi::Object ToJsDescriptor(Napi::Env env, const NodeDescriptor& descriptor, unsigned fields) {
    Napi::Object object = Napi::Object::New(env);
    if (fields & kFieldType) object.Set("type", descriptor.type);
    if (fields & kFieldName) {
        object.Set("name", descriptor.name ? Napi::Value(Napi::String::New(env, *descriptor.name)) : env.Null());
    }
    if (fields & kFieldText) object.Set("text", descriptor.text);
    if (fields & kFieldAttributes) {
        if (descriptor.attributes) {
            Napi::Object attributes = Napi::Object::New(env);
            for (const auto& attribute : *descriptor.attributes) attributes.Set(attribute.first, attribute.second);
            object.Set("attributes", attributes);
        } else {
            object.Set("attributes", env.Null());
        }
    }
    if (fields & kFieldXml) object.Set("xml", descriptor.xml);
    if (fields & kFieldChildXml) {
        Napi::Array children = Napi::Array::New(env, descriptor.childXml.size());
        for (uint32_t i = 0; i < descriptor.childXml.size(); i++) children.Set(i, descriptor.childXml[i]);
        object.Set("childXml", children);
    }
    return object;
}

Napi::Value ToJsResult(Napi::Env env, const std::vector<NodeDescriptor>& descriptors, unsigned fields, bool first) {
    if (first) {
        return descriptors.empty() ? env.Null() : Napi::Value(ToJsDescriptor(env, descriptors[0], fields));
    }
    Napi::Array array = Napi::Array::New(env, descriptors.size());
    for (uint32_t i = 0; i < descriptors.size(); i++) array.Set(i, ToJsDescriptor(env, descriptors[i], fields));
    return array;
}

struct SelectArgs {
    std::string xml;
    std::string expression;
    unsigned fields;
    bool first;
};

SelectArgs ReadSelectArgs(const Napi::CallbackInfo& info) {
    return {
        RequireString(info[0], "The XML"),
        RequireString(info[1], "The XPath expression"),
        info[2].ToNumber().Uint32Value(),
        info[3].ToBoolean().Value()
    };
}

struct UpdateArgs {
    std::string xml;
    std::string expression;
    std::string value;
    bool format;
};

UpdateArgs ReadUpdateArgs(const Napi::CallbackInfo& info) {
    return {
        RequireString(info[0], "The XML"),
        RequireString(info[1], "The XPath expression"),
        RequireString(info[2], "The value"),
        info[3].ToBoolean().Value()
    };
}

// Runs on the libuv threadpool with inputs copied in the constructor
class XPathSelectWorker : public Napi::AsyncWorker {
  public:
    XPathSelectWorker(const Napi::Function& callback, SelectArgs args)
        : Napi::AsyncWorker(callback, "node-libxslt:xpathSelect"), args_(std::move(args)) {}

  protected:
    void Execute() override {
        try {
            descriptors_ = XPathSelect(args_.xml, args_.expression, args_.fields, args_.first);
        } catch (const Failure& failure) {
            failure_ = failure;
            SetError(failure.what());
        }
    }

    void OnOK() override {
        Napi::Env env = Env();
        Napi::HandleScope scope(env);
        Callback().Call({ env.Null(), ToJsResult(env, descriptors_, args_.fields, args_.first) });
    }

    void OnError(const Napi::Error& error) override {
        Napi::Env env = Env();
        Napi::HandleScope scope(env);
        Callback().Call({ failure_ ? ToJsError(env, *failure_).Value() : error.Value() });
    }

  private:
    SelectArgs args_;
    std::vector<NodeDescriptor> descriptors_;
    std::optional<Failure> failure_;
};

class XPathUpdateWorker : public Napi::AsyncWorker {
  public:
    XPathUpdateWorker(const Napi::Function& callback, UpdateArgs args)
        : Napi::AsyncWorker(callback, "node-libxslt:xpathUpdate"), args_(std::move(args)) {}

  protected:
    void Execute() override {
        try {
            output_ = XPathUpdate(args_.xml, args_.expression, args_.value, args_.format);
        } catch (const Failure& failure) {
            failure_ = failure;
            SetError(failure.what());
        }
    }

    void OnOK() override {
        Napi::Env env = Env();
        Napi::HandleScope scope(env);
        Callback().Call({ env.Null(), Napi::String::New(env, output_) });
    }

    void OnError(const Napi::Error& error) override {
        Napi::Env env = Env();
        Napi::HandleScope scope(env);
        Callback().Call({ failure_ ? ToJsError(env, *failure_).Value() : error.Value() });
    }

  private:
    UpdateArgs args_;
    std::string output_;
    std::optional<Failure> failure_;
};

Napi::Value XPathSelectSync(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    SelectArgs args = ReadSelectArgs(info);
    try {
        return ToJsResult(env, XPathSelect(args.xml, args.expression, args.fields, args.first), args.fields, args.first);
    } catch (const Failure& failure) {
        throw ToJsError(env, failure);
    }
}

Napi::Value XPathSelectAsync(const Napi::CallbackInfo& info) {
    SelectArgs args = ReadSelectArgs(info);
    Napi::Function callback = RequireFunction(info[4], "The callback");
    (new XPathSelectWorker(callback, std::move(args)))->Queue();
    return info.Env().Undefined();
}

Napi::Value XPathUpdateSync(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    UpdateArgs args = ReadUpdateArgs(info);
    try {
        return Napi::String::New(env, XPathUpdate(args.xml, args.expression, args.value, args.format));
    } catch (const Failure& failure) {
        throw ToJsError(env, failure);
    }
}

Napi::Value XPathUpdateAsync(const Napi::CallbackInfo& info) {
    UpdateArgs args = ReadUpdateArgs(info);
    Napi::Function callback = RequireFunction(info[4], "The callback");
    (new XPathUpdateWorker(callback, std::move(args)))->Queue();
    return info.Env().Undefined();
}

}  // namespace

void RegisterXPath(Napi::Env env, Napi::Object exports) {
    exports.Set("xpathSelectSync", Napi::Function::New<XPathSelectSync>(env));
    exports.Set("xpathSelectAsync", Napi::Function::New<XPathSelectAsync>(env));
    exports.Set("xpathUpdateSync", Napi::Function::New<XPathUpdateSync>(env));
    exports.Set("xpathUpdateAsync", Napi::Function::New<XPathUpdateAsync>(env));
}

}  // namespace nlx
