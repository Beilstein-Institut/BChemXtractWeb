package org.beilstein.chemxtract.render.cdx.renderer;

import java.awt.Shape;
import java.awt.geom.Area;
import java.awt.geom.GeneralPath;
import java.awt.geom.PathIterator;
import java.awt.geom.Point2D;
import java.util.ArrayList;
import java.util.List;
import java.util.Stack;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;

/**
 * An implementation of the Graham Scan Algorithm for computing the convex hull
 * of a set of points.
 */
public class GrahamScanAlgorithm {

  private static final Log logger = LogFactory.getLog(GrahamScanAlgorithm.class);

  //-------------------------------------------------------------------------------

  /**
   * Calculates the convex hull of a set of points.
   */
  public Stack<Point2D> getConvexHull(Point2D p[]) {
    int N = p.length;

    // get the "minimum point", which will now be located at p[0]
    Point2D p0 = min_y(p);

    mergesort(p, 1, N - 1, p0);

    // create an array to hold the "sorted points"
    Point2D[] sorted_p = new Point2D[N];
    sorted_p[0] = p0;
    sorted_p[1] = p[1]; // load sorted_p[1] with p[1]

    N = equal_angles(N, p, p0, sorted_p);

    Stack<Point2D> stack = new Stack<>();
    stack.push(sorted_p[N - 1]);
    stack.push(p0);
    stack.push(sorted_p[1]);
    stack.push(sorted_p[2]);

    for (int i = 3; i < N; i++) {
      while (cross_prod(stack.elementAt(stack.size() - 2), stack.peek(), sorted_p[i]) >= 0) {
        stack.pop();
      }
      stack.push(sorted_p[i]);
    }

    return stack;
  }

  //-------------------------------------------------------------------------------

  /**
   * Identifies the "minimum" point, where "minimum" means "minimum y position".
   * If any points are at the same y position, then the pointn with the greater
   * x coord is deemded "larger".
   * <p>
   * Returns the "minimum" one, which will be at the start of the array upon the
   * exit of the method.
   * <p>
   * The rest of the array is in random order upon return.
   */
  private Point2D min_y(Point2D p[]) {
    int min = 0, N = p.length;

    for (int i = 1; i < N; i++) {
      if (p[i].getY() < p[min].getY()) {
        min = i;
      } else if (p[i].getY() == p[min].getY()) {
        if (p[i].getX() < p[min].getX()) {
          min = i;
        } else if (p[i].getX() == p[min].getX()) {
          // Delete second min

          // found a point which is exactly the same position as the current min
          // so just ignore it...
          swap(p, i, N - 1); // swap p[i] with p[N-1]
          N--;
          i--; // continue processing with new p[i]
        }
      }
    }

    swap(p, 0, min);
    return p[0];
  }

  //-------------------------------------------------------------------------------

  /**
   * Swaps the points in the array.
   * 
   * @param a index of first point to swap
   * @param b index of second point to swap
   */
  private void swap(Point2D p[], int a, int b) {
    Point2D temp = p[a];
    p[a] = p[b];
    p[b] = temp;
  }

  //-------------------------------------------------------------------------------

  private int equal_angles(int N, Point2D p[], Point2D p0, Point2D[] sorted_p) {
    int M = N, j = 1;

    for (int i = 2; i < N; i++) {
      Point2D temp = p[i];
      if (cross_prod(p0, sorted_p[j], temp) == 0) {
        if (Math.abs(temp.getX() - p0.getX()) > Math.abs(sorted_p[j].getX() - p0.getX()) || temp.getY() > sorted_p[j].getY()) {
          sorted_p[j] = temp;
          M--;
        } else {
          M--;
        }
      } else {
        j++;
        sorted_p[j] = temp;
      }
    }
    return M;
  }

  //-------------------------------------------------------------------------------

  private void mergesort(Point2D p[], int lo, int hi, Point2D p0) {
    if (lo == hi) {
      return;
    }
    int mid = (lo + hi) / 2;

    mergesort(p, lo, mid, p0);
    mergesort(p, mid + 1, hi, p0);
    merge(p, lo, mid, hi, p0);
  }

  //-------------------------------------------------------------------------------

  private void merge(Point2D p[], int lo, int mid, int hi, Point2D p0) {
    int k = 0, i = lo, j = mid + 1;

    Point2D[] B = new Point2D[hi - lo + 1];

    while ((i <= mid) && (j <= hi)) {
      double cp = cross_prod(p0, p[i], p[j]);
      if (cp <= 0) {
        B[k++] = p[i++];
      } else {
        B[k++] = p[j++];
      }
    }

    while (i <= mid) {
      B[k++] = p[i++];
    }
    while (j <= hi) {
      B[k++] = p[j++];
    }
    for (k = 0; k < (hi - lo + 1); k++) {
      p[lo + k] = B[k];
    }
  }

  //-------------------------------------------------------------------------------

  private double cross_prod(Point2D a, Point2D b, Point2D c) {
    return ((c.getX() - a.getX()) * (b.getY() - a.getY()) - (b.getX() - a.getX()) * (c.getY() - a.getY()));
  }

  //-------------------------------------------------------------------------------

  private static final double FLATNESS_APPROXIMATION = 25;

  /**
   * Creates a convex hull using the Graham Scan algorithm.
   */
  public static Area createConvexHull(Shape s) {
    if (s == null) {
      return null;
    }
    // extract all the points that form the original shape
    PathIterator path = s.getPathIterator(null, FLATNESS_APPROXIMATION);
    List<Point2D> points = getPointsFromPath(path);

    if (logger.isDebugEnabled()) {
      logger.debug("Number of points on path = " + points.size());
    }
    if (points.size() <= 0) {
      return null;
    }
    // get the stack
    Stack<Point2D> results = new GrahamScanAlgorithm().getConvexHull(points.toArray(new Point2D[] {}));

    GeneralPath result = new GeneralPath();
    Point2D p = results.pop();
    result.moveTo((float) p.getX(), (float) p.getY());
    while (!results.isEmpty()) {
      p = results.pop();
      result.lineTo((float) p.getX(), (float) p.getY());
    }
    result.closePath();

    return new Area(result);
  }

  /**
   * Returns all of the points on the given path iterator.
   */
  public static List<Point2D> getPointsFromPath(PathIterator path) {
    List<Point2D> points = new ArrayList<>();
    // re-use the double pos[] variable so that we reduce object creation
    double[] pos = new double[3];
    while (!path.isDone()) {
      int type = path.currentSegment(pos);
      if (type != PathIterator.SEG_CLOSE) {
        points.add(new Point2D.Double(pos[0], pos[1]));
      }
      path.next();
    }
    return points;
  }
}
