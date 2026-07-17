package org.beilstein.chemxtract.render.cdx.renderer;

import java.awt.*;
import java.awt.font.*;
import java.awt.geom.*;
import java.text.AttributedString;

/**
 * Special {@link Java2DFigure} implementation to draw text.
 * 
 * @author stephan
 * @version $Id: TextFigure.java,v 1.4 2014-06-12 11:32:59 bsnie Exp $
 */
public class TextFigure extends Java2DFigure {
  /** Text, which should be drawn. */
  private String text;
  /** x-coordinate of the text position. */
  private float x = 0;
  /** y-coordinate of the text position. */
  private float y = 0;

  public TextFigure() {}

  public TextFigure(String text, float x, float y) {
    this.text = text;
    this.x = x;
    this.y = y;
  }

  public String getText() {
    return text;
  }

  public void setText(String text) {
    this.text = text;
  }

  public float getX() {
    return x;
  }

  public void setX(float x) {
    this.x = x;
  }

  public float getY() {
    return y;
  }

  public void setY(float y) {
    this.y = y;
  }

  @Override
  public Shape getShape() {
    Shape childShape = super.getShape();

    TextLayout textLayout = new TextLayout(getText(), getFont(), new FontRenderContext(new AffineTransform(), true, true));
    GeneralPath shape = null;
    Rectangle2D bounds = textLayout.getBounds();
    if (bounds.getWidth() > 0 && bounds.getHeight() > 0) {
      AffineTransform transform = AffineTransform.getTranslateInstance(x, y);
      shape = new GeneralPath(GrahamScanAlgorithm.createConvexHull(textLayout.getOutline(transform)));
    } else {
      shape = new GeneralPath(new Area(new Rectangle2D.Float(getX(), getY(), 0.1f, 0.1f)));
    }
    if (childShape != null) {
      shape.append(childShape, false);
    }
    return shape;
  }

  @Override
  public void paintFigure(Graphics2D g) {
    if (text != null) {
      // switch to attributed string if underline is used, because font attributes will be ignored 
      // by Batik and iText, see bug 6783
      Font currentFont = g.getFont();
      if (currentFont.getAttributes().get(TextAttribute.UNDERLINE) != null) {
        AttributedString string = new AttributedString(text);
        if (currentFont.getAttributes().get(TextAttribute.UNDERLINE) != null) {
          string.addAttribute(TextAttribute.UNDERLINE, currentFont.getAttributes().get(TextAttribute.UNDERLINE));
        }
        g.drawString(string.getIterator(), x, y);
      } else {
        g.drawString(text, x, y);
      }
    }

  }

  @Override
  public TextFigure clone() {
    TextFigure figure = new TextFigure();
    figure.setText(getText());
    figure.setX(getX());
    figure.setY(getY());
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
