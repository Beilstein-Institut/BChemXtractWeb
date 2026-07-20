package org.beilstein.chemxtract.render.graphic;

import java.awt.*;
import java.awt.geom.*;
import java.io.IOException;

/**
 * Abstract implementation of {@link Graphic}, which takes care of the re-scaling and cropping of
 * graphics.
 * 
 * @author stephan
 * @version $Id: AbstractGraphic.java,v 1.7 2014-06-12 11:32:56 bsnie Exp $
 */
public abstract class AbstractGraphic implements Graphic {
  private Rectangle2D bounds;
  private Rectangle2D originalBounds;
  private float cropTop = 0f;
  private float cropBottom = 0f;
  private float cropLeft = 0f;
  private float cropRight = 0f;

  /* (non-Javadoc)
   * @see org.beilstein.chemxtract.render.graphic.Graphic#getBounds()
   */
  @Override
  public final Rectangle2D getBounds() {
    return bounds;
  }

  /* (non-Javadoc)
   * @see org.beilstein.chemxtract.render.graphic.Graphic#setBounds(java.awt.geom.Rectangle2D)
   */
  @Override
  public final void setBounds(Rectangle2D bounds) {
    this.bounds = bounds;
  }

  /* (non-Javadoc)
   * @see org.beilstein.chemxtract.render.graphic.Graphic#getCropTop()
   */
  @Override
  public float getCropTop() {
    return cropTop;
  }

  /* (non-Javadoc)
   * @see org.beilstein.chemxtract.render.graphic.Graphic#setCropTop(float)
   */
  @Override
  public void setCropTop(float cropTop) {
    this.cropTop = cropTop;
  }

  /* (non-Javadoc)
   * @see org.beilstein.chemxtract.render.graphic.Graphic#getCropBottom()
   */
  @Override
  public float getCropBottom() {
    return cropBottom;
  }

  /* (non-Javadoc)
   * @see org.beilstein.chemxtract.render.graphic.Graphic#setCropBottom(float)
   */
  @Override
  public void setCropBottom(float cropBottom) {
    this.cropBottom = cropBottom;
  }

  /* (non-Javadoc)
   * @see org.beilstein.chemxtract.render.graphic.Graphic#getCropLeft()
   */
  @Override
  public float getCropLeft() {
    return cropLeft;
  }

  /* (non-Javadoc)
   * @see org.beilstein.chemxtract.render.graphic.Graphic#setCropLeft(float)
   */
  @Override
  public void setCropLeft(float cropLeft) {
    this.cropLeft = cropLeft;
  }

  /* (non-Javadoc)
   * @see org.beilstein.chemxtract.render.graphic.Graphic#getCropRight()
   */
  @Override
  public float getCropRight() {
    return cropRight;
  }

  /* (non-Javadoc)
   * @see org.beilstein.chemxtract.render.graphic.Graphic#setCropRight(float)
   */
  @Override
  public void setCropRight(float cropRight) {
    this.cropRight = cropRight;
  }

  /* (non-Javadoc)
   * @see org.beilstein.chemxtract.render.graphic.Graphic#getImage(boolean)
   */
  @Override
  public final Image getImage(boolean scale) {
    if (cropTop != 0 || cropBottom != 0 || cropLeft != 0 || cropRight != 0) {
      // TODO implement me if necessary
      return null;
    }

    Image image = getImageIntern();
    if (scale && image != null && bounds != originalBounds) {
      return image.getScaledInstance((int) bounds.getWidth(), (int) bounds.getHeight(), Image.SCALE_SMOOTH);
    }
    return image;
  }

  /* (non-Javadoc)
   * @see org.beilstein.chemxtract.render.graphic.Graphic#paint(java.awt.Graphics2D)
   */
  @Override
  public final void paint(Graphics2D g) throws IOException {
    AffineTransform oldTransform = g.getTransform();
    if (bounds.getMinX() != 0d || bounds.getMinY() != 0d) {
      g.translate(bounds.getMinX(), bounds.getMinY());
    }
    double sx = bounds.getWidth() / (originalBounds.getWidth() * (1 - cropLeft - cropRight));
    double sy = bounds.getHeight() / (originalBounds.getHeight() * (1 - cropTop - cropBottom));
    if (sx != 1d || sy != 1d) {
      g.scale(sx, sy);
    }
    double tx = -originalBounds.getMinX() - originalBounds.getWidth() * cropLeft;
    double ty = -originalBounds.getMinY() - originalBounds.getHeight() * cropTop;
    if (tx != 0d || ty != 0d) {
      g.translate(tx, ty);
    }

    Shape oldClip = g.getClip();
    g.setClip(new Rectangle2D.Double(originalBounds.getMinX() + originalBounds.getWidth() * cropLeft,
            originalBounds.getMinY() + originalBounds.getHeight() * cropTop, originalBounds.getWidth() * (1 - cropLeft - cropRight),
            originalBounds.getHeight() * (1 - cropTop - cropBottom)));

    paintIntern(g);

    g.setClip(oldClip);
    g.setTransform(oldTransform);
  }

  protected Image getImageIntern() {
    return null;
  }

  /**
   * Paint the original un-scaled graphic. This method is quite similar to
   * {@link #paint(Graphics2D)}.
   * 
   * @param g Graphics2D object
   * @throws IOException Occurs if a problem happens during the painting process
   */
  protected abstract void paintIntern(Graphics2D g) throws IOException;

  /**
   * Returns the original bounds of the graphic.
   * 
   * @return Original bounds
   */
  public final Rectangle2D getOriginalBounds() {
    return originalBounds;
  }

  /**
   * Sets the original bounds of the graphics. These bounds are used to calculate the scaling to the
   * new bounds. Each implementation of this class must set the original bounds first. This method
   * sets also the bounds, see {@link #setBounds(Rectangle2D)}.
   * 
   * @param originalBounds Original bounds
   */
  protected final void setOriginalBounds(Rectangle2D originalBounds) {
    this.originalBounds = originalBounds;
    setBounds(originalBounds);
  }
}
