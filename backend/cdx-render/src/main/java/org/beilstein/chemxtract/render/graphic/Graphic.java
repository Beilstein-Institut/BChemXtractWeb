package org.beilstein.chemxtract.render.graphic;

import java.awt.*;
import java.awt.geom.Rectangle2D;
import java.io.IOException;

/**
 * Common interface for graphic objects.
 * 
 * @author stephan
 */
public interface Graphic {
  /**
   * If graphic is a pixel graphic, the this method should return AWT Image instance. For verctor
   * graphics this method will return null.
   * 
   * @param scale True if the image should be scaled to fulfil the bounds
   * @return AWT Image instance
   */
  public Image getImage(boolean scale);

  /**
   * Paint graphic over a Graphics2D object.
   * 
   * @param g Graphics2D object
   */
  public void paint(Graphics2D g) throws IOException;

  /**
   * Return bounds of graphic.
   * 
   * @return current bounds
   */
  public Rectangle2D getBounds();

  /**
   * Sets new bounds for the graphic. This means that the graphic will be scaled to follow the new
   * bounds.
   * 
   * @param bounds new bounds
   */
  public void setBounds(Rectangle2D bounds);

  /**
   * Return the type of graphic. This method will return null for combined graphics.
   * 
   * @return Type of graphic.
   */
  public GraphicType getType();

  /**
   * Returns the fraction of graphic removal from the top side.
   * 
   * @return fraction of graphic removal
   */
  public float getCropTop();

  /**
   * Sets the fraction of graphic removal from the top side.
   * 
   * @param crop fraction of graphic removal
   */
  public void setCropTop(float crop);

  /**
   * Returns the fraction of graphic removal from the bottom side.
   * 
   * @return fraction of graphic removal
   */
  public float getCropBottom();

  /**
   * Sets the fraction of graphic removal from the bottom side.
   * 
   * @param crop fraction of graphic removal
   */
  public void setCropBottom(float crop);

  /**
   * Returns the fraction of graphic removal from the left side.
   * 
   * @return fraction of graphic removal
   */
  public float getCropLeft();

  /**
   * Sets the fraction of graphic removal from the left side.
   * 
   * @param crop fraction of graphic removal
   */
  public void setCropLeft(float crop);

  /**
   * Returns the fraction of graphic removal from the right side.
   * 
   * @return fraction of graphic removal
   */
  public float getCropRight();

  /**
   * Sets the fraction of graphic removal from the right side.
   * 
   * @param crop fraction of graphic removal
   */
  public void setCropRight(float crop);

}
