<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="html"/>
  <xsl:template match="/"><html><head><meta charset="utf-8"/><script>if (a &lt; b &amp;&amp; c) {}</script></head><body><br/><p><xsl:value-of select="/doc/text"/></p><input disabled="disabled"/></body></html></xsl:template>
</xsl:stylesheet>
