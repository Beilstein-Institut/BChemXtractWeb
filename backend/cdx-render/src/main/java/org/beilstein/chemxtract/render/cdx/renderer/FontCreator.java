package org.beilstein.chemxtract.render.cdx.renderer;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.beilstein.chemxtract.render.pdf.PDFFontUtils;

import java.awt.*;
import java.awt.font.TextAttribute;
import java.util.HashMap;
import java.util.Map;

public class FontCreator {

  private static final Log logger = LogFactory.getLog(FontCreator.class);

  private FontCreator() {
    // empty constructor to hide the implicit public one
  }

  static Font createFont(String fontFamily, float fontSize, boolean bold, boolean italic, boolean underline) {
    if (fontFamily.equals("Arial") || fontFamily.equals("Helvetica")) {
      fontFamily = PDFFontUtils.LIBERATION_SANS;
    } else if (fontFamily.equals("Courier New")) {
      fontFamily = PDFFontUtils.LIBERATION_MONO;
    } else {
      // Times New Roman, Symbol (a serif face), and every unmapped family.
      // Liberation Serif is metric-compatible with Times New Roman and covers
      // the full Greek range the Symbol->Unicode path emits.
      fontFamily = PDFFontUtils.LIBERATION_SERIF;
    }

    Map<TextAttribute, Object> map = new HashMap<>();
    map.put(TextAttribute.FAMILY, fontFamily);
    if (fontSize > 0 && !Float.isNaN(fontSize) && !Float.isInfinite(fontSize)) {
      map.put(TextAttribute.SIZE, fontSize);
    } else {
      logger.error("Invalid font size found: " + fontSize);
    }
    if (bold) {
      map.put(TextAttribute.WEIGHT, TextAttribute.WEIGHT_BOLD);
    }
    if (italic) {
      map.put(TextAttribute.POSTURE, TextAttribute.POSTURE_OBLIQUE);
    }
    if (underline) {
      map.put(TextAttribute.UNDERLINE, TextAttribute.UNDERLINE_ON);
    }
    Font font = new Font(map);

    if (!font.getFamily().equals(fontFamily)) {
      logger.warn("Font \"" + fontFamily + "\" was replaced by \"" + font.getFamily() + "\" (Font not installed?!)");
    }
    return font;
  }

}
