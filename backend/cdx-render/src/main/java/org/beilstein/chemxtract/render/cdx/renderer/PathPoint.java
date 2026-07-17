package org.beilstein.chemxtract.render.cdx.renderer;

/**
 * Immutable point for paths.
 * 
 * @author stephan
 * @version $Id: PathPoint.java,v 1.1 2010-03-02 12:52:48 bsmic Exp $
 */
public class PathPoint {
  public final float x;
  public final float y;

  public PathPoint(float x, float y) {
    if (Float.isNaN(x) || Float.isInfinite(x)) {
      throw new IllegalArgumentException("Invalid number: " + x);
    }
    if (Float.isNaN(y) || Float.isInfinite(y)) {
      throw new IllegalArgumentException("Invalid number: " + y);
    }
    this.x = x;
    this.y = y;
  }

  @Override
  public String toString() {
    StringBuilder builder = new StringBuilder();
    builder.append("[");
    builder.append(x);
    builder.append("/");
    builder.append(y);
    builder.append("]");
    return builder.toString();
  }

}
