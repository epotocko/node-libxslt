<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:str="http://exslt.org/strings" xmlns:math="http://exslt.org/math" xmlns:set="http://exslt.org/sets"
  xmlns:exsl="http://exslt.org/common" xmlns:dyn="http://exslt.org/dynamic" xmlns:func="http://exslt.org/functions"
  xmlns:my="urn:my" extension-element-prefixes="func" exclude-result-prefixes="str math set exsl dyn my">
  <xsl:output method="xml" omit-xml-declaration="yes"/>
  <func:function name="my:double"><xsl:param name="x"/><func:result select="$x * 2"/></func:function>
  <xsl:variable name="rtf"><v>3</v><v>1</v><v>3</v></xsl:variable>
  <xsl:template match="/">
    <out>
      <tokens><xsl:for-each select="str:tokenize('a,b,,c', ',')"><t><xsl:value-of select="."/></t></xsl:for-each></tokens>
      <max><xsl:value-of select="math:max(exsl:node-set($rtf)/v)"/></max>
      <distinct><xsl:value-of select="count(set:distinct(exsl:node-set($rtf)/v))"/></distinct>
      <dynamic><xsl:value-of select="dyn:evaluate('1 + 2')"/></dynamic>
      <double><xsl:value-of select="my:double(21)"/></double>
      <padded>[<xsl:value-of select="str:padding(3, '*')"/>]</padded>
    </out>
  </xsl:template>
</xsl:stylesheet>
