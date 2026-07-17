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
    if (fontFamily.equals("Times New Roman")) {
      fontFamily = PDFFontUtils.TIMES_NEW_ROMAN_WGL;
    } else if (fontFamily.equals("Arial")) {
      fontFamily = PDFFontUtils.ARIAL_MT;
    } else if (fontFamily.equals("Symbol")) {
      // Symbol is a serif font
      fontFamily = PDFFontUtils.TIMES_NEW_ROMAN_WGL;
    } else if (fontFamily.equals("Courier New")) {
      fontFamily = PDFFontUtils.COURIER;
    } else if (fontFamily.equals("Helvetica")) {
      // Replace Helvetica with Arial
      fontFamily = PDFFontUtils.ARIAL_MT;
    } else {
      fontFamily = PDFFontUtils.TIMES_NEW_ROMAN_WGL;
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
