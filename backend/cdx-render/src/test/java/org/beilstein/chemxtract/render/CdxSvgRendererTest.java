package org.beilstein.chemxtract.render;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.junit.Test;

public class CdxSvgRendererTest {

  private byte[] resource(String name) throws Exception {
    try (InputStream in = getClass().getResourceAsStream("/" + name)) {
      assertNotNull("missing test resource " + name, in);
      return in.readAllBytes();
    }
  }

  @Test
  public void rendersBinaryCdxToSvg() throws Exception {
    byte[] svg = CdxSvgRenderer.toSvg(resource("sample.cdx"), 3.0);
    String s = new String(svg, StandardCharsets.UTF_8);
    assertTrue("output is not SVG: " + s.substring(0, Math.min(80, s.length())), s.contains("<svg"));
    assertTrue("svg has no drawing content", s.contains("<g") || s.contains("<path") || s.contains("<text"));
    assertTrue("svg too small", svg.length > 200);
  }

  @Test
  public void rendersOnlyRedistributableFonts() throws Exception {
    String svg = new String(CdxSvgRenderer.toSvg(resource("sample.cdx"), 3.0), StandardCharsets.UTF_8);
    Matcher m = Pattern.compile("font-family=\"'([^\"']+)'\"").matcher(svg);
    Set<String> families = new HashSet<>();
    while (m.find()) {
      families.add(m.group(1));
    }
    // Batik stamps its own default graphics state ("Dialog") on the root <svg>
    // and on group elements; no <text> element ever resolves to it.
    families.remove("Dialog");
    assertFalse("no font-family found in render output", families.isEmpty());
    Set<String> allowed = Set.of("Liberation Sans", "Liberation Serif", "Liberation Mono");
    for (String family : families) {
      assertTrue("non-redistributable font in render output: " + family, allowed.contains(family));
    }
  }

  @Test
  public void noLicensedClassesOnClasspath() {
    // iText, Aspose, and JAI (the decoder TIFFGraphicReader used before switching to ImageIO)
    // must not be resolvable from the shaded jar.
    for (String cls : new String[] {
        "com.lowagie.text.FontFactory", "com.aspose.metafiles.Image",
        "javax.media.jai.JAI", "com.sun.media.jai.codec.MemoryCacheSeekableStream" }) {
      try {
        Class.forName(cls);
        throw new AssertionError("licensed class present: " + cls);
      } catch (ClassNotFoundException expected) {
        // good
      }
    }
  }
}
