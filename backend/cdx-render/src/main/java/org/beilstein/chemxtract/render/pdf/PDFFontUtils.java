package org.beilstein.chemxtract.render.pdf;

import java.awt.Color;
import java.util.HashMap;
import java.util.Map;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;

import com.lowagie.text.Chunk;
import com.lowagie.text.Font;
import com.lowagie.text.FontFactory;
import com.lowagie.text.Paragraph;
import com.lowagie.text.Phrase;
import com.lowagie.text.SplitCharacter;
import com.lowagie.text.pdf.BaseFont;
import com.lowagie.text.pdf.PdfChunk;

/**
 * This class holds helper methods for font utilities concerning PDFs.
 * 
 * @author stephan
 * @version $Id: PDFFontUtils.java,v 1.18 2014-08-07 11:24:14 bsnie Exp $
 */
public class PDFFontUtils {
  private static final Log logger = LogFactory.getLog(PDFFontUtils.class);

  // we do need to use non-primitive constants to ensure that the static block gets executed
  /** Name of the Arial font used by ChemDraw */
  public static final String ARIAL_MT = new String("Arial MT");

  /** Name of new Arial style font Nimbus Sans */
  public static final String NIMBUS_SANS = new String("NimbusSans");

  /** Name of the Time New Roman font used by ChemDraw */
  public static final String TIMES_NEW_ROMAN_WGL = new String("Times New Roman WGL");

  /** Name of new Times New Roman style font NimbusRoman */
  public static final String NIMBUS_ROMAN = new String("NimbusRoman");

  /** Name of the Courier font. */
  public static final String COURIER = new String("Courier10 WGL4 BT");
  /** Name of the MetaBold-Roman font. */
  public static final String META_BOLD = new String("MetaBold-Roman");

  public static final String COMPUTER_MODERN = new String("Computer Modern");
  public static final String COMPUTER_MODERN_SANS = new String("Computer Modern (Sans Serif)");

  public static final String CLAN_PRO_MEDIUM = new String("clanpro-medium");
  public static final String CLAN_PRO_BOOK = new String("clanpro-book");
  public static final String CLAN_PRO_THIN = new String("clanpro-thin");

  /** Character used to replace non displayable characters */
  private static final String REPLACEMENT_CHARACTER = "\u2588";

  // register fonts
  static {

    FontFactory.register("org/beilstein/chemxtract/render/fonts/NimbusRoman.ttf");
    FontFactory.register("org/beilstein/chemxtract/render/fonts/NimbusRoman-Italic.ttf");
    FontFactory.register("org/beilstein/chemxtract/render/fonts/NimbusRoman-Bold.ttf");
    FontFactory.register("org/beilstein/chemxtract/render/fonts/NimbusRoman-BoldItalic.ttf");

    FontFactory.register("org/beilstein/chemxtract/render/fonts/NimbusSans-Regular.ttf");
    FontFactory.register("org/beilstein/chemxtract/render/fonts/NimbusSans-Italic.ttf");
    FontFactory.register("org/beilstein/chemxtract/render/fonts/NimbusSans-Bold.ttf");
    FontFactory.register("org/beilstein/chemxtract/render/fonts/NimbusSans-BoldItalic.ttf");

//    FontFactory.register("org/beilstein/chemxtract/render/fonts/NimbusRoman.otf");
//    FontFactory.register("org/beilstein/chemxtract/render/fonts/NimbusRoman-Italic.otf");
//    FontFactory.register("org/beilstein/chemxtract/render/fonts/NimbusRoman-Bold.otf");
//    FontFactory.register("org/beilstein/chemxtract/render/fonts/NimbusRoman-BoldItalic.otf");
//
//    FontFactory.register("org/beilstein/chemxtract/render/fonts/NimbusSans-Regular.otf");
//    FontFactory.register("org/beilstein/chemxtract/render/fonts/NimbusSans-Italic.otf");
//    FontFactory.register("org/beilstein/chemxtract/render/fonts/NimbusSans-Bold.otf");
//    FontFactory.register("org/beilstein/chemxtract/render/fonts/NimbusSans-BoldItalic.otf");

    FontFactory.register("org/beilstein/chemxtract/render/fonts/ari_____.ttf");
    FontFactory.register("org/beilstein/chemxtract/render/fonts/arib____.ttf");
    FontFactory.register("org/beilstein/chemxtract/render/fonts/aribi___.ttf");
    FontFactory.register("org/beilstein/chemxtract/render/fonts/arii____.ttf");

    FontFactory.register("org/beilstein/chemxtract/render/fonts/TNR_WGL_.ttf");
    FontFactory.register("org/beilstein/chemxtract/render/fonts/TNR_WGLb.ttf");
    FontFactory.register("org/beilstein/chemxtract/render/fonts/TNR_WGLi.ttf");
    FontFactory.register("org/beilstein/chemxtract/render/fonts/TNRWGLbi.ttf");

    FontFactory.register("org/beilstein/chemxtract/render/fonts/tt0419c_.ttf");
    FontFactory.register("org/beilstein/chemxtract/render/fonts/tt0582c_.ttf");
    FontFactory.register("org/beilstein/chemxtract/render/fonts/tt0583c_.ttf");
    FontFactory.register("org/beilstein/chemxtract/render/fonts/tt0611c_.ttf");

    FontFactory.register("org/beilstein/chemxtract/render/fonts/MtBdR___.ttf");

    FontFactory.register("org/beilstein/chemxtract/render/fonts/cmex10.ttf");

    FontFactory.register("org/beilstein/chemxtract/render/fonts/ClanPro-Book.otf");
    FontFactory.register("org/beilstein/chemxtract/render/fonts/ClanPro-Medium.otf");
    FontFactory.register("org/beilstein/chemxtract/render/fonts/ClanPro-Thin.otf");

    for (Object family : FontFactory.getRegisteredFamilies()) {
      logger.debug("Registered font family: " + family);
    }

    for (Object family : FontFactory.getRegisteredFonts()) {
      logger.debug("Registered font: " + family);
    }
  }

  /** Holds characters that are automatically replaced. */
  private static final Map<Character,Character> charReplacements = new HashMap<>();
  static {
    charReplacements.put(Character.valueOf('\u2011'), Character.valueOf('\u002D'));
    charReplacements.put(Character.valueOf('\u2218'), Character.valueOf('\u25CB'));
    charReplacements.put(Character.valueOf('\u25b5'), Character.valueOf('\u2206'));
    charReplacements.put(Character.valueOf('\u22C9'), Character.valueOf('\u0078'));
    charReplacements.put(Character.valueOf('\u2220'), Character.valueOf('\u003C'));
  }

  private static final BaseFont ARIAL_FONT =
          PDFFontUtils.createFont(PDFFontUtils.NIMBUS_SANS, 12, Font.NORMAL, null, BaseFont.IDENTITY_H).getBaseFont();
  private static final BaseFont TIMES_FONT =
          PDFFontUtils.createFont(PDFFontUtils.NIMBUS_ROMAN, 12, Font.NORMAL, null, BaseFont.IDENTITY_H).getBaseFont();

  /**
   * Create a PDF font with the given name and size.
   * 
   * @param fontName Font name
   * @param fontSize Font size
   * @return PDF font
   */
  public static Font createFont(String fontName, float fontSize) {
    return createFont(fontName, fontSize, Font.UNDEFINED, null);
  }

  /**
   * Create a PDF font with the given name, size and style.
   * 
   * @param fontName Font name
   * @param fontSize Font size
   * @param fontStyle Font style
   * @return PDF font
   */
  public static Font createFont(String fontName, float fontSize, int fontStyle) {
    return createFont(fontName, fontSize, fontStyle, null);
  }

  /**
   * Create a PDF font with the given name, size, style and color.
   * 
   * @param fontName Font name
   * @param fontSize Font size
   * @param fontStyle Font style
   * @param color Font color
   * @return PDF font
   */
  public static Font createFont(String fontName, float fontSize, int fontStyle, Color color) {
    return createFont(fontName, fontSize, fontStyle, color, FontFactory.defaultEncoding);
  }

  /**
   * Create a PDF font with the given name, size, style and color.
   * 
   * @param fontName Font name
   * @param fontSize Font size
   * @param fontStyle Font style
   * @param color Font color
   * @param encoding Encoding for the PDF font
   * @return PDF font
   */
  public static Font createFont(String fontName, float fontSize, int fontStyle, Color color, String encoding) {
    boolean embedded = NIMBUS_SANS.equals(fontName) || NIMBUS_ROMAN.equals(fontName) || COURIER.equals(fontName) ||
            META_BOLD.equals(fontName) || fontName.startsWith(COMPUTER_MODERN);

    // As soon a we use the given font in our document, this font is embedded into the PDF when the embedded parameter is true
    Font font = FontFactory.getFont(fontName, encoding, embedded, fontSize, fontStyle, color);
    if (font == null || font.getBaseFont() == null) {
      throw new IllegalStateException("Cannot find font \"" + fontName + "\"");
    }
    return font;
  }

  /**
   * Create PDF paragraph with given text and font.
   * 
   * @param text Text
   * @param font Text font
   * @return PDF paragraph
   */
  public static Paragraph createParagraph(String text, Font font) {
    return createParagraph(text, font, null);
  }

  /**
   * Create PDF paragraph with the given text, font and anchor. The anchor is mostly a link
   * reference.
   * 
   * @param text Text
   * @param font Text font
   * @param anchor Link reference
   * @return PDF paragraph
   */
  public static Paragraph createParagraph(String text, Font font, String anchor) {
    if (text == null) {
      return new Paragraph();
    }
    Paragraph pdfParagraph = new Paragraph();
    addPhrase(pdfParagraph, text, font, anchor);
    return pdfParagraph;
  }

  /**
   * Create a PDF phrase with then given text and font.
   * 
   * @param text Text
   * @param font Text font
   * @return PDF phrase
   */
  public static Phrase createPhrase(String text, Font font) {
    return createPhrase(text, font, null);
  }

  /**
   * Create a PDF phrase with the given text, font and anchor. The anchor is mostly a link
   * reference.
   * 
   * @param text Text
   * @param font Text font
   * @param anchor Anchor
   * @return PDF phrase
   */
  public static Phrase createPhrase(String text, Font font, String anchor) {
    if (text == null) {
      return new Phrase();
    }

    Phrase pdfPhrase = new Phrase();
    addPhrase(pdfPhrase, text, font, anchor);
    return pdfPhrase;
  }

  /**
   * Add the given text to a PDF phase
   * 
   * @param pdfPhrase Phrase, which should be extended
   * @param text Text, which should be added
   * @param font Text font of this text
   */
  public static void addPhrase(Phrase pdfPhrase, String text, Font font) {
    addPhrase(pdfPhrase, text, font, null);
  }

  /**
   * Add the given text to a PDF phase
   * 
   * @param pdfPhrase Phrase, which should be extended
   * @param text Text, which should be added
   * @param font Text font of this text
   * @param anchor Anchor of this text
   */
  public static void addPhrase(Phrase pdfPhrase, String text, Font font, String anchor) {
    if (text == null) {
      return;
    }

    logger.debug("render chunk: text=" + text);
    Chunk pdfChunk = new Chunk(convertInvalidCharacters(text, font.getBaseFont(), true), font);
    if (anchor != null) {
      pdfChunk.setAnchor(anchor);
    }
    pdfPhrase.add(pdfChunk);
  }

  /**
   * Create a derivated font from a given font.
   * 
   * @param font Original font
   * @param fontName New font name, otherwise null
   * @param bold True, if the new font should be bold, otherwise it will not change the font style
   * @param italic True, if the new font should be italic, otherwise it will not change the font
   *          style
   * @param script True, if the new font should be superscript or subscript, otherwise it will not
   *          change the font style
   * @param color New color, otherwise null
   * @return Derivated font
   */
  public static Font derivateFont(Font font, String fontName, boolean bold, boolean italic, boolean script, Color color) {
    return derivateFont(font, fontName, bold, italic, false, script, color, null);
  }

  /**
   * Create a derivated font from a given font.
   * 
   * @param font Original font
   * @param fontName New font name, otherwise null
   * @param bold True, if the new font should be bold, otherwise it will not change the font style
   * @param italic True, if the new font should be italic, otherwise it will not change the font
   *          style
   * @param script True, if the new font should be superscript or subscript, otherwise it will not
   *          change the font style
   * @param encoding New encoding for the PDF font, otherwise null
   * @param color New color, otherwise null
   * @return Derivated font
   */
  public static Font derivateFont(Font font, String fontName, boolean bold, boolean italic, boolean underline, boolean script, Color color,
    String encoding) {
    String familyName = font.getFamilyname();
    int style = font.getCalculatedStyle();
    BaseFont baseFont = font.getBaseFont();
    for (String[] names : baseFont.getFullFontName()) {
      String name = names[3].toLowerCase();
      if (name.indexOf("bold") != -1) {
        style |= Font.BOLD;
      }
      if (name.indexOf("italic") != -1 || name.indexOf("oblique") != -1) {
        style |= Font.ITALIC;
      }
    }
    if (bold) {
      style |= Font.BOLD;
    }
    if (italic) {
      style |= Font.ITALIC;
    }
    if (underline) {
      style |= Font.UNDERLINE;
    }
    float size = font.getCalculatedSize();
    if (script) {
      size *= 0.8f;
    }
    boolean embedded = baseFont.isEmbedded();
    if (encoding == null) {
      encoding = baseFont.getEncoding();
    }
    if (fontName != null) {
      if (fontName.equals("symbol") && familyName.equalsIgnoreCase("arial")) {
        size *= 1.14f;
      }

      familyName = fontName;
      embedded = true;
    }
    return createFont(familyName, size, style, color != null ? color : font.getColor(), encoding);
  }

  /**
   * Returns the index of the next character, which cannot be displayed by the given PDF font.
   * 
   * @param text Text
   * @param baseFont Text font
   * @return Index of the next character, which cannot be displayed
   */
  public static int indexOfNextUnknownChar(String text, BaseFont baseFont) {
    for (int i = 0; i < text.length(); i++) {
      char c = text.charAt(i);
      // finding control characters
      if (c < 0x20) {
        return i;
      }
      // check if font contains the character
      if (!baseFont.charExists(c)) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Returns true, if the character can be display by the Arial and Times New Roman font.
   * 
   * @param c Character
   * @return True, if the character can be displayed
   */
  public static boolean isValidPDFCharacter(char c) {
    return ARIAL_FONT.charExists(c) && TIMES_FONT.charExists(c);
  }

  /**
   * Returns true if there is a replacement character for the given character <tt>c</tt>, false
   * otherwise.
   * 
   * @param c character that is checked for an automatic replacement character
   * @return see above
   */
  public static boolean isReplaceableCharacter(char c) {
    if (charReplacements.containsKey(c)) {
      return true;
    }

    return false;
  }

  /**
   * Returns the replacement character of the given character <tt>c</tt>.
   * 
   * @param c character, which should be replaced
   * @return replacement character of <tt>c</tt>
   */
  public static Character getReplacementCharacter(char c) {
    return charReplacements.get(c);
  }

  public static String convertInvalidCharacters(String text, BaseFont baseFont, boolean allowControlCharacters) {
    if (allowControlCharacters) {
      text = text.replace("\r\n", "\n");
      text = text.replace("\r", "\n");
    }

    StringBuilder sb = new StringBuilder(text.length());
    for (int i = 0; i < text.length(); i++) {
      char c = text.charAt(i);
      // finding control characters
      if (Character.isISOControl(c)) {
        if (allowControlCharacters) {
          sb.append(c);
        } else {
          logger.error("ISO control character not allow 0x" + Integer.toHexString(c));
        }
      }
      // check if font contains the character
      else if (!baseFont.charExists(c)) {
        // check if the replacement map contains the character; if so replace it
        if (charReplacements.containsKey(c)) {
          sb.append(charReplacements.get(c));
        } else {
          logger.error("Character not found \'" + c + "'(0x" + Integer.toHexString(c) + ")");
          sb.append(REPLACEMENT_CHARACTER);
        }
      } else {
        sb.append(c);
      }
    }
    return sb.toString();
  }

  private static char getChar(int current, char cc[], PdfChunk ck[]) {
    if (ck == null) {
      return cc[current];
    }
    return (char) ck[Math.min(current, ck.length - 1)].getUnicodeEquivalent(cc[current]);
  }

  /**
   * Special split character implementation, which doesn't allow any splits.
   */
  public static class NoSplitCharacter implements SplitCharacter {
    /** Thread-safe instance */
    public static final SplitCharacter INSTANCE = new NoSplitCharacter();

    @Override
    public boolean isSplitCharacter(int start, int current, int end, char cc[], PdfChunk ck[]) {
      return false;
    }
  }

  /**
   * Special split character implementation, which allows splits only at whitespaces, see
   * {@link Character#isWhitespace(char)}.
   */
  public static class NoHyphenSplitCharacter implements SplitCharacter {
    /** Thread-safe instance */
    public static final SplitCharacter INSTANCE = new NoHyphenSplitCharacter();

    @Override
    public boolean isSplitCharacter(int start, int current, int end, char cc[], PdfChunk ck[]) {
      return Character.isWhitespace(getChar(current, cc, ck));
    }
  }

  /**
   * Special split character implementation, which allows splits at whitespaces and hyphen symbols.
   * The implementation splits the text only if the parts have defined minimum length.
   */
  public static class SpecialSplitCharacter implements SplitCharacter {
    /** Thread-safe instance */
    public static final SplitCharacter INSTANCE = new SpecialSplitCharacter();

    private static final int MIN_LENGTH = 4;

    /* (non-Javadoc)
     * @see com.lowagie.text.SplitCharacter#isSplitCharacter(int, int, int, char[], com.lowagie.text.pdf.PdfChunk[])
     */
    @Override
    public boolean isSplitCharacter(int start, int current, int end, char cc[], PdfChunk ck[]) {
      char currentChar = getChar(current, cc, ck);
      if (Character.isWhitespace(currentChar)) {
        return true;
      }
      if (current > start) {
        char previousChar = getChar(current - 1, cc, ck);
        if (currentChar == '-') {
          for (int previous = current - 1; previous >= start && (current - previous) < MIN_LENGTH; previous--) {
            previousChar = getChar(previous, cc, ck);
            if (Character.isWhitespace(previousChar) || previousChar == '\u00a0') {
              logger.debug("Prevent split in " + new String(cc).substring(previous, current) + "|" +
                      new String(cc).substring(current, Math.min(current + 10, end)));
              return false;
            }
          }
          return true;
        }
      }
      if (current + 1 < end) {
        char nextChar = getChar(current + 1, cc, ck);
        if ("/".indexOf(currentChar) >= 0 && (Character.isLetterOrDigit(nextChar))) {
          return true;
        }
      }
      return false;
    }
  }

  /**
   * Special split character implementation for which you can defined the symbols, which allows a
   * split in the text.
   */
  public static class DiscretSplitCharacter implements SplitCharacter {
    private final String characters;

    /**
     * Create an instance of the split character
     * 
     * @param characters Characters, which allows a split
     */
    public DiscretSplitCharacter(String characters) {
      this.characters = characters;
    }

    /* (non-Javadoc)
     * @see com.lowagie.text.SplitCharacter#isSplitCharacter(int, int, int, char[], com.lowagie.text.pdf.PdfChunk[])
     */
    @Override
    public boolean isSplitCharacter(int start, int current, int end, char cc[], PdfChunk ck[]) {
      return characters.indexOf(getChar(current, cc, ck)) >= 0;
    }
  }
}
