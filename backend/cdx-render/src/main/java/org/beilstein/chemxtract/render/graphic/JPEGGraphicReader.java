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
 * Graphic reader for the Jpeg graphic format.
 * 
 * @author stephan
 * @version $Id: JPEGGraphicReader.java,v 1.9 2014-06-12 11:32:56 bsnie Exp $
 */
public class JPEGGraphicReader {
  private static final Log logger = LogFactory.getLog(JPEGGraphicReader.class);

  /**
   * Reads the graphic from an {@link InputStream}
   * 
   * @param in {@link InputStream} from which the graphic should be read
   * @return Graphic
   * @throws IOException Occurs if the reader couldn't read the graphic from the {@link InputStream}
   */
  public static Graphic readGraphic(InputStream in) throws IOException {
    // get a reader that can read this bitmap type
    Iterator<ImageReader> it = ImageIO.getImageReadersByMIMEType(GraphicType.JPEG.getMimeType());
    if (!it.hasNext()) {
      throw new IOException("Format not supported");
    }

    ImageReader reader = it.next();
    ImageInputStream imageInput = ImageIO.createImageInputStream(in);
    reader.setInput(imageInput);

    IIOMetadata metadata = reader.getImageMetadata(0);
    String formatName = metadata.getNativeMetadataFormatName();
    IIOMetadataNode rootNode = (IIOMetadataNode) metadata.getAsTree(formatName);

    int[] resolution = { GraphicUtils.STANDARD_RESOLUTION, GraphicUtils.STANDARD_RESOLUTION };
    try {
      XPath xpath = XPathFactory.newInstance().newXPath();

      IIOMetadataNode node = (IIOMetadataNode) xpath.evaluate("JPEGvariety/app0JFIF", rootNode, XPathConstants.NODE);
      if (node != null && node.hasAttribute("resUnits") && node.getAttribute("resUnits").equals("1")) {
        if (node.hasAttribute("Xdensity")) {
          int value = Math.round(Float.parseFloat(node.getAttribute("Xdensity")));
          if (value > 0) {
            resolution[0] = value;
          }
        }
        if (node.hasAttribute("Ydensity")) {
          int value = Math.round(Float.parseFloat(node.getAttribute("Ydensity")));
          if (value > 0) {
            resolution[1] = value;
          }
        }
      }
    } catch (XPathExpressionException e) {
      logger.error("Could not read metadata", e);
    }

    BufferedImage image = reader.read(0);
    if (image == null) {
      throw new IOException("Could not read image");
    }

    ImageGraphic graphic = new ImageGraphic(image, GraphicType.JPEG);
    // set new bounds depending of the resolution
    Rectangle2D.Float bounds = new Rectangle2D.Float();
    bounds.setFrame(graphic.getBounds());
    bounds.width = bounds.width * GraphicUtils.STANDARD_RESOLUTION / resolution[0];
    bounds.height = bounds.height * GraphicUtils.STANDARD_RESOLUTION / resolution[1];
    graphic.setBounds(bounds);
    return graphic;
  }
}
