package org.beilstein.chemxtract.render.graphic;

import java.io.InputStream;
import java.io.IOException;
import javax.media.jai.*;

import com.sun.media.jai.codec.MemoryCacheSeekableStream;

/**
 * Graphic reader for the TIFF graphic format.
 * 
 * @author stephan
 * @version $Id: TIFFGraphicReader.java,v 1.5 2014-06-12 11:32:56 bsnie Exp $
 */
public class TIFFGraphicReader {
  /**
   * Reads the graphic from an {@link InputStream}
   * 
   * @param in {@link InputStream} from which the graphic should be read
   * @return Graphic
   * @throws IOException Occurs if an exception occur during the generation of the graphic
   */
  public static Graphic readGraphic(InputStream in) throws IOException {
    RenderedOp image = JAI.create("tiff", new MemoryCacheSeekableStream(in));

    if (image == null) {
      throw new IOException("Could not read image");
    }

    return new ImageGraphic(GraphicUtils.convertRenderedImage(image), GraphicType.TIFF);
  }
}
