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
 * the embedded ChemDraw faces. Ported code references this class only via the
 * String name constants below.
 */
public final class PDFFontUtils {
  private static final Log logger = LogFactory.getLog(PDFFontUtils.class);

  // new String(...) (not compile-time constants) so that referencing any
  // constant forces class initialization -> the static block below runs.
  public static final String ARIAL_MT = new String("Arial MT");
  public static final String NIMBUS_SANS = new String("NimbusSans");
  public static final String TIMES_NEW_ROMAN_WGL = new String("Times New Roman WGL");
  public static final String NIMBUS_ROMAN = new String("NimbusRoman");
  public static final String COURIER = new String("Courier10 WGL4 BT");
  public static final String META_BOLD = new String("MetaBold-Roman");
  public static final String COMPUTER_MODERN = new String("Computer Modern");
  public static final String COMPUTER_MODERN_SANS = new String("Computer Modern (Sans Serif)");
  public static final String CLAN_PRO_MEDIUM = new String("clanpro-medium");
  public static final String CLAN_PRO_BOOK = new String("clanpro-book");
  public static final String CLAN_PRO_THIN = new String("clanpro-thin");

  private static final String FONT_DIR = "/org/beilstein/chemxtract/render/fonts/";
  private static final String[] FONT_FILES = {
      "NimbusRoman.ttf", "NimbusRoman-Italic.ttf", "NimbusRoman-Bold.ttf", "NimbusRoman-BoldItalic.ttf",
      "NimbusSans-Regular.ttf", "NimbusSans-Italic.ttf", "NimbusSans-Bold.ttf", "NimbusSans-BoldItalic.ttf",
      "ari_____.ttf", "arib____.ttf", "aribi___.ttf", "arii____.ttf",
      "TNR_WGL_.ttf", "TNR_WGLb.ttf", "TNR_WGLi.ttf", "TNRWGLbi.ttf",
      "tt0419c_.ttf", "tt0582c_.ttf", "tt0583c_.ttf", "tt0611c_.ttf",
      "MtBdR___.ttf", "cmex10.ttf",
      "ClanPro-Book.otf", "ClanPro-Medium.otf", "ClanPro-Thin.otf"
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
