<?xml version="1.0"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="xml" indent="yes" encoding="ISO-8859-1"/>
  <xsl:template match="/"><out><xsl:copy-of select="/*/*"/><empty/><xsl:comment> c </xsl:comment></out></xsl:template>
</xsl:stylesheet>
