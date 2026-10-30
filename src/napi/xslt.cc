#include "xslt.h"

#include <optional>
#include <string>
#include <utility>
#include <vector>

#include "../core/xslt.h"
#include "convert.h"
#include "stylesheet.h"

namespace nlx {

namespace {

// Runs on the libuv threadpool. Inputs are copied in the constructor, so Execute()
// touches no JavaScript values.
class CompileStylesheetWorker : public Napi::AsyncWorker {
  public:
    CompileStylesheetWorker(const Napi::Function& callback, std::string source)
        : Napi::AsyncWorker(callback, "node-libxslt:compileStylesheet"), source_(std::move(source)) {}

  protected:
    void Execute() override {
        try {
            stylesheet_ = CompileStylesheet(source_);
        } catch (const Failure& failure) {
            failure_ = failure;
            SetError(failure.what());
        }
    }

    void OnOK() override {
        Napi::Env env = Env();
        Napi::HandleScope scope(env);
        Callback().Call({ env.Null(), Stylesheet::New(env, std::move(stylesheet_)) });
    }

    void OnError(const Napi::Error& error) override {
        Napi::Env env = Env();
        Napi::HandleScope scope(env);
        Callback().Call({ failure_ ? ToJsError(env, *failure_).Value() : error.Value() });
    }

  private:
    std::string source_;
    StylesheetPtr stylesheet_;
    std::optional<Failure> failure_;
};

class ApplyStylesheetWorker : public Napi::AsyncWorker {
  public:
    ApplyStylesheetWorker(const Napi::Function& callback, const Napi::Object& stylesheetObject,
                          xsltStylesheet* stylesheet, std::string xml, std::vector<std::string> params)
        : Napi::AsyncWorker(callback, "node-libxslt:applyStylesheet"),
          stylesheetObject_(Napi::Persistent(stylesheetObject)),
          stylesheet_(stylesheet),
          xml_(std::move(xml)),
          params_(std::move(params)) {}

  protected:
    void Execute() override {
        try {
            output_ = ApplyStylesheet(stylesheet_, xml_, params_);
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
    // Keeps the stylesheet from being garbage collected (and freed) while the transform runs
    Napi::ObjectReference stylesheetObject_;
    xsltStylesheet* stylesheet_;
    std::string xml_;
    std::vector<std::string> params_;
    std::string output_;
    std::optional<Failure> failure_;
};

Napi::Value CompileStylesheetSync(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    std::string source = RequireString(info[0], "The stylesheet source");
    try {
        return Stylesheet::New(env, CompileStylesheet(source));
    } catch (const Failure& failure) {
        throw ToJsError(env, failure);
    }
}

Napi::Value CompileStylesheetAsync(const Napi::CallbackInfo& info) {
    std::string source = RequireString(info[0], "The stylesheet source");
    Napi::Function callback = RequireFunction(info[1], "The callback");
    (new CompileStylesheetWorker(callback, std::move(source)))->Queue();
    return info.Env().Undefined();
}

Napi::Value ApplyStylesheetSync(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Stylesheet* stylesheet = Stylesheet::FromValue(info[0]);
    std::string xml = RequireString(info[1], "The XML source");
    std::vector<std::string> params = ToStrings(info[2], "The parameters");
    try {
        return Napi::String::New(env, ApplyStylesheet(stylesheet->get(), xml, params));
    } catch (const Failure& failure) {
        throw ToJsError(env, failure);
    }
}

Napi::Value ApplyStylesheetAsync(const Napi::CallbackInfo& info) {
    Stylesheet* stylesheet = Stylesheet::FromValue(info[0]);
    std::string xml = RequireString(info[1], "The XML source");
    std::vector<std::string> params = ToStrings(info[2], "The parameters");
    Napi::Function callback = RequireFunction(info[3], "The callback");
    (new ApplyStylesheetWorker(callback, info[0].As<Napi::Object>(), stylesheet->get(),
                               std::move(xml), std::move(params)))->Queue();
    return info.Env().Undefined();
}

}  // namespace

void RegisterXslt(Napi::Env env, Napi::Object exports) {
    exports.Set("compileStylesheetSync", Napi::Function::New<CompileStylesheetSync>(env));
    exports.Set("compileStylesheetAsync", Napi::Function::New<CompileStylesheetAsync>(env));
    exports.Set("applyStylesheetSync", Napi::Function::New<ApplyStylesheetSync>(env));
    exports.Set("applyStylesheetAsync", Napi::Function::New<ApplyStylesheetAsync>(env));
}

}  // namespace nlx
