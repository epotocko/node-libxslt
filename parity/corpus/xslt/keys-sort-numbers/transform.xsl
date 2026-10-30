<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="text"/>
  <xsl:key name="by-cat" match="item" use="@cat"/>
  <xsl:decimal-format name="eu" decimal-separator="," grouping-separator="."/>
  <xsl:template match="/">
    <xsl:for-each select="//item"><xsl:sort select="@price" data-type="number" order="descending"/><xsl:value-of select="concat(@name, '=', format-number(@price, '#,##0.00'), ' / ', format-number(@price, '#.##0,00', 'eu'), ' #')"/><xsl:number/><xsl:text>&#10;</xsl:text></xsl:for-each>
    <xsl:value-of select="count(key('by-cat', 'x'))"/>|<xsl:value-of select="sum(//item/@price)"/>|<xsl:value-of select="1 div 3"/>|<xsl:value-of select="1 div 0"/>|<xsl:value-of select="number('x')"/>
  </xsl:template>
</xsl:stylesheet>
