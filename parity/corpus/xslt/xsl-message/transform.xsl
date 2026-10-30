<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:template match="/"><xsl:message>progress: <xsl:value-of select="count(//*)"/></xsl:message><out/><xsl:if test="/stop"><xsl:message terminate="yes">stopping</xsl:message></xsl:if></xsl:template>
</xsl:stylesheet>
