package org.beilstein.chemxtract.render.graphic;

import java.awt.Graphics2D;
import java.awt.geom.Rectangle2D;
import java.util.*;
import java.io.IOException;

/**
 * Class to construct composites of multiple graphics.
 * 
 * @author stephan
 * @version $Id: CompositeGraphic.java,v 1.6 2014-06-12 11:32:55 bsnie Exp $
 */
public class CompositeGraphic extends AbstractGraphic {
  private List<Graphic> graphics = new LinkedList<Graphic>();
  private GraphicType type;

  /**
   * Create an empty composite graphic. The bounds are used to calculate the scaling.
   * 
   * @param bounds New graphic bounds
   * @param originalBounds Original graphic bounds
   */
  public CompositeGraphic(Rectangle2D bounds, Rectangle2D originalBounds) {
    setOriginalBounds(originalBounds);
    setBounds(bounds);
  }

  /**
   * Add graphic to the composite.
   * 
   * @param graphic Graphic
   */
  public void addGraphic(Graphic graphic) {
    graphics.add(graphic);
  }

  /* (non-Javadoc)
   * @see org.beilstein.chemxtract.render.graphic.Graphic#getType()
   */
  @Override
  public GraphicType getType() {
    return type;
  }

  /**
   * Sets the type of graphic.
   * 
   * @param type Type of graphic
   */
  public void setType(GraphicType type) {
    this.type = type;
  }

  /* (non-Javadoc)
   * @see org.beilstein.chemxtract.render.graphic.AbstractGraphic#paintIntern(java.awt.Graphics2D)
   */
  @Override
  public void paintIntern(Graphics2D g) throws IOException {
    for (Graphic graphic : graphics) {
      graphic.paint(g);
    }
  }
}