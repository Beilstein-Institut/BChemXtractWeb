package org.beilstein.chemxtract.render.graphic;

import java.awt.image.BufferedImage;
import java.io.IOException;
import java.io.InputStream;

import javax.imageio.ImageIO;

/**
 * Reads an embedded TIFF via {@link ImageIO} (JDK 9+ bundles a TIFF plugin),
 * replacing the JAI ({@code com.sun.media.jai.codec}) decoder.
 */
public final class TIFFGraphicReader {

  private TIFFGraphicReader() {}

  public static Graphic readGraphic(InputStream in) throws IOException {
    BufferedImage image = ImageIO.read(in);
    if (image == null) {
      throw new IOException("Unsupported or corrupt TIFF stream");
    }
    return new ImageGraphic(image, GraphicType.TIFF);
  }
}
