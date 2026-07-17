package org.beilstein.chemxtract.render.graphic;

import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;

/**
 * Scales a {@link BufferedImage} using Java2D bilinear resampling.
 *
 * <p>Ported to drop the thumbnailator / imagescaling / imgscalr dependencies;
 * embedded raster images in a CDX are scaled with the JDK's own pipeline.
 */
public class ImageScaler {

  public BufferedImage scale(BufferedImage image, int width, int height, int newWidth, int newHeight) {
    if (newWidth <= 0 || newHeight <= 0) {
      return image;
    }
    int type = image.getType() == 0 ? BufferedImage.TYPE_INT_ARGB : image.getType();
    BufferedImage scaled = new BufferedImage(newWidth, newHeight, type);
    Graphics2D g = scaled.createGraphics();
    try {
      g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
      g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
      g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
      g.drawImage(image, 0, 0, newWidth, newHeight, null);
    } finally {
      g.dispose();
    }
    return scaled;
  }
}
