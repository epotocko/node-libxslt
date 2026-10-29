{
  "targets": [
    {
      "target_name": "node_libxslt",
      "sources": [
        "src/addon.cc",
        "src/core/errors.cc",
        "src/core/parse.cc",
        "src/core/xpath.cc",
        "src/core/xslt.cc",
        "src/napi/convert.cc",
        "src/napi/stylesheet.cc",
        "src/napi/xpath.cc",
        "src/napi/xslt.cc"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').targets\"):node_addon_api_except"
      ],
      # A callback can't run in a worker thread that is being terminated; drop its exception instead of aborting
      "defines": [ "NAPI_VERSION=8", "NODE_API_SWALLOW_UNTHROWABLE_EXCEPTIONS" ],
      # Dynamically link the system libxml2/libxslt so there is one copy of each in the process
      "cflags_cc": [ "-std=c++17", "<!@(pkg-config --cflags libxml-2.0 libxslt libexslt)" ],
      "libraries": [ "<!@(pkg-config --libs libxml-2.0 libxslt libexslt)" ],
      "conditions": [
        [ "OS=='mac'", {
          "xcode_settings": {
            "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
            "OTHER_CPLUSPLUSFLAGS": [ "<!@(pkg-config --cflags libxml-2.0 libxslt libexslt)" ]
          }
        } ]
      ]
    }
  ]
}
