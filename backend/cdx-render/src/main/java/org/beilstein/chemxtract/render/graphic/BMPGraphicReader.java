package org.beilstein.chemxtract.render.graphic;

import java.awt.image.BufferedImage;
import java.io.*;
import java.util.Iterator;

import javax.imageio.*;
import javax.imageio.stream.ImageInputStream;

import org.apache.commons.logging.*;

/**
 * Graphic reader for the graphic format BMP.
 * 
 * @author stephan
 * @version $Id: BMPGraphicReader.java,v 1.7 2014-06-12 11:32:55 bsnie Exp $
 */
public class BMPGraphicReader {
  private static final Log logger = LogFactory.getLog(BMPGraphicReader.class);

  /**
   * Reads the graphic from an {@link InputStream}
   * 
   * @param in {@link InputStream} from which the graphic should be read
   * @param budget Per-render pixel budget; the picture is refused if it does not fit
   * @return Graphic
   * @throws IOException Occurs if the reader couldn't read the graphic from the {@link InputStream}
   * @throws IOException Occurs if an exception occur during the generation of the graphic
   */
  public static Graphic readGraphic(InputStream in, ImagePixelBudget budget) throws IOException {
    // get a reader that can read this bitmap type
    Iterator<ImageReader> it = ImageIO.getImageReadersByMIMEType(GraphicType.BMP.getMimeType());
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

    return new ImageGraphic(image, GraphicType.BMP);
  }
}
