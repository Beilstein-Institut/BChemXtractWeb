package org.beilstein.chemxtract.render.cdx.renderer;

import java.awt.*;
import java.awt.geom.Area;
import java.io.IOException;

import org.apache.commons.logging.*;
import org.beilstein.chemxtract.render.graphic.Graphic;

/**
 * This class is used to render a {@link Graphic} as {@link Java2DFigure}.
 * 
 * @author stephan
 * @version $Id: GraphicFigure.java,v 1.2 2014-06-12 11:32:59 bsnie Exp $
 */
public class GraphicFigure extends Java2DFigure {
  private static final Log logger = LogFactory.getLog(GraphicFigure.class);

  /** Graphic, which should be rendered by this figure. */
  private Graphic graphic;

  public GraphicFigure(Graphic graphic) {
    this.graphic = graphic;
  }

  public GraphicFigure() {}

  public Graphic getGraphic() {
    return graphic;
  }

  public void setGraphic(Graphic graphic) {
    this.graphic = graphic;
  }

  @Override
  public Shape getShape() {
    Shape childShape = super.getShape();
    if (getGraphic() == null) {
      return childShape;
    }
    Area shape = new Area(getGraphic().getBounds());
    if (childShape != null) {
      shape.add(new Area(childShape));
    }
    return shape;
  }

  @Override
  public void paintFigure(Graphics2D g) {
    if (graphic != null) {
      try {
        graphic.paint(g);
      } catch (IOException e) {
        logger.error("Unable to render graphic", e);
      }
    }
  }

  @Override
  public GraphicFigure clone() {
    GraphicFigure figure = new GraphicFigure();
    figure.setGraphic(getGraphic());
    figure.setZOrder(getZOrder());
    figure.setVisible(isVisible());
    figure.setStroke(getStroke());
    figure.setPaint(getPaint());
    figure.setTransform(getTransform());
    figure.setClip(getClip());
    figure.setComposite(getComposite());
    figure.setFont(getFont());
    figure.setModel(getModel());
    return figure;
  }

}
