package org.beilstein.chemxtract.render.cdx.renderer;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.beilstein.chemxtract.cdx.CDBond;
import org.beilstein.chemxtract.cdx.CDColoredMolecularArea;
import org.beilstein.chemxtract.cdx.CDGraphic;
import org.beilstein.chemxtract.cdx.CDRectangle;
import org.beilstein.chemxtract.cdx.datatypes.CDPoint2D;

import java.awt.*;
import java.awt.geom.Line2D;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

import static org.beilstein.chemxtract.render.cdx.renderer.GeometryUtils.*;

public class PolygonWriter {
  private static final Log logger = LogFactory.getLog(PolygonWriter.class);
  private Graphics2D graphics2D;
  private final Color shadowColor;
  private final float shadowOffset;

  public PolygonWriter(Graphics2D graphics2D, Color shadowColor, float shadowOffset) {
    this.graphics2D = graphics2D;
    this.shadowColor = shadowColor;
    this.shadowOffset = shadowOffset;
  }

  /**
   * Generate a graphical presentation of a ChemDraw colored molecular area.
   *
   * @param area ChemDraw colored molecular area
   * @param figure    Graphical figure
   * @param lineWidth Current line width
   * @param boldWidth Current line width of bold lines
   */
  void writePolygon(CDColoredMolecularArea area, Java2DFigure figure, Color color, float lineWidth, float boldWidth) {
    CDRectangle boundingBox = area.getBounds();

    // put all polygon edges (aka bonds) into unsorted list
    List<CDPoint2D[]> polygonEdgesUnsorted = new ArrayList<CDPoint2D[]>();
    for (CDBond bond : area.getBasisObjects()) {
      CDPoint2D startPoint = new CDPoint2D(bond.getBegin().getPosition2D().getX(), bond.getBegin().getPosition2D().getY());
      CDPoint2D endPoint = new CDPoint2D(bond.getEnd().getPosition2D().getX(), bond.getEnd().getPosition2D().getY());
      polygonEdgesUnsorted.add(new CDPoint2D[] { startPoint, endPoint });
    }

    List<CDPoint2D[]> polygonEdgesSorted = new ArrayList<CDPoint2D[]>();
    // randomly pick and remove the first
    CDPoint2D[] edge = polygonEdgesUnsorted.remove(0);
    polygonEdgesSorted.add(edge);

    // as long as unsorted edges are left, pick the one that begins where the last one ends
    while (polygonEdgesUnsorted.size() > 0) {
      Iterator<CDPoint2D[]> edgeIter = polygonEdgesUnsorted.iterator();
      while (edgeIter.hasNext()) {
        CDPoint2D[] nextEdge = edgeIter.next();
        // if end point of last edge equals start point of next edge
        if (edge[1].equalsTolerance(nextEdge[0])) {
          edgeIter.remove();
          polygonEdgesSorted.add(nextEdge);
          edge = nextEdge;
        }
        // or if end point of last edge equals end point of next edge, swap start and end in next edge
        else if (edge[1].equalsTolerance(nextEdge[1])) {
          edgeIter.remove();
          // swap
          CDPoint2D tmp = nextEdge[1];
          nextEdge[1] = nextEdge[0];
          nextEdge[0] = tmp;
          polygonEdgesSorted.add(nextEdge);
          edge = nextEdge;
        }
      }
    }

    // paint the actual polygon
    Path path = new Path();
    int i = 0;
    float[] corners = new float[polygonEdgesSorted.size() * 2];
    for (CDPoint2D[] e : polygonEdgesSorted) {
      CDPoint2D point = e[0];
      corners[i * 2] = point.getX();
      corners[i * 2 + 1] = point.getY();
      i++;
    }
    CurveUtils.addPolygon(path, corners, true);

    PathFigure pf = new PathFigure(path, true, true);
    pf.setPaint(color);
    figure.addFigure(pf);

  }

  private void handleBoldAndDashing(CDGraphic graphic, Java2DFigure figure, float lineWidth, float boldWidth) {
    if (graphic.getOvalType().isBold()) {
      if (graphic.getOvalType().isDashed()) {
        figure.setStroke(new BasicStroke(boldWidth, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND, 3.0f, new float[] { 10.75f }, 0.0f));
      } else {
        figure.setStroke(new BasicStroke(boldWidth));
      }
    } else if (graphic.getOvalType().isDashed()) {
      figure.setStroke(new BasicStroke(lineWidth, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND, 3.0f, new float[] { 3.0f }, 0.0f));
    } else {
      figure.setStroke(new BasicStroke(lineWidth));
    }
  }

  private void handleCircle(CDGraphic graphic, PathPoint center, PathPoint majorAxisEnd, PathPoint minorAxisEnd, Path path) {
    if (graphic.getOvalType().isCircle()) {
      CurveUtils.addCircle(path, center, majorAxisEnd);
    } else {
      CurveUtils.addOval(path, center, majorAxisEnd, minorAxisEnd);
    }
  }

  private void handleShadingAndFilling(CDGraphic graphic, Java2DFigure figure, Color color, Path path) {
    if (graphic.getOvalType().isShaded()) {
      figure.addFigure(ShadedFigureCreator.createFigure(path, color));
    } else if (graphic.getOvalType().isFilled()) {
      figure.addFigure(new PathFigure(path, false, true));
    }
  }

  private void handleShadow(CDGraphic graphic, Java2DFigure figure, PathPoint center, PathPoint majorAxisEnd, Path path) {
    if (graphic.getOvalType().isShadowed()) {
      Path shadowPath = new Path();

      if (graphic.getOvalType().isCircle()) {
        CurveUtils.addCircle(shadowPath, add(center, shadowOffset), add(majorAxisEnd, shadowOffset));
      } else {
        CurveUtils.addOval(shadowPath, add(center, shadowOffset), add(majorAxisEnd, shadowOffset));
      }

      shadowPath = CurveUtils.subtract(shadowPath, path);
      PathFigure pathFigure = new PathFigure(shadowPath, false, true);
      pathFigure.setPaint(shadowColor);
      figure.addFigure(pathFigure);
    }
  }

  private void createOvalDebugOutput(CDGraphic graphic, CDRectangle boundingBox) {
    if (logger.isDebugEnabled()) {
      logger.debug("Oval " + boundingBox + " types=" + graphic.getOvalType());
      graphics2D.setColor(Color.RED);
      graphics2D.setStroke(new BasicStroke(0.5f));
      graphics2D.draw(new Line2D.Float(boundingBox.getRight(), boundingBox.getBottom(), boundingBox.getLeft(), boundingBox.getTop()));

      graphics2D.setColor(Color.GREEN);
      graphics2D.setStroke(new BasicStroke(0.25f));
      graphics2D.draw(new Line2D.Float(graphic.getCenter3D().getX(), graphic.getCenter3D().getY(), graphic.getMajorAxisEnd3D().getX(),
              graphic.getMajorAxisEnd3D().getY()));

      graphics2D.setColor(Color.BLUE);
      graphics2D.setStroke(new BasicStroke(0.25f));
      graphics2D.draw(new Line2D.Float(graphic.getCenter3D().getX(), graphic.getCenter3D().getY(), graphic.getMinorAxisEnd3D().getX(),
              graphic.getMinorAxisEnd3D().getY()));

    }
  }
}
