// Very simple v8 wrapper for xml document, see https://github.com/nodejs/node-addon-api/blob/master/doc/object_wrap.md

#ifndef SRC_DOCUMENT_H_
#define SRC_DOCUMENT_H_

#include <napi.h>
#include <libxslt/xslt.h>
#include <libxslt/transform.h>
#include <libxslt/xsltutils.h>
#include <libexslt/exslt.h>

class Document : public Napi::ObjectWrap<Document> {
    public:
      static Napi::Object Init(Napi::Env env, Napi::Object exports);
      static Napi::Value New(xmlDocumentPtr DocumentPtr);
        
      Document(const Napi::CallbackInfo& info);
      ~Document();
        
      xmlDocumentPtr Document_obj;
};

#endif  // SRC_DOCUMENT_H_