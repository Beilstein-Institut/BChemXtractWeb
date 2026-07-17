package org.beilstein.chemxtract.render.cdx.renderer;

import java.awt.Shape;
import java.awt.geom.*;
import java.text.*;
import java.util.*;

public class Path {
  enum PathCommand{
    MOVE_TO,
    LINE_TO,
    QUAD_TO,
    CUBIC_TO,
    CLOSE
  };

  private List<PathCommand> commands = new ArrayList<>();
  private List<PathPoint> points = new ArrayList<>();

  public Path() {}

  public Path(Path path) {
    append(path);
  }

  public Path(Shape shape) {
    if (shape == null) {
      throw new IllegalArgumentException("No shape given");
    }

    append(shape, false);
  }

  public void append(Path path) {
    commands.addAll(path.commands);
    points.addAll(path.points);
  }

  public void append(Shape shape, boolean connect) {
    float[] coords = new float[6];
    for (PathIterator i = shape.getPathIterator(null); !i.isDone(); i.next()) {
      int type = i.currentSegment(coords);
      switch (type) {
        case PathIterator.SEG_MOVETO: {
          if (!connect || commands.isEmpty() || points.isEmpty()) {
            moveTo(new PathPoint(coords[0], coords[1]));
            break;
          }
          if (commands.get(commands.size() - 1) != PathCommand.CLOSE && points.get(points.size() - 1).x == coords[0] &&
                  points.get(points.size() - 1).y == coords[1]) {
            // Collapse out initial moveto/lineto
            break;
          }
          break;
        }
        case PathIterator.SEG_LINETO: {
          lineTo(new PathPoint(coords[0], coords[1]));
          break;
        }
        case PathIterator.SEG_QUADTO: {
          quadTo(new PathPoint(coords[0], coords[1]), new PathPoint(coords[2], coords[3]));
          break;
        }
        case PathIterator.SEG_CUBICTO: {
          curveTo(new PathPoint(coords[0], coords[1]), new PathPoint(coords[2], coords[3]), new PathPoint(coords[4], coords[5]));
          break;
        }
        case PathIterator.SEG_CLOSE: {
          closePath();
          break;
        }
      }
      connect = false;
    }
  }

  public void moveTo(PathPoint point) {
    if (point == null) {
      throw new IllegalArgumentException();
    }
    if (commands.size() > 0 && commands.get(commands.size() - 1) == PathCommand.MOVE_TO) {
      throw new IllegalStateException("Unnecessary moveto command");
    }
    commands.add(PathCommand.MOVE_TO);
    points.add(point);
  }

  public void lineTo(PathPoint point) {
    if (point == null) {
      throw new IllegalArgumentException();
    }
    if (commands.isEmpty() || commands.get(commands.size() - 1) == PathCommand.CLOSE) {
      throw new IllegalStateException("No preceeding moveto command");
    }
    commands.add(PathCommand.LINE_TO);
    points.add(point);
  }

  public void quadTo(PathPoint point1, PathPoint point2) {
    if (point1 == null || point2 == null) {
      throw new IllegalArgumentException();
    }
    if (commands.isEmpty() || commands.get(commands.size() - 1) == PathCommand.CLOSE) {
      throw new IllegalStateException("No preceeding moveto command");
    }
    commands.add(PathCommand.QUAD_TO);
    points.add(point1);
    points.add(point2);
  }

  public void curveTo(PathPoint point1, PathPoint point2, PathPoint point3) {
    if (point1 == null || point2 == null || point3 == null) {
      throw new IllegalArgumentException();
    }
    if (commands.isEmpty() || commands.get(commands.size() - 1) == PathCommand.CLOSE) {
      throw new IllegalStateException("No preceeding moveto command");
    }
    commands.add(PathCommand.CUBIC_TO);
    points.add(point1);
    points.add(point2);
    points.add(point3);
  }

  public void closePath() {
    if (commands.isEmpty() || commands.get(commands.size() - 1) == PathCommand.MOVE_TO ||
            commands.get(commands.size() - 1) == PathCommand.CLOSE) {
      throw new IllegalStateException("No preceeding path, which can be closed");
    }
    commands.add(PathCommand.CLOSE);
  }

  public int getElementCount() {
    return commands.size();
  }

  public PathCommand getElementCommand(int index) {
    return commands.get(index);
  }

  public PathPoint[] getElementPoints(int index) {
    int pointIndex = 0;
    for (PathCommand command : commands) {
      if (index == 0) {
        switch (command) {
          case MOVE_TO: {
            return new PathPoint[] { points.get(pointIndex) };
          }
          case LINE_TO: {
            return new PathPoint[] { points.get(pointIndex) };
          }
          case QUAD_TO: {
            return new PathPoint[] { points.get(pointIndex++), points.get(pointIndex++) };
          }
          case CUBIC_TO: {
            return new PathPoint[] { points.get(pointIndex++), points.get(pointIndex++), points.get(pointIndex++) };
          }
          case CLOSE: {
            return new PathPoint[0];
          }
        }
      }

      switch (command) {
        case MOVE_TO:
          pointIndex++;
          break;
        case LINE_TO:
          pointIndex++;
          break;
        case QUAD_TO:
          pointIndex += 2;
          break;
        case CUBIC_TO:
          pointIndex += 3;
          break;
        case CLOSE:
          break;
      }
      index--;
    }
    throw new IllegalArgumentException("Index out of bounds: " + index);
  }

  /**
   * Returns the first point of the path
   * 
   * @return The first point of the path
   */
  public PathPoint getFirstPoint() {
    if (points == null || points.size() == 0) return null;
    return points.get(0);
  }

  /**
   * Returns the last point of the path.
   * 
   * @return The last point of the path
   */
  public PathPoint getLastPoint() {
    if (points == null || points.size() == 0) return null;
    return points.get(points.size() - 1); 
  }

  public PathPoint getFirstDirection() {
    if (points.size() < 2) {
      throw new IllegalStateException("Unable to determine first direction");
    }
    return GeometryUtils.normalize(GeometryUtils.sub(points.get(0), points.get(1)));
  }

  public PathPoint getLastDirection() {
    switch (commands.get(commands.size() - 1)) {
      case MOVE_TO:
        throw new IllegalStateException("Unable to determine last direction");
      case LINE_TO:
      case QUAD_TO:
      case CUBIC_TO:
        return GeometryUtils.normalize(GeometryUtils.sub(points.get(points.size() - 1), points.get(points.size() - 2)));
      case CLOSE:
        throw new IllegalStateException("Unable to determine last direction");
    }
    throw new IllegalStateException("Unable to determine last direction");
  }

  public Shape toShape() {
    GeneralPath path = new GeneralPath();
    path.setWindingRule(GeneralPath.WIND_NON_ZERO);
    int pointIndex = 0;
    for (PathCommand command : commands) {
      switch (command) {
        case MOVE_TO:
          path.moveTo(points.get(pointIndex).x, points.get(pointIndex++).y);
          break;
        case LINE_TO:
          path.lineTo(points.get(pointIndex).x, points.get(pointIndex++).y);
          break;
        case QUAD_TO:
          path.quadTo(points.get(pointIndex).x, points.get(pointIndex++).y, points.get(pointIndex).x, points.get(pointIndex++).y);
          break;
        case CUBIC_TO:
          path.curveTo(points.get(pointIndex).x, points.get(pointIndex++).y, points.get(pointIndex).x, points.get(pointIndex++).y,
                  points.get(pointIndex).x, points.get(pointIndex++).y);
          break;
        case CLOSE:
          path.closePath();
          break;
      }
    }
    return path;
  }

  public void transform(AffineTransform transform) {
    points = GeometryUtils.transform(transform, points);
  }

  @Override
  public String toString() {
    StringBuilder sb = new StringBuilder();

    DecimalFormat format = new DecimalFormat("######.###", new DecimalFormatSymbols(Locale.ENGLISH));

    int pointIndex = 0;
    for (PathCommand command : commands) {
      switch (command) {
        case MOVE_TO: {
          sb.append(" M " + format.format(points.get(pointIndex).x) + " " + format.format(points.get(pointIndex++).y));
          break;
        }
        case LINE_TO: {
          sb.append(" L " + format.format(points.get(pointIndex).x) + " " + format.format(points.get(pointIndex++).y));
          break;
        }
        case QUAD_TO: {
          sb.append(" Q " + format.format(points.get(pointIndex).x) + " " + format.format(points.get(pointIndex++).y) + " " +
                  format.format(points.get(pointIndex).x) + " " + format.format(points.get(pointIndex++).y));
          break;
        }
        case CUBIC_TO: {
          sb.append(" C " + format.format(points.get(pointIndex).x) + " " + format.format(points.get(pointIndex++).y) + " " +
                  format.format(points.get(pointIndex).x) + " " + format.format(points.get(pointIndex++).y) + " " +
                  format.format(points.get(pointIndex).x) + " " + format.format(points.get(pointIndex++).y));
          break;
        }
        case CLOSE: {
          sb.append(" Z");
          break;
        }
      }
    }
    return sb.length() > 0 ? sb.toString().substring(1) : "";
  }

}
