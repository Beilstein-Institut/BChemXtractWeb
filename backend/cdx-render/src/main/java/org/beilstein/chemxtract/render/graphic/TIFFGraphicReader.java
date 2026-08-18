package org.beilstein.chemxtract.render.graphic;

import java.awt.image.BufferedImage;
import java.io.IOException;
import java.io.InputStream;
import java.util.Iterator;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;

/**
 * Reads an embedded TIFF via {@link ImageIO} (JDK 9+ bundles a TIFF plugin),
 * replacing the JAI ({@code com.sun.media.jai.codec}) decoder.
 *
 * <p>Driven through an explicit {@link ImageReader} rather than
 * {@code ImageIO.read} so the header dimensions can be charged to the render's
 * {@link ImagePixelBudget} before a raster is allocated.
 */
public final class TIFFGraphicReader {

  private TIFFGraphicReader() {}

  /**
   * Reads the graphic from an {@link InputStream}
   *
   * @param in {@link InputStream} from which the graphic should be read
   * @param budget Per-render pixel budget; the picture is refused if it does not fit
   * @return Graphic
   * @throws IOException Occurs if the reader couldn't read the graphic from the {@link InputStream}
   */
  public static Graphic readGraphic(InputStream in, ImagePixelBudget budget) throws IOException {
    ImageInputStream imageInput = ImageIO.createImageInputStream(in);
    if (imageInput == null) {
      throw new IOException("Unsupported or corrupt TIFF stream");
    }
    Iterator<ImageReader> it = ImageIO.getImageReaders(imageInput);
    if (!it.hasNext()) {
      throw new IOException("Format not supported");
    }

    ImageReader reader = it.next();
    reader.setInput(imageInput);

    // Reserve heap for this picture from its header, before any raster exists —
    // the declared dimensions come from the file and are not trustworthy.
    budget.claim(reader.getWidth(0), reader.getHeight(0));

    BufferedImage image = reader.read(0);
    if (image == null) {
      throw new IOException("Unsupported or corrupt TIFF stream");
    }
    return new ImageGraphic(image, GraphicType.TIFF);
  }
}
