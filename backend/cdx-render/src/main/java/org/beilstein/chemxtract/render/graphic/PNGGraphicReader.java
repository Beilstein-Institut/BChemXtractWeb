package org.beilstein.chemxtract.render.graphic;

import java.awt.geom.Rectangle2D;
import java.awt.image.BufferedImage;
import java.io.*;
import java.util.Iterator;

import javax.imageio.*;
import javax.imageio.metadata.*;
import javax.imageio.stream.ImageInputStream;
import javax.xml.xpath.*;

import org.apache.commons.logging.*;

/**
 * Graphic reader for the PNG graphic format.
 * 
 * @author stephan
 * @version $Id: PNGGraphicReader.java,v 1.8 2014-06-12 11:32:55 bsnie Exp $
 */
public class PNGGraphicReader {
  private static final Log logger = LogFactory.getLog(PNGGraphicReader.class);

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
    Iterator<ImageReader> it = ImageIO.getImageReadersByMIMEType(GraphicType.PNG.getMimeType());
    if (!it.hasNext()) {
      throw new IOException("Format not supported");
    }

    ImageReader reader = it.next();
    ImageInputStream imageInput = ImageIO.createImageInputStream(in);
    reader.setInput(imageInput);

    // Reserve heap for this picture from its header, before any raster exists —
    // the declared dimensions come from the file and are not trustworthy.
    budget.claim(reader.getWidth(0), reader.getHeight(0));

    IIOMetadata metadata = reader.getImageMetadata(0);
    String formatName = metadata.getNativeMetadataFormatName();
    IIOMetadataNode rootNode = (IIOMetadataNode) metadata.getAsTree(formatName);

    int[] resolution = { GraphicUtils.STANDARD_RESOLUTION, GraphicUtils.STANDARD_RESOLUTION };
    try {
      XPath xpath = XPathFactory.newInstance().newXPath();

      IIOMetadataNode node = (IIOMetadataNode) xpath.evaluate("pHYs", rootNode, XPathConstants.NODE);
      if (node != null) {
        if (node.hasAttribute("pixelsPerUnitXAxis")) {
          resolution[0] = Math.round(Float.parseFloat(node.getAttribute("pixelsPerUnitXAxis")) * 0.0254f);
        }
        if (node.hasAttribute("pixelsPerUnitYAxis")) {
          resolution[1] = Math.round(Float.parseFloat(node.getAttribute("pixelsPerUnitYAxis")) * 0.0254f);
        }
      }
    } catch (XPathExpressionException e) {
      logger.error("Could not read metadata", e);
    }

    BufferedImage image = reader.read(0);
    if (image == null) {
      throw new IOException("Could not read image");
    }

    ImageGraphic graphic = new ImageGraphic(image, GraphicType.PNG);
    // set new bounds depending of the resolution
    Rectangle2D.Float bounds = new Rectangle2D.Float();
    bounds.setFrame(graphic.getBounds());
    bounds.width = bounds.width * GraphicUtils.STANDARD_RESOLUTION / resolution[0];
    bounds.height = bounds.height * GraphicUtils.STANDARD_RESOLUTION / resolution[1];
    graphic.setBounds(bounds);
    return graphic;
  }
}
