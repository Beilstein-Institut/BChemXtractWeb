package org.beilstein.chemxtract.render.cdx.renderer;

/**
 * Utilities for 3D transformations.
 *
 * @author stephan
 * @version $Id: Tranform3DUtils.java,v 1.3 2014-06-12 11:32:59 bsnie Exp $ 
 */
public class Transform3DUtils {
  /**
   * Transforms the point parameter with this transform and
   * places the result into pointOut.  The fourth element of the
   * point input parameter is assumed to be one.
   * @param vector  the input point to be transformed
   * @return  the transformed point
   */
  public static float[] transform(float[] vector, float[] matrix) {
    float[] newVector = new float[3];
    newVector[0] = matrix[0] * vector[0] + matrix[1] * vector[1] + matrix[2] * vector[2] + matrix[3];
    newVector[1] = matrix[4] * vector[0] + matrix[5] * vector[1] + matrix[6] * vector[2] + matrix[7];
    newVector[2] = matrix[8] * vector[0] + matrix[9] * vector[1] + matrix[10] * vector[2] + matrix[11];

    return newVector;
  }

  /**
   * Subtract one 3D vector from another 3D vector
   * 
   * @param v1 First vector
   * @param v2 Second vector
   * @return Subtraction vector
   */
  public static float[] sub(float[] v1, float[] v2) {
    return new float[] { v1[0] - v2[0], v1[1] - v2[1], v1[2] - v2[2] };
  }

  /**
   * Sets this vector to be the vector cross product of vectors v1 and v2.
   * @param v1 the first vector
   * @param v2 the second vector
   */
  public static float[] cross(float[] v1, float[] v2) {
    float[] newVector = new float[3];

    newVector[0] = v1[1] * v2[2] - v1[2] * v2[1];
    newVector[1] = v1[2] * v2[0] - v1[0] * v2[2];
    newVector[2] = v1[0] * v2[1] - v1[1] * v2[0];

    return newVector;
  }

  /**
   * Calculates the dot product of two 3D vectors.
   * 
   * @param v1 First vector
   * @param v2 Second vector
   * @return Dot product
   */
  public static float dot(float[] v1, float[] v2) {
    return v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
  }

  /**
   * Calculates the length of a 3D vector.
   * 
   * @param vector Vector
   * @return Length of the vector
   */
  public static float length(float[] vector) {
    return (float) Math.sqrt(dot(vector, vector));
  }

  /**
   * Scales a vector by a given factor.
   * 
   * @param vector Vector
   * @param factor Scale factor
   * @return Scaled vector
   */
  public static float[] scale(float[] vector, float factor) {
    return new float[] { vector[0] * factor, vector[1] * factor, vector[2] * factor };
  }

  /**
   * Calculates a unity vector of the length 1 of the given vector.
   * 
   * @param vector Vector
   * @return Normalized vector
   */
  public static float[] normalize(float[] vector) {
    return scale(vector, 1f / length(vector));
  }

  /**
   * Calculates the angle between two vectors in radians.
   * 
   * @param v1 First vector
   * @param v2 Second vector
   * @return Angle between the vector in radians
   */
  public static double angle(float[] v1, float[] v2) {
    return Math.acos(dot(v1, v2) / length(v1) / length(v2));
  }

  /**
   * Calculates the inverse of a matrix.
   *
   * Also note that since this routine is slow anyway, we won't worry
   * about allocating a little bit of garbage.
   * 
   * @param matrix Matrix, which should be inverted
   * @return Inverse matrix
   */
  public static float[] invertMatrix(float[] matrix) {
    float tmp[] = new float[16];
    int row_perm[] = new int[4];

    // Use LU decomposition and backsubstitution code specifically
    // for floating-point 4x4 matrices.

    // Copy source matrix to tmp
    System.arraycopy(matrix, 0, tmp, 0, tmp.length);

    // Calculate LU decomposition: Is the matrix singular?
    if (!luDecomposition(tmp, row_perm)) {
      // Matrix has no inverse
      throw new IllegalStateException();
    }

    // Perform back substitution on the identity matrix
    // luDecomposition will set rot[] & scales[] for use
    // in luBacksubstituation
    float newMatrix[] = new float[16];
    newMatrix[0] = 1.0f;
    newMatrix[1] = 0.0f;
    newMatrix[2] = 0.0f;
    newMatrix[3] = 0.0f;
    newMatrix[4] = 0.0f;
    newMatrix[5] = 1.0f;
    newMatrix[6] = 0.0f;
    newMatrix[7] = 0.0f;
    newMatrix[8] = 0.0f;
    newMatrix[9] = 0.0f;
    newMatrix[10] = 1.0f;
    newMatrix[11] = 0.0f;
    newMatrix[12] = 0.0f;
    newMatrix[13] = 0.0f;
    newMatrix[14] = 0.0f;
    newMatrix[15] = 1.0f;
    luBacksubstitution(tmp, row_perm, newMatrix);

    return newMatrix;
  }

  /**
   * Given a 4x4 array "matrix0", this function replaces it with the
   * LU decomposition of a row-wise permutation of itself.  The input
   * parameters are "matrix0" and "dimen".  The array "matrix0" is also
   * an output parameter.  The vector "row_perm[4]" is an output
   * parameter that contains the row permutations resulting from partial
   * pivoting.  The output parameter "even_row_xchg" is 1 when the
   * number of row exchanges is even, or -1 otherwise.  Assumes data
   * type is always double.
   *
   * This function is similar to luDecomposition, except that it
   * is tuned specifically for 4x4 matrices.
   *
   * @return true if the matrix is nonsingular, or false otherwise.
   */
  //
  // Reference: Press, Flannery, Teukolsky, Vetterling,
  //        _Numerical_Recipes_in_C_, Cambridge University Press,
  //        1988, pp 40-45.
  //
  private static boolean luDecomposition(float[] matrix0, int[] row_perm) {

    // Can't re-use this temporary since the method is static.
    float row_scale[] = new float[4];

    // Determine implicit scaling information by looping over rows
    {
      int i, j;
      int ptr, rs;
      float big, temp;

      ptr = 0;
      rs = 0;

      // For each row ...
      i = 4;
      while (i-- != 0) {
        big = 0.0f;

        // For each column, find the largest element in the row
        j = 4;
        while (j-- != 0) {
          temp = matrix0[ptr++];
          temp = Math.abs(temp);
          if (temp > big) {
            big = temp;
          }
        }

        // Is the matrix singular?
        if (big == 0.0) {
          return false;
        }
        row_scale[rs++] = 1.0f / big;
      }
    }

    {
      int j;
      int mtx;

      mtx = 0;

      // For all columns, execute Crout's method
      for (j = 0; j < 4; j++) {
        int i, imax, k;
        int target, p1, p2;
        float sum, big, temp;

        // Determine elements of upper diagonal matrix U
        for (i = 0; i < j; i++) {
          target = mtx + (4 * i) + j;
          sum = matrix0[target];
          k = i;
          p1 = mtx + (4 * i);
          p2 = mtx + j;
          while (k-- != 0) {
            sum -= matrix0[p1] * matrix0[p2];
            p1++;
            p2 += 4;
          }
          matrix0[target] = sum;
        }

        // Search for largest pivot element and calculate
        // intermediate elements of lower diagonal matrix L.
        big = 0.0f;
        imax = -1;
        for (i = j; i < 4; i++) {
          target = mtx + (4 * i) + j;
          sum = matrix0[target];
          k = j;
          p1 = mtx + (4 * i);
          p2 = mtx + j;
          while (k-- != 0) {
            sum -= matrix0[p1] * matrix0[p2];
            p1++;
            p2 += 4;
          }
          matrix0[target] = sum;

          // Is this the best pivot so far?
          if ((temp = row_scale[i] * Math.abs(sum)) >= big) {
            big = temp;
            imax = i;
          }
        }

        if (imax < 0) {
          return false;
        }

        // Is a row exchange necessary?
        if (j != imax) {
          // Yes: exchange rows
          k = 4;
          p1 = mtx + (4 * imax);
          p2 = mtx + (4 * j);
          while (k-- != 0) {
            temp = matrix0[p1];
            matrix0[p1++] = matrix0[p2];
            matrix0[p2++] = temp;
          }

          // Record change in scale factor
          row_scale[imax] = row_scale[j];
        }

        // Record row permutation
        row_perm[j] = imax;

        // Is the matrix singular
        if (matrix0[(mtx + (4 * j) + j)] == 0.0) {
          return false;
        }

        // Divide elements of lower diagonal matrix L by pivot
        if (j != (4 - 1)) {
          temp = 1.0f / (matrix0[(mtx + (4 * j) + j)]);
          target = mtx + (4 * (j + 1)) + j;
          i = 3 - j;
          while (i-- != 0) {
            matrix0[target] *= temp;
            target += 4;
          }
        }
      }
    }

    return true;
  }

  /**
   * Solves a set of linear equations.  The input parameters "matrix1",
   * and "row_perm" come from luDecompostionD4x4 and do not change
   * here.  The parameter "matrix2" is a set of column vectors assembled
   * into a 4x4 matrix of floating-point values.  The procedure takes each
   * column of "matrix2" in turn and treats it as the right-hand side of the
   * matrix equation Ax = LUx = b.  The solution vector replaces the
   * original column of the matrix.
   *
   * If "matrix2" is the identity matrix, the procedure replaces its contents
   * with the inverse of the matrix from which "matrix1" was originally
   * derived.
   */
  //
  // Reference: Press, Flannery, Teukolsky, Vetterling,
  //        _Numerical_Recipes_in_C_, Cambridge University Press,
  //        1988, pp 44-45.
  //
  private static void luBacksubstitution(float[] matrix1, int[] row_perm, float[] matrix2) {

    int i, ii, ip, j, k;
    int rp;
    int cv, rv;

    rp = 0;

    // For each column vector of matrix2 ...
    for (k = 0; k < 4; k++) {
      cv = k;
      ii = -1;

      // Forward substitution
      for (i = 0; i < 4; i++) {
        float sum;

        ip = row_perm[rp + i];
        sum = matrix2[cv + 4 * ip];
        matrix2[cv + 4 * ip] = matrix2[cv + 4 * i];
        if (ii >= 0) {
          rv = i * 4;
          for (j = ii; j <= i - 1; j++) {
            sum -= matrix1[rv + j] * matrix2[cv + 4 * j];
          }
        } else if (sum != 0.0) {
          ii = i;
        }
        matrix2[cv + 4 * i] = sum;
      }

      // Backsubstitution
      rv = 3 * 4;
      matrix2[cv + 4 * 3] /= matrix1[rv + 3];

      rv -= 4;
      matrix2[cv + 4 * 2] = (matrix2[cv + 4 * 2] - matrix1[rv + 3] * matrix2[cv + 4 * 3]) / matrix1[rv + 2];

      rv -= 4;
      matrix2[cv + 4 * 1] = (matrix2[cv + 4 * 1] - matrix1[rv + 2] * matrix2[cv + 4 * 2] - matrix1[rv + 3] * matrix2[cv + 4 * 3]) /
              matrix1[rv + 1];

      rv -= 4;
      matrix2[cv + 4 * 0] = (matrix2[cv + 4 * 0] - matrix1[rv + 1] * matrix2[cv + 4 * 1] - matrix1[rv + 2] * matrix2[cv + 4 * 2] - matrix1[rv + 3] *
              matrix2[cv + 4 * 3]) /
              matrix1[rv + 0];
    }
  }
}
