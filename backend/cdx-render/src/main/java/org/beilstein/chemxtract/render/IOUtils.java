package org.beilstein.chemxtract.render;

import java.io.*;
import java.security.*;
import java.util.*;
import java.util.regex.*;
import java.util.zip.*;

import org.apache.commons.logging.*;

/**
 * This class holds various helper methods for the IO package.
 * 
 * @author stephan
 * @version $Id: IOUtils.java,v 1.53 2014-06-12 11:32:57 bsnie Exp $
 */
public class IOUtils {
  private static final Log logger = LogFactory.getLog(IOUtils.class);

  private static final int BUFFER_SIZE = 4096;

  /** Standard Character Encoding. */
  public static final String ENCODING = "UTF-8";

  /** Standard file extension of XML files. */
  public static final String FILE_EXTENSION_XML = ".xml";

  /** Standard file extension of PDF files. */
  public static final String FILE_EXTENSION_PDF = ".pdf";

  /** Standard file extension of HTML files. */
  public static final String FILE_EXTENSION_HTML = ".html";

  /** Default digest flavor for encryption purposes. */
  private static final String DIGEST_FLAVOR = "SHA-1";

  /** RegEx that captures different flavors of line endings. */
  public static final Pattern LINE_END_PATTERN = Pattern.compile("\n\r|\n|\r");

  /** RegEx encoding multiple whitespace characters. */
  private static final Pattern MULTIPLE_WHITESPACE = Pattern.compile("(\\s|\\p{Cntrl})+");
  /** RegEx that captures the first whitespace character of multiple ones. */
  private static final Pattern FIRST_WHITESPACE = Pattern.compile("^((\\s|\\p{Cntrl})+)");
  /** RegEx that captures the last whitespace character of multiple ones. */
  private static final Pattern LAST_WHITESPACE = Pattern.compile("((\\s|\\p{Cntrl})+)$");

  private static final Pattern MASK_PATTERN = Pattern.compile("''|\\\\u\\p{XDigit}\\p{XDigit}\\p{XDigit}\\p{XDigit}|\\\\[^u]");

  /**
   * Returns the file name of complete path, like for example "/dir/file.txt" -> "file.txt".
   * 
   * @param path path that is processed
   * @return file name of the path
   */
  public static String getFile(String path) {
    int index = path.lastIndexOf('/');
    if (index < 0) {
      index = path.lastIndexOf('\\');
      if (index < 0) {
        return path;
      }
    }
    return path.substring(index + 1);
  }

  /**
   * Returns the base name of a file name, like for example "file.txt" -> "file".
   * 
   * @param fileName File name
   * @return Base name of file name
   */
  public static String getBaseName(String fileName) {
    int index = fileName.lastIndexOf('.');
    if (index < 0) {
      return fileName;
    }
    return fileName.substring(0, index);
  }

  /**
   * Returns the extension of a file name, like for example "file.txt" -> "txt".
   * 
   * @param fileName File name
   * @return Extension of the file name
   */
  public static String getExtension(String fileName) {
    int index = fileName.lastIndexOf('.');
    if (index < 0) {
      return "";
    }
    return fileName.substring(index + 1);
  }

  /**
   * Returns the name of a file w/o preceding directories if any.
   * If directories are not part of the filename it is returned unaltered.
   * <p>
   * Examples:
   * "D:\Projects\index.html" -> "index.html"
   * "/export/home/tomcat/toto.txt" -> "toto.txt"
   * "1860-5397-4-10-S1.pdf" -> "1860-5397-4-10-S1.pdf"
   * @param fileName file name
   * @return name of the given filename w/o directories if any
   */
  public static String getFilename(String fileName) {
    int indexUnixSeparator = fileName.lastIndexOf('/');
    int indexWindowsSeparator = fileName.lastIndexOf('\\');

    if (indexUnixSeparator == -1 && indexWindowsSeparator == -1) {
      return fileName;
    } else if (indexUnixSeparator > indexWindowsSeparator) {
      return fileName.substring(indexUnixSeparator + 1);
    } else {
      return fileName.substring(indexWindowsSeparator + 1);
    }
  }

  /**
   * This method ensures that a file extension is lower case.
   * 
   * @param fileName File name
   * @return File name with lower case extension
   */
  public static String getFileNameLowerCaseExtension(String fileName) {
    StringBuilder sb = new StringBuilder();
    sb.append(getBaseName(fileName));
    if (fileName.lastIndexOf('.') != -1) {
      sb.append(".");
    }
    sb.append(getExtension(fileName).toLowerCase());

    return sb.toString();
  }

  /**
   * Read text lines from an {@link InputStream} with the standard encoding (usually UTF8). Closing
   * the stream is not necessary.
   * 
   * @param in InputStream
   * @return text lines from the input stream as an array
   * @throws IOException Occurs if the method cannot read the content from InputStream
   */
  public static String[] readLines(InputStream in) throws IOException {
    List<String> lines = new ArrayList<>();
    BufferedReader bufferedReader = null;
    try {
      bufferedReader = new BufferedReader(new InputStreamReader(in, ENCODING));
      String line = bufferedReader.readLine();
      while (line != null) {
        lines.add(line);
        line = bufferedReader.readLine();
      }
    } finally {
      close(bufferedReader);
    }
    return lines.toArray(new String[lines.size()]);
  }

  /**
   * Read text from a {@link InputStream} with the standard encoding, normally UTF8. Closing the
   * stream is not necessary.
   * 
   * @param in InputStream
   * @return Text from the input stream
   * @throws IOException Occurs if the method cannot read the content from InputStream
   */
  public static String readText(InputStream in) throws IOException {
    StringBuilder text = new StringBuilder();
    Reader reader = null;
    try {
      reader = new InputStreamReader(in, ENCODING);

      int length;
      char[] buffer = new char[BUFFER_SIZE];
      while ((length = reader.read(buffer)) >= 0) {
        text.append(buffer, 0, length);
      }
    } finally {
      close(reader);
    }
    return text.toString();
  }

  /**
   * Write text into an {@link OutputStream} with the standard character encoding. Closing and
   * flushing the stream is not necessary.
   * 
   * @param out OutputStream
   * @param text Text
   * @throws IOException Occurs if the method cannot write the content into the OutputStream
   */
  public static void writeText(OutputStream out, CharSequence text) throws IOException {
    Writer writer = null;
    try {
      writer = new OutputStreamWriter(out, ENCODING);
      writer.write(text.toString());
      writer.flush();
    } finally {
      close(writer);
    }
  }

  /**
   * Read a byte array from an {@link InputStream}. Closing the stream is not necessary.
   * 
   * @param in InputStream
   * @return Byte array
   * @throws IOException Occurs if the method cannot read the content from InputStream
   */
  public static byte[] readBytes(InputStream in) throws IOException {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    copy(in, out);
    return out.toByteArray();
  }

  /**
   * Read a byte array from an {@link InputStream}. Closing the stream is not necessary.
   * 
   * @param in InputStream
   * @param length Expected length of the byte array
   * @return Byte array
   * @throws IOException Occurs if the method cannot read the content from InputStream
   */
  public static byte[] readBytes(InputStream in, int length) throws IOException {
    ByteArrayOutputStream out = new ByteArrayOutputStream(length);
    copy(in, out);
    return out.toByteArray();
  }

  /**
   * Write a byte array to an {@link OutputStream}. Closing and flushing the stream is not
   * necessary.
   * 
   * @param out OutputStream
   * @param data Byte array
   * @throws IOException Occurs if the method cannot write the content into the OutputStream
   */
  public static void writeBytes(OutputStream out, byte[] data) throws IOException {
    try {
      out.write(data);
      out.flush();
    } finally {
      close(out);
    }
  }

  /**
   * Copy the content from an {@link InputStream} to an {@link OutputStream}. Closing and flushing
   * the streams is not necessary.
   * 
   * @param in InputStream
   * @param out OutputStream
   * @throws IOException Occurs if the method cannot read or write the content from the streams
   */
  public static void copy(InputStream in, OutputStream out) throws IOException {
    byte[] buffer = new byte[BUFFER_SIZE];
    try {
      int length;
      while ((length = in.read(buffer)) >= 0) {
        out.write(buffer, 0, length);
      }
      out.flush();
    } finally {
      close(in);
      close(out);
    }
  }

  /**
   * Close an {@link Closeable} object.
   * 
   * @param closable {@link Closeable} instance
   */
  public static void close(Closeable closable) {
    if (closable != null) {
      try {
        closable.close();
      } catch (IOException e) {
        logger.debug("Unable to close stream", e);
      }
    }
  }

  /**
   * Find the given byte array in another byte array
   * 
   * @param bytes Byte array
   * @param pattern Byte array, which must be found
   * @return -1 if the byte array doesn't contain the pattern otherwise the value is the position of
   *         the first byte of the pattern
   */
  public static int findBytes(byte[] bytes, byte[] pattern) {
    outer: for (int j = 0; j < bytes.length - pattern.length; j++) {
      for (int i = 0; i < pattern.length; i++) {
        if (bytes[j + i] != pattern[i]) {
          continue outer;
        }
      }
      return j;
    }
    return -1;
  }

  /**
   * Test if a byte array starts with the given pattern.
   * 
   * @param bytes Byte array
   * @param pattern Pattern
   * @return True, if the byte array starts with the pattern
   */
  public static boolean startsWidthBytes(byte[] bytes, byte[] pattern) {
    if (pattern.length > bytes.length) {
      return false;
    }
    for (int i = 0; i < pattern.length; i++) {
      if (bytes[i] != pattern[i]) {
        return false;
      }
    }
    return true;
  }

  /**
   * Compress a byte array with ZLIB compression.
   * 
   * @param data Uncompressed byte array
   * @return Compressed byte array
   */
  public static byte[] compress(byte[] data) {
    Deflater compresser = new Deflater();
    compresser.setInput(data);
    compresser.finish();

    ByteArrayOutputStream baos = new ByteArrayOutputStream();
    byte[] buffer = new byte[BUFFER_SIZE];
    int length;
    while ((length = compresser.deflate(buffer)) > 0) {
      baos.write(buffer, 0, length);
    }
    return baos.toByteArray();
  }

  /**
   * Uncompress a byte array with the ZLIB compression.
   * 
   * @param data Compressed byte array
   * @return Uncompressed byte array
   * @throws DataFormatException Occurs if the compressed byte array is corrupted
   */
  public static byte[] uncompress(byte[] data) throws DataFormatException {
    Inflater decompresser = new Inflater();
    decompresser.setInput(data, 0, data.length);

    ByteArrayOutputStream baos = new ByteArrayOutputStream();
    byte[] buffer = new byte[BUFFER_SIZE];
    int length;
    while ((length = decompresser.inflate(buffer)) > 0) {
      baos.write(buffer, 0, length);
    }
    decompresser.end();
    return baos.toByteArray();
  }

  /**
   * Generates a SHA-1 digest of a byte array.
   * 
   * @param bytes Byte array
   * @return SHA-1 digest
   */
  public static byte[] getDigest(byte[] bytes) {
    try {
      MessageDigest messageDigest = MessageDigest.getInstance(DIGEST_FLAVOR);

      if (bytes == null) {
        return new byte[messageDigest.getDigestLength()];
      }

      return messageDigest.digest(bytes);
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException("Could not create message digest", e);
    }
  }

  /**
   * Returns the text representation of a file size including the unit.
   * 
   * @param size File size
   * @return Text representation
   */
  public static String getSize(long size) {
    // 1024 * 1024 * 1024
    if (size >= 1073741824) {
      return String.format(Locale.ENGLISH, "%4.1f GB", size / 1073741824.0f);
    }
    // 1024 * 1024
    if (size >= 1048576) {
      return String.format(Locale.ENGLISH, "%4.1f MB", size / 1048576.0f);
    }
    if (size >= 1024) {
      return String.format(Locale.ENGLISH, "%4.1f KB", size / 1024.0f);
    }
    return String.format(Locale.ENGLISH, "%4d B", size);
  }

  /**
   * Takes a given text and returns it as an array of lines.
   * 
   * @param text text that is processed
   * @return array that holds the given text line by line
   */
  public static String[] getTextLines(String text) {
    List<String> textLines = new ArrayList<>();
    Matcher matcher = LINE_END_PATTERN.matcher(text);
    int lastPosition = 0;
    while (matcher.find()) {
      if (lastPosition < matcher.start()) {
        textLines.add(text.substring(lastPosition, matcher.start()));
      }
      lastPosition = matcher.end();
    }
    return textLines.toArray(new String[textLines.size()]);
  }

  /**
   * Carries out some normalization on a given text. This includes: removing trailing white space,
   * removing leading white space, removing multiple consecutive white spaces, and removing control
   * characters.
   * 
   * @param text text that is processed
   * @return normalized text
   */
  public static String normalize(String text) {
    if (text == null) {
      return null;
    }

    Matcher matcher = FIRST_WHITESPACE.matcher(text);
    if (matcher.find()) {
      text = matcher.replaceAll("");
    }

    matcher = LAST_WHITESPACE.matcher(text);
    if (matcher.find()) {
      text = matcher.replaceAll("");
    }

    matcher = MULTIPLE_WHITESPACE.matcher(text);
    if (matcher.find()) {
      text = matcher.replaceAll(" ");
    }

    return text;
  }

  /**
   * Test if the string is null or empty
   * 
   * @param string String
   * @return True if null or empty
   */
  public static boolean isEmpty(String string) {
    return string == null || string.length() <= 0;
  }

  /**
   * Test if the string is not null and not empty
   * 
   * @param string String
   * @return True if not null and not empty
   */
  public static boolean isNotEmpty(String string) {
    return string != null && string.length() > 0;
  }

  /**
   * Test if two string are equal
   * 
   * @param string1 First string
   * @param string2 Second string
   * @return True, if the string are equal
   */
  public static boolean isEqual(String string1, String string2) {
    return isEmpty(string1) ? isEmpty(string2) : string1.equals(string2);
  }

  /**
   * Returns a properties object put to live with the file content backed by the given input stream.
   * 
   * @param inputStream the input stream
   * @return properties loaded from the given input stream, <tt>null</tt> if there is a problem with
   *         loading the properties from the stream
   */
  public static Properties getProperties(InputStream inputStream) {
    if (inputStream == null) {
      logger.debug("Properties are not loaded as the input stream is null");
      return null;
    }
    try {
      Properties properties = new Properties();
      properties.load(inputStream);
      return properties;
    } catch (IOException exception) {
      logger.error("Encountered problem reading properties from input stream", exception);
      return null;
    } finally {
      close(inputStream);
    }
  }

  private static final char symbols[] = { ' ',
          '!',
          '\u2200',
          '#',
          '\u2203',
          '%',
          '&',
          '\u220b',
          '(',
          ')',
          '*',
          '+',
          ',',
          '\u2013',
          '.',
          '/', // 0x20
          '0',
          '1',
          '2',
          '3',
          '4',
          '5',
          '6',
          '7',
          '8',
          '9',
          ':',
          ';',
          '<',
          '=',
          '>',
          '?', // 0x30
          '\u2245',
          '\u0391',
          '\u0392',
          '\u03a7',
          '\u0394',
          '\u0395',
          '\u03a6',
          '\u0393',
          '\u0397',
          '\u0399',
          '\u03d1',
          '\u039a',
          '\u039b',
          '\u039c',
          '\u039d',
          '\u039f', // 0x40
          '\u03a0',
          '\u0398',
          '\u03a1',
          '\u03a3',
          '\u03a4',
          '\u03a5',
          '\u03c2',
          '\u03a9',
          '\u039e',
          '\u03a8',
          '\u0396',
          '[',
          '\u2234',
          ']',
          '\u22a5',
          '_', // 0x50
          '\u0305',
          '\u03b1',
          '\u03b2',
          '\u03c7',
          '\u03b4',
          '\u03b5',
          '\u03d5',
          '\u03b3',
          '\u03b7',
          '\u03b9',
          '\u03c6',
          '\u03ba',
          '\u03bb',
          '\u03bc',
          '\u03bd',
          '\u03bf', // 0x60
          '\u03c0',
          '\u03b8',
          '\u03c1',
          '\u03c3',
          '\u03c4',
          '\u03c5',
          '\u03d6',
          '\u03c9',
          '\u03be',
          '\u03c8',
          '\u03b6',
          '{',
          '|',
          '}',
          '~',
          '\0', // 0x70
          '\0',
          '\0',
          '\0',
          '\0',
          '\0',
          '\0',
          '\0',
          '\0',
          '\0',
          '\0',
          '\0',
          '\0',
          '\0',
          '\0',
          '\0',
          '\0', // 0x80
          '\0',
          '\0',
          '\0',
          '\0',
          '\0',
          '\0',
          '\0',
          '\0',
          '\0',
          '\0',
          '\0',
          '\0',
          '\0',
          '\0',
          '\0',
          '\0', // 0x90
          '\u20ac',
          '\u03d2',
          '\u2032',
          '\u2264',
          '\u2044',
          '\u221e',
          '\u0192',
          '\u2663',
          '\u2666',
          '\u2665',
          '\u2660',
          '\u2194',
          '\u2190',
          '\u2191',
          '\u2192',
          '\u2193', // 0xa0
          '\u00b0',
          '\u00b1',
          '\u2033',
          '\u2265',
          '\u00d7',
          '\u221d',
          '\u2202',
          '\u2022',
          '\u00f7',
          '\u2260',
          '\u2261',
          '\u2248',
          '\u2026',
          '\u2502',
          '\u2500',
          '\u21b5', // 0xb0
          '\u2135',
          '\u2111',
          '\u211c',
          '\u2118',
          '\u2297',
          '\u2295',
          '\u2205',
          '\u2229',
          '\u222a',
          '\u2283',
          '\u2287',
          '\u2284',
          '\u2282',
          '\u2286',
          '\u2208',
          '\u2209', // 0xc0 
          '\u2220',
          '\u2207',
          '\u00ae',
          '\u00a9',
          '\u2122',
          '\u220f',
          '\u221a',
          '\u2022',
          '\u00ac',
          '\u2227',
          '\u2228',
          '\u21d4',
          '\u21d0',
          '\u21d1',
          '\u21d2',
          '\u21d3', // 0xd0 
          '\u25ca',
          '\u2329',
          '\u00ae',
          '\u00a9',
          '\u2122',
          '\u2211',
          '\u239b',
          '\u239c',
          '\u239d',
          '\u23a1',
          '\u23a2',
          '\u23a3',
          '\u23a7',
          '\u23a8',
          '\u23a9',
          '\u23aa', // 0xe0
          '\0',
          '\u232a',
          '\u222b',
          '\u2320',
          '\u23ae',
          '\u2321',
          '\u239e',
          '\u239f',
          '\u23a0',
          '\u23a4',
          '\u23a5',
          '\u23a6',
          '\u23ab',
          '\u23ac',
          '\u23ad',
          '\0' // 0xf0 
  };

  /**
   * Convert a character encoded with the Microsoft Symbol font.
   * 
   * @param c Character in Symbol
   * @return Unicode character
   */
  public static char convertSymbolChar(char c) {
    // convert unicode block 'private use' used in partly in Word
    if (c >= 0xf000 && c <= 0xf0ff) {
      c = (char) (c - 0xf000);
    }

    if (c < 0x20 || c - 0x20 >= symbols.length) {
      return c;
    }
    char symbol = symbols[c - 32];
    if (symbol >= 0x20) {
      if (logger.isDebugEnabled()) {
        logger.debug("Convert symbol character " + c + "(" + ((int) c) + "/0x" + Integer.toHexString(c) + ") to character \\u" +
                Integer.toHexString(symbol));
      }
    } else {
      if (logger.isWarnEnabled()) {
        logger.warn("Cannot convert symbol character " + c + "(" + ((int) c) + "/0x" + Integer.toHexString(c) + ")");
      }
    }
    return symbol;
  }

  /**
   * Convert a string encoded with the Microsoft Symbol font.
   * 
   * @param string String encoding with the Symbol font
   * @return Unicode string
   */
  public static String convertSymbolString(CharSequence string) {
    StringBuilder text = new StringBuilder();
    for (int index = 0; index < string.length(); index++) {
      char c = string.charAt(index);
      text.append(convertSymbolChar(c));
    }
    return text.toString();
  }

  private static final char wingdings[] = { '\u0020',
          '\u270f',
          '\u2702',
          '\u2701',
          '\0',
          '\0',
          '\0',
          '\0',
          '\u260e',
          '\u2706',
          '\u2709',
          '\0',
          '\0',
          '\0',
          '\0',
          '\0', // 0x20
          '\0',
          '\0',
          '\0',
          '\0',
          '\0',
          '\0',
          '\u231b',
          '\u2328',
          '\0',
          '\0',
          '\0',
          '\0',
          '\0',
          '\0',
          '\u2707',
          '\u270d', // 0x30
          '\0',
          '\u270c',
          '\0',
          '\0',
          '\0',
          '\u261c',
          '\u261e',
          '\u261d',
          '\u261f',
          '\0',
          '\u263a',
          '\0',
          '\u2639',
          '\0',
          '\u2620',
          '\u2690', // 0x40
          '\0',
          '\u2708',
          '\u263c',
          '\0',
          '\u2744',
          '\0',
          '\u271e',
          '\0',
          '\u2720',
          '\u2721',
          '\u262a',
          '\u262f',
          '\u0950',
          '\u2638',
          '\u2648',
          '\u2649', // 0x50
          '\u264a',
          '\u264b',
          '\u264c',
          '\u264d',
          '\u264e',
          '\u264f',
          '\u2650',
          '\u2651',
          '\u2652',
          '\u2653',
          '&',
          '&',
          '\u25cf',
          '\u274d',
          '\u25a0',
          '\u25a1', // 0x60
          '\0',
          '\u2751',
          '\u2752',
          '\0',
          '\u2666',
          '\u25c6',
          '\u2756',
          '\0',
          '\u2327',
          '\u2353',
          '\u2318',
          '\u2740',
          '\u273f',
          '\u275d',
          '\u275e',
          '\u25af', // 0x70
          '\u24ea',
          '\u2460',
          '\u2461',
          '\u2462',
          '\u2463',
          '\u2464',
          '\u2465',
          '\u2466',
          '\u2467',
          '\u2468',
          '\u2469',
          '\u24ff',
          '\u2776',
          '\u2777',
          '\u2778',
          '\u2779', // 0x80
          '\u277a',
          '\u277b',
          '\u277c',
          '\u277d',
          '\u277e',
          '\u277f',
          '\0',
          '\0',
          '\0',
          '\0',
          '\0',
          '\0',
          '\0',
          '\0',
          '\u00b7',
          '\u2022', // 0x90
          '\u25aa',
          '\u25cb',
          '\0',
          '\0',
          '\u25c9',
          '\u25ce',
          '\0',
          '\u25aa',
          '\u25fb',
          '\0',
          '\u2726',
          '\u2605',
          '\u2736',
          '\u2734',
          '\u2739',
          '\u2735', // 0xa0
          '\0',
          '\u2316',
          '\u2727',
          '\u2311',
          '\0',
          '\u272a',
          '\u2730',
          '\0',
          '\0',
          '\0',
          '\0',
          '\0',
          '\0',
          '\0',
          '\0',
          '\0', // 0xb0
          '\0',
          '\0',
          '\0',
          '\0',
          '\0',
          '\0',
          '\0',
          '\0',
          '\0',
          '\0',
          '\0',
          '\0',
          '\0',
          '\0',
          '\0',
          '\0', // 0xc0 
          '\0',
          '\0',
          '\0',
          '\0',
          '\0',
          '\u232b',
          '\u2326',
          '\0',
          '\u27a2',
          '\0',
          '\0',
          '\0',
          '\u27b2',
          '\0',
          '\0',
          '\u2190', // 0xd0 
          '\u2192',
          '\u2191',
          '\u2193',
          '\u2196',
          '\u2197',
          '\u2199',
          '\u2198',
          '\0',
          '\u2794',
          '\0',
          '\0',
          '\0',
          '\0',
          '\0',
          '\0',
          '\u21e6', // 0xe0
          '\u21e8',
          '\u21e7',
          '\u21e9',
          '\u2b04',
          '\u21f3',
          '\u2b00',
          '\u2b01',
          '\u2b03',
          '\u2b02',
          '\u25ad',
          '\u25ab',
          '\u2717',
          '\u2713',
          '\u2612',
          '\u2611',
          '\0' // 0xf0 
  };

  /**
   * Convert a character encoded with the Microsoft Wingdings font.
   * 
   * @param c Character in Wingdings
   * @return Unicode character
   */
  private static char convertWingdingsChar(char c) {
    // convert unicode block 'private use' used in partly in Word
    if (c >= 0xf000 && c <= 0xf0ff) {
      c = (char) (c - 0xf000);
    }

    if (c < 0x20 || c - 0x20 >= wingdings.length) {
      return c;
    }
    char wingding = wingdings[c - 32];
    if (wingding >= 0x20) {
      if (logger.isDebugEnabled()) {
        logger.debug("Convert wingding character " + c + "(" + ((int) c) + "/0x" + Integer.toHexString(c) + ") to unitcode character \\u" +
                Integer.toHexString(wingding));
      }
    } else {
      if (logger.isWarnEnabled()) {
        logger.warn("Cannot convert wingding character  " + c + "(" + ((int) c) + "/0x" + Integer.toHexString(c) + ")");
      }
    }
    return wingding;
  }

  /**
   * Convert a string encoded with the Microsoft Wingdings font.
   * 
   * @param string String encoding with the Wingdings font
   * @return Unicode string
   */
  public static String convertWingdingsString(CharSequence string) {
    StringBuilder text = new StringBuilder();
    for (int index = 0; index < string.length(); index++) {
      char c = string.charAt(index);
      text.append(convertWingdingsChar(c));
    }
    return text.toString();
  }

  /**
   * Convert a String into a Float
   * 
   * @param value String
   * @return Float
   */
  public static float convertFloat(String value) {
    return Float.parseFloat(value);
  }

  /**
   * Convert a String into a Integer.
   * 
   * @param value String
   * @return Integer
   */
  public static int convertInt(String value) {
    return Integer.parseInt(value);
  }

  /**
   * Convert a String into a boolean.
   * 
   * @param value String
   * @return boolean
   */
  public static boolean convertBoolean(String value) {
    return value != null && (value.equalsIgnoreCase("yes") || value.equalsIgnoreCase("true"));
  }

  /**
   * Convert a boolean into a String.
   * 
   * @param value boolean
   * @return String
   */

  public static String convertBoolean(boolean value) {
    return value ? "yes" : "no";
  }

  /**
   * Convert a String, which contains a array of Float values into an array.
   * 
   * @param value String
   * @return Float array
   */
  public static float[] convertFloatArray(String value) {
    if (value == null) {
      return null;
    }

    String[] parts = value.split(",");
    List<Float> list = new ArrayList<>(parts.length);
    for (int i = 0; i < parts.length; i++) {
      String part = parts[i].trim();
      if (isNotEmpty(part)) {
        try {
          list.add(Float.parseFloat(part));
        } catch (NumberFormatException e) {
          logger.debug("Cannot convert value " + part, e);
        }
      }
    }
    float[] array = new float[list.size()];
    int i = 0;
    for (float part : list) {
      array[i] = part;
      i++;
    }
    return array;
  }

  /**
   * Convert a Float array to a String.
   * 
   * @param value Float array
   * @return String
   */
  public static String convertFloatArray(float[] value) {
    if (value == null) {
      return null;
    }

    StringBuilder text = new StringBuilder();
    for (float part : value) {
      if (text.length() > 0) {
        text.append(",");
      }
      text.append(part);
    }
    return text.toString();
  }

  /**
   * Convert a String, which contains a array of Integer values into an array.
   * 
   * @param value String
   * @return Float array
   */
  public static int[] convertIntArray(String value) {
    if (value == null) {
      return null;
    }

    String[] parts = value.split(",");
    List<Integer> list = new ArrayList<>(parts.length);
    for (int i = 0; i < parts.length; i++) {
      String part = parts[i].trim();
      if (isNotEmpty(part)) {
        try {
          list.add(Integer.parseInt(part));
        } catch (NumberFormatException e) {
          logger.debug("Cannot convert value " + part, e);
        }
      }
    }
    int[] array = new int[list.size()];
    int i = 0;
    for (int part : list) {
      array[i] = part;
      i++;
    }
    return array;
  }

  /**
   * Convert an Integer array to a String
   * 
   * @param value Integer array
   * @return String
   */
  public static String convertIntArray(int[] value) {
    if (value == null) {
      return null;
    }

    StringBuilder text = new StringBuilder();
    for (int part : value) {
      if (text.length() > 0) {
        text.append(",");
      }
      text.append(part);
    }
    return text.toString();
  }

  /**
   * Test if an array of Strings contain a given String.
   * 
   * @param string String to test for
   * @param array Array of Strings
   * @return True, if the array contains the String
   */
  public static boolean containsString(String string, String[] array) {
    for (String element : array) {
      if (element.equalsIgnoreCase(string)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Tests if the a String starts with one of prefixes in an array
   * 
   * @param string String to test for
   * @param array Array of prefixes
   * @return True, if a prefix is found
   */
  public static boolean startsWithString(String string, String[] array) {
    for (String element : array) {
      if (string.length() >= element.length() && string.substring(0, element.length()).equalsIgnoreCase(element)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Unmask text for the property format.
   */
  public static String unmaskPropertyText(CharSequence text) {
    StringBuilder unmaskedText = new StringBuilder();
    if (text == null) {
      return null;
    }
    Matcher matcher = MASK_PATTERN.matcher(text);
    int position = 0;
    while (position < text.length()) {
      matcher.region(position, text.length());
      if (matcher.lookingAt()) {
        String result = matcher.group();
        if (result.startsWith("\\u")) {
          char value = (char) Integer.parseInt(result.substring(2), 16);
          unmaskedText.append(value);
        } else {
          unmaskedText.append(result.substring(1));
        }
        position += result.length();
      } else {
        unmaskedText.append(text.charAt(position));
        position++;
      }
    }
    return unmaskedText.toString();
  }

  /**
   * Mask text for the properties format.
   */
  public static String maskPropertyText(CharSequence text) {
    StringBuilder sb = new StringBuilder();
    if (text == null) {
      return null;
    }
    for (int index = 0; index < text.length(); index++) {
      char c = text.charAt(index);
      if (c == '\'') {
        sb.append("''");
      } else if (c == '"' || c == '{' || c == '}' || c == '\\') {
        sb.append("\\").append(c);
      } else if (c < 0x20 || c >= 0x80) {
        String hexString = Integer.toHexString(c);
        sb.append("\\u").append("0000".substring(Math.min(4, hexString.length()))).append(hexString);
      } else {
        sb.append(c);
      }
    }
    return sb.toString();
  }

  /**
   * Escape non-latin characters and control characters
   * 
   * @param text Original text
   * @return Text with masked characters
   */
  public static String maskText(CharSequence text) {
    StringBuilder sb = new StringBuilder();
    if (text == null) {
      return null;
    }
    for (int index = 0; index < text.length(); index++) {
      char c = text.charAt(index);
      if (c < 0x20 || c > 0x7f) {
        String hexString = Integer.toHexString(c);
        sb.append("\\u").append("0000".substring(Math.min(4, hexString.length()))).append(hexString);
      } else {
        sb.append(c);
      }
    }
    return sb.toString();
  }

  /**
   * Convert a byte array to a hex-decimal string.
   * 
   * @param bytes Byte array
   * @return Hex-decimal representation of the byte array
   */
  public static String toHexString(byte[] bytes) {
    StringBuilder text = new StringBuilder();
    for (byte b : bytes) {
      if (text.length() > 0) {
        text.append(" ");
      }
      String hexString = Integer.toHexString(b & 0xff);
      text.append("00".substring(hexString.length()));
      text.append(hexString);
    }
    return text.toString();
  }

  /**
   * Creates and returns a copy of a specific object.
   * 
   * @param <T> Type of original object
   * @param object Original object
   * @return The clone object
   */
  @SuppressWarnings("unchecked")
  public static <T> T cloneObject(T object) throws IOException {
    try {
      ByteArrayOutputStream baos = new ByteArrayOutputStream();
      ObjectOutputStream

      oos = new ObjectOutputStream(baos);

      oos.writeObject(object);
      oos.flush();
      oos.close();

      ByteArrayInputStream bais = new ByteArrayInputStream(baos.toByteArray());
      ObjectInputStream ois = new ObjectInputStream(bais);
      T clone = (T) ois.readObject();
      ois.close();

      return clone;
    } catch (IOException | ClassNotFoundException e) {
      throw new IOException("Cannot clone object:" + object, e);
    }
  }

}
