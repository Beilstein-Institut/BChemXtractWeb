package org.beilstein.chemxtract.render.cdx.renderer;

import org.beilstein.chemxtract.cdx.datatypes.CDColor;

import java.awt.*;

public class ConverterUtils {

  private ConverterUtils() {
    // empty constructor to hide the implicit public one
  }

  static Color convertColor(CDColor color) {
    if (color == null) {
      return null;
    }
    return new Color(color.getRed(), color.getGreen(), color.getBlue());
  }

  static Stroke convertStroke(float lineWidth) {
    if (lineWidth > 0) {
      return new BasicStroke(lineWidth, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND);
    }
    return null;
  }

  static String convertText(String text) {
    StringBuilder sb = new StringBuilder();
    for (char c : text.toCharArray()) {
      if (c == '\r') {
        sb.append("\\r");
      } else if (c == '\n') {
        sb.append("\\n");
      } else if (c == '\t') {
        sb.append("\\t");
      } else if ((c < 0x20) || (c >= 0x80)) {
        sb.append("\\u" + Integer.toHexString(c));
      } else {
        sb.append(c);
      }
    }
    return sb.toString();
  }

}
