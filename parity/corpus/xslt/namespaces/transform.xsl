<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:o="urn:out" xmlns:unused="urn:unused" exclude-result-prefixes="unused">
  <xsl:output method="xml" indent="yes"/>
  <xsl:template match="/"><o:result><xsl:copy-of select="//*[local-name()='item']"/><plain xmlns="urn:default-out"/></o:result></xsl:template>
</xsl:stylesheet>
