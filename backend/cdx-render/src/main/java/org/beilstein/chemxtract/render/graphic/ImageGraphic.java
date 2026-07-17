package org.beilstein.chemxtract.render.graphic;

import java.awt.*;
import java.awt.geom.Rectangle2D;
import java.awt.image.ImageObserver;

/**
 * Implementation for graphics, which are based on a {@link Image} instance.
 * 
 * @author stephan
 * @version $Id: ImageGraphic.java,v 1.6 2014-06-12 11:32:55 bsnie Exp $
 */
public class ImageGraphic extends AbstractGraphic {
  private final Image image;
  private final GraphicType type;

  /**
   * Create a graphic instance for the given {@link Image} instance and graphic type.
   * 
   * @param image Image
   * @param type Graphic type
   */
  public ImageGraphic(Image image, GraphicType type) {
    this.image = image;
    this.type = type;
    setOriginalBounds(new Rectangle2D.Float(0, 0, image.getWidth(null), image.getHeight(null)));
  }

  /* (non-Javadoc)
   * @see org.beilstein.chemxtract.render.graphic.Graphic#getType()
   */
  public GraphicType getType() {
    return type;
  }

  /* (non-Javadoc)
   * @see org.beilstein.chemxtract.render.graphic.AbstractGraphic#getImageIntern()
   */
  @Override
  protected Image getImageIntern() {
    return image;
  }

  /* (non-Javadoc)
   * @see org.beilstein.chemxtract.render.graphic.AbstractGraphic#paintIntern(java.awt.Graphics2D)
   */
  @Override
  protected void paintIntern(Graphics2D g) {
    if (image != null) {
      g.drawImage(image, 0, 0, new ImageObserver() {
        public boolean imageUpdate(Image img, int infoflags, int x, int y, int width, int height) {
          return false;
        }
      });
    }
  }
}
