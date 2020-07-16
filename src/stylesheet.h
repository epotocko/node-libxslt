// Very simple v8 wrapper for xslt stylesheet, see https://github.com/nodejs/node-addon-api/blob/master/doc/object_wrap.md

#ifndef SRC_STYLESHEET_H_
#define SRC_STYLESHEET_H_

#include <napi.h>
#include <libxslt/xslt.h>
#include <libxslt/transform.h>
#include <libxslt/xsltutils.h>
#include <libexslt/exslt.h>

class Stylesheet : public Napi::ObjectWrap<Stylesheet> {
    public:
        static Napi::Object Init(Napi::Env env, Napi::Object exports);
        static Napi::Value New(Napi::Env env, xsltStylesheetPtr stylesheetPtr);

        Stylesheet(const Napi::CallbackInfo& info);
        ~Stylesheet();

        xsltStylesheetPtr stylesheet_obj;
};

#endif  // SRC_STYLESHEET_H_