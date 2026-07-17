package org.beilstein.chemxtract.render.cdx.renderer;

import java.awt.Graphics2D;
import java.io.IOException;

import org.beilstein.chemxtract.render.graphic.*;

/**
 * Experimental class!!
 * 
 * @author stephan
 * @version $Id: FigureGraphic.java,v 1.2 2014-06-12 11:32:59 bsnie Exp $
 */
public class FigureGraphic extends AbstractGraphic {
  private Java2DFigure rootFigure = new Java2DFigure();

  public FigureGraphic(Java2DFigure rootFigure) {
    super();
    this.rootFigure = rootFigure;
    setOriginalBounds(rootFigure.getShape().getBounds2D());
  }

  public Java2DFigure getRootFigure() {
    return rootFigure;
  }

  public void setRootFigure(Java2DFigure rootFigure) {
    this.rootFigure = rootFigure;
  }

  @Override
  protected void paintIntern(Graphics2D g) throws IOException {
    rootFigure.paint(g);
  }

  @Override
  public GraphicType getType() {
    return null;
  }

}
