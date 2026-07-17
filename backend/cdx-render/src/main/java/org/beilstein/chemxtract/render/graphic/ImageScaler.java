package org.beilstein.chemxtract.render.graphic;

import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;

/**
 * Scales a {@link BufferedImage} using Java2D bilinear resampling.
 *
 * <p>Ported to drop the thumbnailator / imagescaling / imgscalr dependencies;
 * embedded raster images in a CDX are scaled with the JDK's own pipeline.
 *
 * <p>When shrinking to less than half the source size in either dimension, a
 * single bilinear {@code drawImage} pass aliases badly. This reproduces the
 * upstream progressive-halving approach: repeatedly downscale by at most 2x
 * per step (each step itself bilinear) until the target size is reached,
 * which keeps each individual resampling step in the interpolation kernel's
 * effective range. Upscaling and mild downscaling still use a single pass.
 */
public class ImageScaler {

  public BufferedImage scale(BufferedImage image, int width, int height, int newWidth, int newHeight) {
    if (newWidth <= 0 || newHeight <= 0) {
      return image;
    }
    int type = image.getType() == 0 ? BufferedImage.TYPE_INT_ARGB : image.getType();

    if (newWidth < width / 2 || newHeight < height / 2) {
      return progressiveScale(image, width, height, newWidth, newHeight, type);
    }
    return bilinearPass(image, newWidth, newHeight, type);
  }

  /**
   * Downscales in repeated halving steps (each step at most halving, bilinear) until the exact
   * target size is reached.
   */
  private BufferedImage progressiveScale(BufferedImage image, int width, int height, int newWidth, int newHeight,
          int type) {
    BufferedImage ret = image;
    int w = width;
    int h = height;
    do {
      if (w > newWidth) {
        w /= 2;
        if (w < newWidth) {
          w = newWidth;
        }
      }
      if (h > newHeight) {
        h /= 2;
        if (h < newHeight) {
          h = newHeight;
        }
      }
      ret = bilinearPass(ret, w, h, type);
    } while (w != newWidth || h != newHeight);
    return ret;
  }

  private BufferedImage bilinearPass(BufferedImage image, int newWidth, int newHeight, int type) {
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
