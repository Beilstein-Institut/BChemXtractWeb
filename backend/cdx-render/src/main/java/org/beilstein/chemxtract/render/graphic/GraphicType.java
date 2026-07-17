package org.beilstein.chemxtract.render.graphic;

import java.util.*;

/**
 * Enumeration of all types of graphic types.
 * 
 * @author stephan
 * @version $Id: GraphicType.java,v 1.14 2014-06-12 11:32:56 bsnie Exp $
 */
public enum GraphicType{
  /** Graphic type for GIF graphics. */
  GIF(false,"image/gif","gif"),
  /** Graphic type for Jpeg graphics. */
  JPEG(false,"image/jpeg","jpg","jpeg"),
  /** Graphic type for PNG graphics. */
  PNG(false,"image/png","png"),
  /** Graphic type for BMP graphics. */
  BMP(false,"image/bmp","bmp"),
  /** Graphic type for TIFF graphics. */
  TIFF(false,"image/tiff","tif","tiff"),
  /** Graphic type for SVG graphics. */
  SVG(true,"image/svg+xml","svg"),
  /** Graphic type for MathML graphics. */
  MATHML(true,"application/mathml+xml","mml"),
  /** Graphic type for Windows Metafile graphics. */
  WMF(true,"image/x-wmf","wmf"),
  /** Graphic type for Windows Enhanced Metafile graphics. */
  EMF(true,"image/x-emf","emf"),
  /** Graphic type for QuickDraw(PICT) graphics. */
  PICT(true,"image/pict","pct"),
  /** Graphic type for ChemDraw graphics. */
  CDX(true,"chemical/x-cdx","cdx"),
  /** Graphic type for ChemDraw XML graphics. */
  CDXML(true,"application/vnd.chemdraw+xml","cdxml"),
  /** Graphic type for PDF graphics. */
  PDF(true,"application/pdf","pdf"),
  /** Graphic type for EPS graphics. */
  EPS(true,"application/postscript","eps");

  private final List<String> extensions;
  private final String mimeType;
  private final boolean vector;

  private GraphicType(boolean vector, String mimeType, String...extensions) {
    if (extensions == null || extensions.length <= 0) {
      throw new IllegalArgumentException();
    }
    this.extensions = Collections.unmodifiableList(Arrays.asList(extensions));
    this.mimeType = mimeType;
    this.vector = vector;
  }

  /**
   * Returns the file extensions for this graphic type.
   * 
   * @return Possible file extension
   */
  public List<String> getExtensions() {
    return extensions;
  }

  /**
   * Returns the standard file extension for this graphic type.
   * 
   * @return Standard file extension
   */
  public String getStandardExtension() {
    return extensions.get(0);
  }

  /**
   * Returns the mime type of this graphic type.
   * 
   * @return Mime type
   */
  public String getMimeType() {
    return mimeType;
  }

  /**
   * Returns true, if the graphic format is a vector format.
   * 
   * @return True, if the graphic format is a vector format
   */
  public boolean isVector() {
    return vector;
  }

  /**
   * Returns true, if the graphic format is a Chemdraw file.
   * 
   * @return True, if the graphic format is a Chemdraw file.
   */
  public boolean isChemical() {
    return (this == CDX || this == CDXML);
  }
  
  /**
   * Returns the graphic type for a given file extension. The case of the extension will be tested
   * case-insensitive.
   * 
   * @param extension File extension
   * @return Graphic type
   */
  public static GraphicType getGraphicTypeForExtension(String extension) {
    for (GraphicType graphicType : values()) {
      for (String extension2 : graphicType.getExtensions()) {
        if (extension2.equalsIgnoreCase(extension)) {
          return graphicType;
        }
      }
    }
    return null;
  }

  /**
   * Returns the graphic type for a given mime type
   * 
   * @param mimeType Mime type
   * @return Graphic type
   */
  public static GraphicType getGraphicTypeForMimeType(String mimeType) {
    for (GraphicType graphicType : values()) {
      if (graphicType.getMimeType().equals(mimeType)) {
        return graphicType;
      }
    }
    return null;
  }

}
