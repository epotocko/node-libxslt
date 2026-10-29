<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="text"/>
  <xsl:param name="p"/>
  <xsl:param name="n" select="'default'"/>
  <xsl:template match="/">p=[<xsl:value-of select="$p"/>] n=[<xsl:value-of select="$n"/>] len=<xsl:value-of select="string-length($p)"/></xsl:template>
</xsl:stylesheet>
