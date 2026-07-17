package org.beilstein.chemxtract.render.cdx.renderer;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.beilstein.chemxtract.cdx.CDGraphic;
import org.beilstein.chemxtract.cdx.CDRectangle;

import java.awt.*;
import java.awt.geom.Line2D;

import static org.beilstein.chemxtract.render.cdx.renderer.GeometryUtils.*;

public class SymbolWriter {

  private static final Log logger = LogFactory.getLog(SymbolWriter.class);
  private Graphics2D graphics2D;

  public SymbolWriter(Graphics2D graphics2D) {
    this.graphics2D = graphics2D;
  }

  /**
   * Generate a graphical presentation of a ChemDraw symbol graphic.
   *
   * @param graphic ChemDraw graphic
   * @param figure  Graphical figure
   */
  void writeSymbol(CDGraphic graphic, Java2DFigure figure) {
    CDRectangle boundingBox = graphic.getBounds();
    createSymbolDebugOutput(graphic, boundingBox);

    PathPoint point1 = point(boundingBox.getRight(), boundingBox.getBottom());
    PathPoint point2 = point(boundingBox.getLeft(), boundingBox.getTop());
    PathPoint d = sub(point2, point1);
    float length = length(d);

    switch (graphic.getSymbolType()) {
      case Dagger: {
        Path path = new Path();
        CurveUtils.addLine(path, point2, point(point2.x, point2.y + length), 0, false);
        CurveUtils.addLine(path, point(point2.x - length / 4f, point2.y + length / 4f),
                point(point2.x + length / 4f, point2.y + length / 4f), 0, false);
        figure.addFigure(new PathFigure(path));
        break;
      }
      case DoubleDagger: {
        Path path = new Path();
        CurveUtils.addLine(path, point2, point(point2.x, point2.y + length), 0, false);
        CurveUtils.addLine(path, point(point2.x - length / 4f, point2.y + length / 4f),
                point(point2.x + length / 4f, point2.y + length / 4f), 0, false);
        CurveUtils.addLine(path, point(point2.x - length / 4f, point2.y + length * 3f / 4f),
                point(point2.x + length / 4f, point2.y + length * 3f / 4f), 0, false);
        figure.addFigure(new PathFigure(path));
        break;
      }
      case CirclePlus: {
        Path path = new Path();
        float size = length * 0.45f;
        CurveUtils.addCircle(path, point2, size);
        CurveUtils.addLine(path, point(point2.x - size / 2, point2.y), point(point2.x + size / 2, point2.y), 0, false);
        CurveUtils.addLine(path, point(point2.x, point2.y - size / 2), point(point2.x, point2.y + size / 2), 0, false);
        figure.addFigure(new PathFigure(path));
        break;
      }
      case CircleMinus: {
        Path path = new Path();
        float size = length * 0.45f;
        CurveUtils.addCircle(path, point2, size);
        CurveUtils.addLine(path, point(point2.x - size / 2, point2.y), point(point2.x + size / 2, point2.y), 0, false);
        figure.addFigure(new PathFigure(path));
        break;
      }
      case RadicalCation: {
        Path path = new Path();
        CurveUtils.addLine(path, point(point1.x - length / 2, point1.y), point(point1.x + length / 2, point1.y), 0, false);
        CurveUtils.addLine(path, point(point1.x, point1.y - length / 2), point(point1.x, point1.y + length / 2), 0, false);
        figure.addFigure(new PathFigure(path));
        path = new Path();
        CurveUtils.addCircle(path, point2, length / 10f);
        figure.addFigure(new PathFigure(path, true, true));
        break;
      }
      case RadicalAnion: {
        Path path = new Path();
        CurveUtils.addLine(path, point(point1.x - length / 2, point1.y), point(point1.x + length / 2, point1.y), 0, false);
        figure.addFigure(new PathFigure(path));
        path = new Path();
        CurveUtils.addCircle(path, point2, length / 10f);
        figure.addFigure(new PathFigure(path, true, true));
        break;
      }
      case Plus: {
        Path path = new Path();
        CurveUtils.addLine(path, point(point2.x - length / 4, point2.y), point(point2.x + length / 4, point2.y), 0, false);
        CurveUtils.addLine(path, point(point2.x, point2.y - length / 4), point(point2.x, point2.y + length / 4), 0, false);
        figure.addFigure(new PathFigure(path));
        break;
      }
      case Minus: {
        Path path = new Path();
        CurveUtils.addLine(path, point(point2.x - length / 4, point2.y), point(point2.x + length / 4, point2.y), 0, false);
        figure.addFigure(new PathFigure(path));
        break;
      }
      case LonePair: {
        Path path = new Path();
        CurveUtils.addCircle(path, point1, length / 8f);
        figure.addFigure(new PathFigure(path, true, true));
        path = new Path();
        CurveUtils.addCircle(path, point2, length / 8f);
        figure.addFigure(new PathFigure(path, true, true));
        break;
      }
      case Electron: {
        Path path = new Path();
        CurveUtils.addCircle(path, point2, length / 12f);
        figure.addFigure(new PathFigure(path, true, true));
        break;
      }
      default:
        logger.warn("Symbol " + graphic.getSymbolType() + " ignored");
    }
  }

  private void createSymbolDebugOutput(CDGraphic graphic, CDRectangle boundingBox) {
    if (logger.isDebugEnabled()) {
      logger.debug("Symbol " + boundingBox + " symbolType=" + graphic.getSymbolType());
      graphics2D.setColor(Color.RED);
      graphics2D.setStroke(new BasicStroke(0.5f));
      graphics2D.draw(new Line2D.Float(boundingBox.getRight(), boundingBox.getBottom(), boundingBox.getLeft(), boundingBox.getTop()));
    }
  }
}
