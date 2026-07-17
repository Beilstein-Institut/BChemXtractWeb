package org.beilstein.chemxtract.render.cdx.renderer;


import java.awt.*;
import java.util.List;

import static org.beilstein.chemxtract.render.cdx.renderer.GeometryUtils.*;


public class ShadedFigureCreator {

  private ShadedFigureCreator(){
    // empty constructor to hide the implicit public one
  }

  public static Java2DFigure createFigure(Path path, Color color) {
    List<PathPoint> points = CurveUtils.getConvexHull(path);
    float minX = 0;
    float minY = 0;
    float maxX = 0;
    float maxY = 0;
    for (int i = 0; i < points.size(); i++) {
      PathPoint point = points.get(i);
      if (i == 0 || minX > point.x) {
        minX = point.x;
      }
      if (i == 0 || minY > point.y) {
        minY = point.y;
      }
      if (i == 0 || maxX < point.x) {
        maxX = point.x;
      }
      if (i == 0 || maxY < point.y) {
        maxY = point.y;
      }
    }

    PathPoint minPoint = point(minX, minY);
    PathPoint maxPoint = point(maxX, maxY);
    PathPoint centerPoint = scaleAdd(minPoint, sub(maxPoint, minPoint), 0.3f);

    Java2DFigure figure = new Java2DFigure();
    PathFigure pathFigure = new PathFigure(path, false, true);
    pathFigure.setPaint(color);
    figure.addFigure(pathFigure);

    if (points.size() > 1) {
      for (int i = 0; i < points.size(); i++) {
        PathPoint point1 = points.get(i);
        PathPoint point2 = points.get((i + 1) % points.size());

        PathPoint v1 = sub(centerPoint, point1);
        PathPoint v2 = sub(point2, point1);
        double dotProduct = dot(v1, v2);
        double length2 = dot(v2, v2);

        if (length2 <= 0) {
          continue;
        }

        PathPoint intersectionPoint = scaleAdd(point1, v2, dotProduct / length2);

        Path path2 = new Path();
        path2.moveTo(centerPoint);
        path2.lineTo(point1);
        path2.lineTo(point2);
        path2.closePath();
        pathFigure = new PathFigure(path2, true, true);

        GradientPaint gradient =
          new GradientPaint(centerPoint.x, centerPoint.y, Color.WHITE, intersectionPoint.x, intersectionPoint.y, color);
        pathFigure.setPaint(gradient);

        figure.addFigure(pathFigure);

      }
    }
    figure.setClip(path.toShape());
    return figure;
  }
}
