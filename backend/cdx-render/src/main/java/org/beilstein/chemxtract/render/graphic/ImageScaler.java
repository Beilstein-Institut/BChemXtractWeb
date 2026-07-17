package org.beilstein.chemxtract.render.graphic;

import java.awt.Dimension;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.Transparency;
import java.awt.image.BufferedImage;

import org.imgscalr.Scalr;

import com.mortennobel.imagescaling.MultiStepRescaleOp;
import com.mortennobel.imagescaling.ResampleFilters;
import com.mortennobel.imagescaling.ResampleOp;

import net.coobird.thumbnailator.makers.FixedSizeThumbnailMaker;
import net.coobird.thumbnailator.resizers.DefaultResizerFactory;
import net.coobird.thumbnailator.resizers.Resizer;

public class ImageScaler {
  
  public BufferedImage scale(BufferedImage image, int width, int height, int newWidth, int newHeight) {
    return progressiveJDKScale(image, width, height, newWidth, newHeight);
    //return lanczosResample(image, width, height, newWidth, newHeight);
    //return thumbnailate(image, width, height, newWidth, newHeight);
    //return imgscalr(image, width, height, newWidth, newHeight);
    //return progressiveNobelScale(image, width, height, newWidth, newHeight);
  }
  
  private BufferedImage lanczosResample(BufferedImage image, int width, int height, int newWidth, int newHeight) {
    ResampleOp resizeOp = new ResampleOp(newWidth, newHeight);
    resizeOp.setFilter(ResampleFilters.getLanczos3Filter());
    return resizeOp.filter(image, null);
  }
  
  private BufferedImage thumbnailate(BufferedImage image, int width, int height, int newWidth, int newHeight) {
    Resizer resizer = DefaultResizerFactory.getInstance().getResizer(new Dimension(image.getWidth(), image.getHeight()), new Dimension(newWidth, newHeight));
    return new FixedSizeThumbnailMaker(newWidth, newHeight, false, true).resizer(resizer).make(image);  
  }
  
  private BufferedImage imgscalr(BufferedImage image, int width, int height, int newWidth, int newHeight) {
    return Scalr.resize(image, Scalr.Method.ULTRA_QUALITY, Scalr.Mode.FIT_EXACT, newWidth, newHeight);
  }
  
  private BufferedImage progressiveNobelScale(BufferedImage image, int width, int heigth, int newWidth, int newHeight) {
    return new MultiStepRescaleOp(newWidth, newHeight, RenderingHints.VALUE_INTERPOLATION_BILINEAR).filter(image, null);
  }
  
  private BufferedImage progressiveJDKScale(BufferedImage image, int width, int height, int newWidth, int newHeight) {
    int type = (image.getTransparency() == Transparency.OPAQUE) ? BufferedImage.TYPE_INT_RGB : BufferedImage.TYPE_INT_ARGB;

    BufferedImage scaledImage = image;

    do {
      if (width <= newWidth) {
        // ignore
      } else if (width > newWidth) {
        width /= 2;
        if (width < newWidth) {
          width = newWidth;
        }
      }

      if (height <= newHeight) {
        // ignore
      } else if (height > newHeight) {
        height /= 2;
        if (height < newHeight) {
          height = newHeight;
        }
      }

      BufferedImage temp = new BufferedImage(width, height, type);
      Graphics2D g2 = temp.createGraphics();

      g2.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
      
      g2.drawImage(scaledImage, 0, 0, temp.getWidth(), temp.getHeight(), null);
      g2.dispose();

      scaledImage = temp;
    } while (width != newWidth || height != newHeight);

    return scaledImage;

  }

}
