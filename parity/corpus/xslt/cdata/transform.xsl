<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="xml" cdata-section-elements="data"/>
  <xsl:template match="/"><out><data><![CDATA[<literal> & ]]><xsl:value-of select="/doc/v"/></data><plain><![CDATA[a < b]]></plain></out></xsl:template>
</xsl:stylesheet>
