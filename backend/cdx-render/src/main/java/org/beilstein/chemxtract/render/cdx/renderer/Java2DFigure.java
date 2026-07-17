package org.beilstein.chemxtract.render.cdx.renderer;

import java.awt.Color;
import java.awt.Composite;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.Paint;
import java.awt.Shape;
import java.awt.Stroke;
import java.awt.geom.AffineTransform;
import java.awt.geom.GeneralPath;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * This class build the basic model of a tree of figures and is used by {@link CDGraphicsWriter} to
 * build the graphical representation of a ChemDraw file.
 * 
 * @author stephan
 * @version $Id: Java2DFigure.java,v 1.4 2014-06-12 11:32:59 bsnie Exp $
 */
public class Java2DFigure implements Cloneable {
  /** Z-Order of the figure. */
  private int zOrder = 0;
  /** True, if the figure is visible. */
  private boolean visible = true;
  /** Stroke for paths. */
  private Stroke stroke;
  /** Paint property, which is mostly a {@link Color}. */
  private Paint paint;
  /** Font property. */
  private Font font;
  /** Additional transformation matrix. */
  private AffineTransform transform;
  /** Clipping shape. */
  private Shape clip;
  /** Composition rule. */
  private Composite composite;
  /** User-defined object. */
  private Object model;
  /** List of child figures. */
  private List<Java2DFigure> children = new ArrayList<>();

  public int getZOrder() {
    return zOrder;
  }

  public void setZOrder(int order) {
    zOrder = order;
  }

  public boolean isVisible() {
    return visible;
  }

  public void setVisible(boolean visible) {
    this.visible = visible;
  }

  public void addFigure(Java2DFigure figure) {
    if (figure != null) {
      children.add(figure);
    }
  }

  public Stroke getStroke() {
    return stroke;
  }

  public void setStroke(Stroke stroke) {
    this.stroke = stroke;
  }

  public Paint getPaint() {
    return paint;
  }

  public void setPaint(Paint paint) {
    this.paint = paint;
  }

  public Font getFont() {
    return font;
  }

  public void setFont(Font font) {
    this.font = font;
  }

  public AffineTransform getTransform() {
    return transform;
  }

  public void setTransform(AffineTransform transform) {
    this.transform = transform;
  }

  public Shape getClip() {
    return clip;
  }

  public void setClip(Shape clip) {
    this.clip = clip;
  }

  public Composite getComposite() {
    return composite;
  }

  public void setComposite(Composite composite) {
    this.composite = composite;
  }

  public List<Java2DFigure> getChildren() {
    return children;
  }

  public void setChildren(List<Java2DFigure> children) {
    this.children = children;
  }

  public Object getModel() {
    return model;
  }

  public void setModel(Object model) {
    this.model = model;
  }

  public Shape getShape() {
    GeneralPath shape = new GeneralPath();
    for (Java2DFigure figure : children) {
      Shape childShape = figure.getShape();
      if (childShape != null) {
        shape.append(childShape, false);
      }
    }
    return shape;
  }

  public Graphics2D createGraphics(Graphics2D graphics) {
    Graphics2D childGraphics = (Graphics2D) graphics.create();

    // using the same rendering hints as the parent graphic context
    childGraphics.setRenderingHints(graphics.getRenderingHints());

    if (getStroke() != null && getStroke() != childGraphics.getStroke()) {
      childGraphics.setStroke(getStroke());
    }

    if (getPaint() != null && getPaint() != childGraphics.getPaint()) {
      childGraphics.setPaint(getPaint());
    }

    if (getFont() != null && getFont() != childGraphics.getFont()) {
      childGraphics.setFont(getFont());
    }

    if (getTransform() != null) {
      AffineTransform newTransform = new AffineTransform(childGraphics.getTransform());
      newTransform.concatenate(getTransform());
      childGraphics.setTransform(newTransform);
    }

    if (getClip() != null && getClip() != childGraphics.getClip()) {
      childGraphics.setClip(getClip());
    }

    if (getComposite() != null && getComposite() != childGraphics.getComposite()) {
      childGraphics.setComposite(getComposite());
    }
    return childGraphics;
  }

  public void paint(Graphics2D g) {
    if (!isVisible()) {
      return;
    }

    Graphics2D graphics = createGraphics(g);
    paintFigure(graphics);
    graphics.dispose();

    graphics = createGraphics(g);

    final Map<Java2DFigure,Integer> zOrders = new HashMap<>();
    for (Java2DFigure figure : children) {
      if (figure.getZOrder() > 0) {
        zOrders.put(figure, figure.getZOrder());
      } else {
        zOrders.put(figure, figure.calculateZOrder());
      }
    }
    Collections.sort(children, new Comparator<Java2DFigure>() {
      @Override
      public int compare(Java2DFigure figure1, Java2DFigure figure2) {
        return zOrders.get(figure1) - zOrders.get(figure2);
      }
    });
    for (Java2DFigure figure : children) {
      figure.paint(graphics);
    }

    graphics.dispose();
  }

  public void paintFigure(Graphics2D g) {
    // do nothing here
  }

  private int calculateZOrder() {
    int zOrder = getZOrder();

    for (Java2DFigure figure : children) {
      int childZOrder = figure.calculateZOrder();
      if (zOrder <= 0 || zOrder < childZOrder && childZOrder > 0) {
        zOrder = childZOrder;
      }
    }
    return zOrder;
  }

  @Override
  public String toString() {
    return toString(0);
  }

  @Override
  public Java2DFigure clone() {
    Java2DFigure figure = new Java2DFigure();
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

  private String toString(int depth) {
    StringBuilder sb = new StringBuilder();
    for (int i = 0; i < depth; i++) {
      sb.append(" ");
    }
    sb.append(getClass().getSimpleName());
    sb.append(":");
    sb.append(" z-order=");
    sb.append(getZOrder());
    sb.append(" z-order(calculated)=");
    sb.append(calculateZOrder());
    if (getModel() != null) {
      sb.append(" model=");
      sb.append(getModel().toString());
    }
    sb.append("\n");
    for (Java2DFigure child : getChildren()) {
      sb.append(child.toString(depth + 1));
    }
    return sb.toString();
  }
}
