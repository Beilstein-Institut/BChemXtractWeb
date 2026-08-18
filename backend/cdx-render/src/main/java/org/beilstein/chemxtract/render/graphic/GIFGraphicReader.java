package org.beilstein.chemxtract.render.graphic;

import java.awt.image.BufferedImage;
import java.io.*;
import java.util.Iterator;

import javax.imageio.*;
import javax.imageio.stream.ImageInputStream;

/**
 * Graphic reader for the GIF graphic format.
 * 
 * @author stephan
 * @version $Id: GIFGraphicReader.java,v 1.7 2014-06-12 11:32:55 bsnie Exp $
 */
public class GIFGraphicReader {
  /**
   * Reads the graphic from an {@link InputStream}
   * 
   * @param in {@link InputStream} from which the graphic should be read
   * @param budget Per-render pixel budget; the picture is refused if it does not fit
   * @return Graphic
   * @throws IOException Occurs if the reader couldn't read the graphic from the {@link InputStream}
   */
  public static Graphic readGraphic(InputStream in, ImagePixelBudget budget) throws IOException {
    // get a reader that can read this bitmap type
    Iterator<ImageReader> it = ImageIO.getImageReadersByMIMEType(GraphicType.GIF.getMimeType());
    if (!it.hasNext()) {
      throw new IOException("Format not supported");
    }

    ImageReader reader = it.next();
    ImageInputStream imageInput = ImageIO.createImageInputStream(in);
    reader.setInput(imageInput);

    // Reserve heap for this picture from its header, before any raster exists —
    // the declared dimensions come from the file and are not trustworthy.
    budget.claim(reader.getWidth(0), reader.getHeight(0));

    BufferedImage image = reader.read(0);
    if (image == null) {
      throw new IOException("Could not read image");
    }

    return new ImageGraphic(image, GraphicType.GIF);
  }
}