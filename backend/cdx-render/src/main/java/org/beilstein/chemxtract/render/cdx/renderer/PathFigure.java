package org.beilstein.chemxtract.render.cdx.renderer;

import java.awt.*;
import java.awt.geom.GeneralPath;

/**
 * Special {@link Java2DFigure} implementation to draw or fill paths.
 * 
 * @author stephan
 * @version $Id: PathFigure.java,v 1.3 2014-06-12 11:32:59 bsnie Exp $
 */
public class PathFigure extends Java2DFigure {
  /** Path, which should be drawn or filled. */
  private Path path;
  /** True, if the path should be stroked. */
  private boolean outline = true;
  /** True, if the path should be filled. */
  private boolean fill = false;

  public PathFigure(Path path, boolean outline, boolean fill) {
    this.path = path;
    this.outline = outline;
    this.fill = fill;
  }

  public PathFigure() {
    path = new Path();
  }

  public PathFigure(Path path) {
    this.path = path;
  }

  public Path getPath() {
    return path;
  }

  public void setPath(Path path) {
    this.path = path;
  }

  public boolean isOutline() {
    return outline;
  }

  public void setOutline(boolean outline) {
    this.outline = outline;
  }

  public boolean isFill() {
    return fill;
  }

  public void setFill(boolean fill) {
    this.fill = fill;
  }

  @Override
  public Shape getShape() {
    Shape childShape = super.getShape();
    if (getPath() == null) {
      return childShape;
    }
    GeneralPath shape = new GeneralPath(getPath().toShape());
    shape.append(childShape, false);
    if (getTransform() != null) {
      return shape.createTransformedShape(getTransform());
    }
    return shape;
  }

  @Override
  public void paintFigure(Graphics2D g) {
    Shape shape = getPath().toShape();
    if (fill) {
      g.fill(shape);
    }
    if (outline) {
      g.draw(shape);
    }
  }

  @Override
  public PathFigure clone() {
    PathFigure figure = new PathFigure();
    figure.setPath(getPath());
    figure.setOutline(isOutline());
    figure.setFill(isFill());
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
