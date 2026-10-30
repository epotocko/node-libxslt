// Exercises src/core from several threads at once, without Node, so it can run under
// ThreadSanitizer and LeakSanitizer. Built and run by test/native/run.sh.
// Usage: core_test [threads] [iterations]

#include <atomic>
#include <cstdio>
#include <cstdlib>
#include <string>
#include <thread>
#include <vector>

#include <libxml/parser.h>
#include <libxslt/security.h>
#include <libxslt/xslt.h>

#include "../../src/core/errors.h"
#include "../../src/core/xpath.h"
#include "../../src/core/xslt.h"

namespace {

std::atomic<int> failures{0};

#define CHECK(condition)                                                                   \
    do {                                                                                   \
        if (!(condition)) {                                                                \
            failures++;                                                                    \
            std::fprintf(stderr, "%s:%d: CHECK failed: %s\n", __FILE__, __LINE__, #condition); \
        }                                                                                  \
    } while (0)

const char kXslOpen[] = "<xsl:stylesheet version=\"1.0\" xmlns:xsl=\"http://www.w3.org/1999/XSL/Transform\">";
const std::string kEcho = std::string(kXslOpen) +
    "<xsl:output method=\"text\"/><xsl:param name=\"p\"/><xsl:template match=\"/\">"
    "<xsl:value-of select=\"count(//*)\"/>|<xsl:value-of select=\"$p\"/></xsl:template></xsl:stylesheet>";

std::string Document(int items) {
    std::string xml = "<root>";
    for (int i = 0; i < items; ++i) xml += "<i>" + std::to_string(i) + " &amp; x</i>";
    return xml + "</root>";
}

// Not well-formed, with the error on the given line
std::string BadDocument(int line) {
    return std::string(static_cast<size_t>(line - 1), '\n') + "<a><b></a>";
}

// Runs fn, expecting a Failure, and returns it
template <typename Fn>
nlx::Failure ExpectFailure(Fn fn) {
    try {
        fn();
    } catch (const nlx::Failure& failure) {
        return failure;
    }
    failures++;
    std::fprintf(stderr, "expected a Failure\n");
    return nlx::Failure("", "");
}

void Run(xsltStylesheet* shared, int id, int iterations) {
    const std::string tag = "t" + std::to_string(id);
    for (int i = 0; i < iterations; ++i) {
        try {
            int items = (id * 7 + i) % 50 + 1;
            std::string doc = Document(items);
            std::string count = std::to_string(items + 1);

            // A transform with the stylesheet every thread shares
            CHECK(nlx::ApplyStylesheet(shared, doc, { "p", "'" + tag + "'" }) == count + "|" + tag);

            // A stylesheet compiled, used and freed on this thread
            nlx::StylesheetPtr own = nlx::CompileStylesheet(kEcho);
            CHECK(nlx::ApplyStylesheet(own.get(), doc, {}) == count + "|");

            // XPath select and update
            auto nodes = nlx::XPathSelect(doc, "//i", nlx::kFieldText | nlx::kFieldXml | nlx::kFieldAttributes, false);
            CHECK(nodes.size() == static_cast<size_t>(items));
            CHECK(nodes.back().text == std::to_string(items - 1) + " & x");
            std::string updated = nlx::XPathUpdate(doc, "//i", "v&" + tag, true);
            CHECK(updated.find("<i>v&amp;" + tag + "</i>") != std::string::npos);

            // Elements updated together with nodes inside them, in a document with a DTD entity,
            // CDATA and comments (regression: freed nodes were read when the XPath result was freed)
            std::string mixed = "<!DOCTYPE r [<!ENTITY e \"x &amp; y\">]><r><item>&e; a<!--c--><![CDATA[d]]><b/></item><item/></r>";
            std::string replaced = nlx::XPathUpdate(mixed, "//item | //comment() | //item/node()", tag, false);
            CHECK(replaced.find("<r><item>" + tag + "</item><item>" + tag + "</item></r>") != std::string::npos);

            // Errors carry this thread's own location and names, never another thread's
            int line = id * 1000 + i + 2;
            nlx::Failure parse = ExpectFailure([&] { nlx::XPathSelect(BadDocument(line), "/a", nlx::kFieldText, false); });
            CHECK(parse.xmlError() && parse.xmlError()->line == line);

            std::string undeclared = "v" + std::to_string(id) + "x" + std::to_string(i);
            nlx::StylesheetPtr bad = nlx::CompileStylesheet(std::string(kXslOpen) +
                "<xsl:template match=\"/\"><xsl:value-of select=\"$" + undeclared + "\"/></xsl:template></xsl:stylesheet>");
            nlx::Failure apply = ExpectFailure([&] { nlx::ApplyStylesheet(bad.get(), "<a/>", {}); });
            CHECK(apply.details().find("'" + undeclared + "'") != std::string::npos);
            CHECK(apply.details().find("Variable 'v") == apply.details().rfind("Variable 'v"));

            nlx::Failure compile = ExpectFailure([&] { nlx::CompileStylesheet(std::string(static_cast<size_t>(line - 1), '\n') + kXslOpen + "<open></xsl:stylesheet>"); });
            CHECK(compile.xmlError() && compile.xmlError()->line == line);

            nlx::Failure xpath = ExpectFailure([&] { nlx::XPathUpdate("<a/>", "///", "v", false); });
            CHECK(xpath.xmlError() && xpath.xmlError()->domain == XML_FROM_XPATH);
        } catch (const std::exception& e) {
            failures++;
            std::fprintf(stderr, "thread %d iteration %d: unexpected exception: %s\n", id, i, e.what());
        }
    }
}

}  // namespace

int main(int argc, char** argv) {
    int threads = argc > 1 ? std::atoi(argv[1]) : 8;
    int iterations = argc > 2 ? std::atoi(argv[2]) : 100;

    xmlInitParser();
    nlx::InitXslt();
    nlx::StylesheetPtr shared = nlx::CompileStylesheet(kEcho);

    std::vector<std::thread> workers;
    for (int id = 0; id < threads; ++id) workers.emplace_back(Run, shared.get(), id, iterations);
    for (std::thread& worker : workers) worker.join();
    shared.reset();

    // Release process-wide state, so LeakSanitizer reports only real leaks
    xsltSecurityPrefsPtr prefs = xsltGetDefaultSecurityPrefs();
    xsltSetDefaultSecurityPrefs(nullptr);
    xsltFreeSecurityPrefs(prefs);
    xsltCleanupGlobals();
    xmlCleanupParser();

    std::printf("%d threads x %d iterations: %d failed checks\n", threads, iterations, failures.load());
    return failures == 0 ? 0 : 1;
}
