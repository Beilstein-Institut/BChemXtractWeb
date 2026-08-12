package org.beilstein.chemxtract.render.pdf;

import java.awt.Font;
import java.awt.GraphicsEnvironment;
import java.io.InputStream;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;

/**
 * Font name constants + AWT font registration for the ChemDraw renderer.
 *
 * <p>Ported from {@code org.beilstein.boa.io.pdf.PDFFontUtils} with the iText
 * ({@code com.lowagie}) dependency removed. The SVG render path draws text with
 * {@link java.awt.Font} (see {@code FontCreator}); iText was only used here to
 * register fonts and for PDF-only helpers. Fonts are now registered with the
 * {@link GraphicsEnvironment} so {@code new java.awt.Font(name, ...)} resolves
 * the embedded Liberation faces (metric-compatible SIL OFL 1.1 replacements
 * for the original Monotype ChemDraw faces, which could not be redistributed).
 * Ported code references this class only via the String name constants below.
 */
public final class PDFFontUtils {
  private static final Log logger = LogFactory.getLog(PDFFontUtils.class);

  // new String(...) (not compile-time constants) so that referencing any
  // constant forces class initialization -> the static block below runs.
  public static final String LIBERATION_SANS = new String("Liberation Sans");
  public static final String LIBERATION_SERIF = new String("Liberation Serif");
  public static final String LIBERATION_MONO = new String("Liberation Mono");

  private static final String FONT_DIR = "/org/beilstein/chemxtract/render/fonts/";
  private static final String[] FONT_FILES = {
      "LiberationSans-Regular.ttf", "LiberationSans-Bold.ttf",
      "LiberationSans-Italic.ttf", "LiberationSans-BoldItalic.ttf",
      "LiberationSerif-Regular.ttf", "LiberationSerif-Bold.ttf",
      "LiberationSerif-Italic.ttf", "LiberationSerif-BoldItalic.ttf",
      "LiberationMono-Regular.ttf", "LiberationMono-Bold.ttf",
      "LiberationMono-Italic.ttf", "LiberationMono-BoldItalic.ttf"
  };

  static {
    GraphicsEnvironment ge = GraphicsEnvironment.getLocalGraphicsEnvironment();
    for (String file : FONT_FILES) {
      try (InputStream in = PDFFontUtils.class.getResourceAsStream(FONT_DIR + file)) {
        if (in == null) {
          logger.warn("Font resource not found: " + FONT_DIR + file);
          continue;
        }
        // TRUETYPE_FONT also accepts OpenType/CFF (.otf) in modern JDKs.
        ge.registerFont(Font.createFont(Font.TRUETYPE_FONT, in));
      } catch (Exception e) {
        logger.warn("Could not register font " + file + ": " + e.getMessage());
      }
    }
  }

  private PDFFontUtils() {}
}
