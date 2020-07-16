#define BUILDING_NODE_EXTENSION
#include <iostream>
#include <libxslt/xslt.h>
#include <libxslt/transform.h>
#include <libxslt/xsltutils.h>

// includes from libxmljs
#include <xml_syntax_error.h>
#include <xml_document.h>

#include "./node_libxslt.h"
#include "./stylesheet.h"

        int vasprintf(char** strp, const char* fmt, va_list ap) {
            va_list ap2;
            va_copy(ap2, ap);
            char tmp[1];
            int size = vsnprintf(tmp, 1, fmt, ap2);
            if (size <= 0) return size;
            va_end(ap2);
            size += 1;
            *strp = (char*)malloc(size * sizeof(char));
            return vsnprintf(*strp, size, fmt, ap);
        }

static xmlDoc* copyDocument(Napi::Value input) {    
    xmlDoc* stylesheetDoc = unwrapXmlDocument(input)->xml_obj;
    return xmlCopyDoc(stylesheetDoc, true);
}

// Directly inspired by nokogiri:
// https://github.com/sparklemotion/nokogiri/blob/24bb843327306d2d71e4b2dc337c1e327cbf4516/ext/nokogiri/xslt_stylesheet.c#L76
static void xslt_generic_error_handler(void * ctx, const char *msg, ...) 
{
  char * message;
  va_list args;
  va_start(args, msg);
  vasprintf(&message, msg, args);
  va_end(args);
  strncpy((char*)ctx, message, 2048);
  free(message);
}

// https://github.com/nodejs/node/blob/master/src/js_native_api_v8.h
inline v8::Local<v8::Value> V8LocalValueFromJsValue(napi_value v) {
    v8::Local<v8::Value> local;
    memcpy(static_cast<void*>(&local), &v, sizeof(v));
    return local;
}

static libxmljs::XmlDocument* unwrapXmlDocument(Napi::Value input) {
    v8::Local<v8::Object> tmp = Nan::To<v8::Object>(V8LocalValueFromJsValue(input)).ToLocalChecked();
    libxmljs::XmlDocument* doc = Nan::ObjectWrap::Unwrap<libxmljs::XmlDocument>(tmp);
    return doc;
}

Napi::Value StylesheetSync(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::HandleScope scope(env);
    char* errstr = new char[2048];
    xsltSetGenericErrorFunc(errstr, xslt_generic_error_handler);
    xmlDoc* doc = copyDocument(info[0]);
    xsltStylesheetPtr stylesheet = xsltParseStylesheetDoc(doc);
    xsltSetGenericErrorFunc(NULL, NULL);

    if (!stylesheet) {
        xmlFreeDoc(doc);
        Napi::Error::New(env, errstr).ThrowAsJavaScriptException();
        return env.Undefined();
    }

    return Stylesheet::New(env, stylesheet);
}

// for memory the segfault i previously fixed were due to xml documents being deleted
// by garbage collector before their associated stylesheet.
class StylesheetWorker : public Napi::AsyncWorker {
    public:
        StylesheetWorker(xmlDoc* doc, Napi::Function& callback)
          : Napi::AsyncWorker(callback), doc(doc) {}
        ~StylesheetWorker() {}

        // Executed inside the worker-thread.
        // It is not safe to access V8, or V8 data structures
        // here, so everything we need for input and output
        // should go on `this`.
        void Execute () {
            libxmljs::WorkerSentinel workerSentinel(workerParent);

            char* errstr = new char[2048];
            xsltSetGenericErrorFunc(errstr, xslt_generic_error_handler);
            result = xsltParseStylesheetDoc(doc);
            xsltSetGenericErrorFunc(NULL, NULL);
            if(!result) {
                std::string err(errstr);
                this->SetError(err);
                xmlFreeDoc(doc);
                delete errstr;
            }
        };

        // Executed when the async work is complete
        // this function will be run inside the main event loop
        // so it is safe to use V8 again
        void OnOK () {
            Napi::Env env = Env();
            Napi::HandleScope scope(env);
            Napi::Value stylesheet = Stylesheet::New(env, result);
            Callback().Call({ env.Null(), stylesheet });
        };

    private:
        libxmljs::WorkerParent workerParent;
        xmlDoc* doc;
        xsltStylesheetPtr result;
};

Napi::Value StylesheetAsync(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::HandleScope scope(env);
    xmlDoc* doc = copyDocument(info[0]);
    Napi::Function callback = info[1].As<Napi::Function>();
    StylesheetWorker* worker = new StylesheetWorker(doc, callback);
    worker->Queue();
    return env.Undefined();
}

// duplicate from https://github.com/bsuh/node_xslt/blob/master/node_xslt.cc
void freeArray(char **array, int size) {
    for (int i = 0; i < size; i++) {
        free(array[i]);
    }
    free(array);
}

// transform a v8 array into a char** to pass params to xsl transform
// inspired by https://github.com/bsuh/node_xslt/blob/master/node_xslt.cc
char** PrepareParams(Napi::Array array) {
    uint32_t arrayLen = array.Length();
    char** params = (char **)malloc(sizeof(char *) * (arrayLen + 1));
    memset(params, 0, sizeof(char *) * (arrayLen + 1));
    for (uint32_t i = 0; i < arrayLen; i++) {
        std::string param = ((Napi::Value)array[i]).ToString().Utf8Value();
        params[i] = (char *)malloc(sizeof(char) * (param.length() + 1));
        strcpy(params[i], param.c_str());
    }
    return params;
}

Napi::Value ApplySync(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::HandleScope scope(env);
    Stylesheet* stylesheet = Napi::ObjectWrap<Stylesheet>::Unwrap(info[0].As<Napi::Object>());
    libxmljs::XmlDocument* docSource = unwrapXmlDocument(info[1]);
    Napi::Array paramsArray = info[2].As<Napi::Array>();
    bool outputString = info[3].As<Napi::Boolean>();

    char** params = PrepareParams(paramsArray);

    xmlDoc* result = xsltApplyStylesheet(stylesheet->stylesheet_obj, docSource->xml_obj, (const char **)params);
    if (!result) {
        freeArray(params, paramsArray.Length());
        Napi::Error::New(env, "Failed to apply stylesheet").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    Napi::String retVal;
    if (outputString) {
        // As well as a libxmljs document, prepare a string result
        unsigned char* resStr;
        int len;
        xsltSaveResultToString(&resStr, &len, result, stylesheet->stylesheet_obj);
        xmlFreeDoc(result);
        retVal = Napi::String::New(env, resStr ? (char*)resStr : "");
        if (resStr) xmlFree(resStr);
    } else {
        // Fill a result libxmljs document.
        // for some obscure reason I didn't manage to create a new libxmljs document in applySync,
        // but passing a document by reference and modifying its content works fine
        // replace the empty document in docResult with the result of the stylesheet
        libxmljs::XmlDocument* docResult = unwrapXmlDocument(info[4]);
        docResult->xml_obj->_private = NULL;
        xmlFreeDoc(docResult->xml_obj);
        docResult->xml_obj = result;
        result->_private = docResult;
    }

    freeArray(params, paramsArray.Length());
    return retVal;
}

// for memory the segfault i previously fixed were due to xml documents being deleted
// by garbage collector before their associated stylesheet.
class ApplyWorker : public Napi::AsyncWorker {
    public:
        ApplyWorker(Stylesheet* stylesheet, libxmljs::XmlDocument* docSource, char** params, int paramsLength, bool outputString, libxmljs::XmlDocument* docResult, Napi::Function& callback)
            : Napi::AsyncWorker(callback), stylesheet(stylesheet), docSource(docSource), params(params), paramsLength(paramsLength), outputString(outputString), docResult(docResult) {}
        ~ApplyWorker() {}

        // Executed inside the worker-thread.
        // It is not safe to access V8, or V8 data structures
        // here, so everything we need for input and output
        // should go on `this`.
        void Execute () {
            libxmljs::WorkerSentinel workerSentinel(workerParent);
            result = xsltApplyStylesheet(stylesheet->stylesheet_obj, docSource->xml_obj, (const char **)params);
            if (!result) {
                this->SetError("Failed to apply stylesheet");
                return;
            }
            if(outputString) {
                int len;
                int status = xsltSaveResultToString(&this->resStr, &len, result, stylesheet->stylesheet_obj);
                if(status == -1) {
                    if(resStr) xmlFree(resStr);
                    this->SetError("Failed to save XSLT result to string");
                }
                xmlFreeDoc(result);
            }
        }

        // Executed when the async work is complete
        // this function will be run inside the main event loop
        // so it is safe to use V8 again
        void OnOK () {
            Napi::Env env = Env();
            Napi::HandleScope scope(env);

            Napi::Value xml = env.Null();
            if(!outputString) {
                // for some obscure reason I didn't manage to create a new libxmljs document in applySync,
                // but passing a document by reference and modifying its content works fine
                // replace the empty document in docResult with the result of the stylesheet
                docResult->xml_obj->_private = NULL;
                xmlFreeDoc(docResult->xml_obj);
                docResult->xml_obj = result;
                result->_private = docResult;
            } else {
               xml = Napi::String::New(env, resStr ? (char*)resStr : "");
               if(resStr) xmlFree(resStr);
            }
            freeArray(params, paramsLength);
            Callback().Call({ env.Null(), xml });
        };

        void OnError(const Napi::Error& e) {
            freeArray(params, paramsLength);
            Callback().Call({ e.Value() });
        };

    private:
        libxmljs::WorkerParent workerParent;
        Stylesheet* stylesheet;
        libxmljs::XmlDocument* docSource;
        char** params;
        int paramsLength;
        bool outputString;
        libxmljs::XmlDocument* docResult;
        xmlDoc* result;
        unsigned char* resStr;
};


Napi::Value ApplyAsync(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::HandleScope scope(env);

    Stylesheet* stylesheet = Napi::ObjectWrap<Stylesheet>::Unwrap(info[0].As<Napi::Object>());
    libxmljs::XmlDocument* docSource = unwrapXmlDocument(info[1]);
    Napi::Array paramsArray = info[2].As<Napi::Array>();
    bool outputString = info[3].As<Napi::Boolean>();
    libxmljs::XmlDocument* docResult = unwrapXmlDocument(info[4]);
    Napi::Function callback = info[5].As<Napi::Function>();

    char** params = PrepareParams(paramsArray);

    ApplyWorker* worker = new ApplyWorker(stylesheet, docSource, params, paramsArray.Length(), outputString, docResult, callback);
    worker->Queue();
    return env.Undefined();
}

Napi::Value RegisterEXSLT(const Napi::CallbackInfo& info) {
    exsltRegisterAll();
    return info.Env().Undefined();
}

Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
    exports = Stylesheet::Init(env, exports);
    exports.Set("stylesheetSync", Napi::Function::New<StylesheetSync>(env));
    exports.Set("stylesheetAsync", Napi::Function::New<StylesheetAsync>(env));
    exports.Set("applySync", Napi::Function::New<ApplySync>(env));
    exports.Set("applyAsync", Napi::Function::New<ApplyAsync>(env));
    exports.Set("registerEXSLT", Napi::Function::New<RegisterEXSLT>(env));
    return exports;
}

NODE_API_MODULE(node_libxslt, InitAll)