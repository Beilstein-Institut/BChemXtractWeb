package org.beilstein.chemxtract.render.graphic;

import java.awt.AlphaComposite;
import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Composite;
import java.awt.Dimension;
import java.awt.GradientPaint;
import java.awt.Graphics2D;
import java.awt.Image;
import java.awt.Paint;
import java.awt.Rectangle;
import java.awt.RenderingHints;
import java.awt.Shape;
import java.awt.Stroke;
import java.awt.Transparency;
import java.awt.geom.AffineTransform;
import java.awt.geom.GeneralPath;
import java.awt.geom.PathIterator;
import java.awt.geom.Point2D;
import java.awt.geom.Rectangle2D;
import java.awt.image.BufferedImage;
import java.awt.image.ColorModel;
import java.awt.image.ImageObserver;
import java.awt.image.RenderedImage;
import java.awt.image.VolatileImage;
import java.awt.image.WritableRaster;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Hashtable;
import java.util.Iterator;
import java.util.Locale;
import java.util.Map;
import java.util.Map.Entry;
import java.util.Properties;
import java.util.StringTokenizer;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.*;

import javax.imageio.metadata.IIOInvalidTreeException;
import javax.imageio.metadata.IIOMetadata;
import javax.imageio.metadata.IIOMetadataNode;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.beilstein.chemxtract.render.Base64;
import org.beilstein.chemxtract.render.IOUtils;
import org.w3c.dom.NamedNodeMap;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

/**
 * This class holds various helper methods for the graphic package.
 * 
 * @author stephan
 * @version $Id: GraphicUtils.java,v 1.29 2014-06-12 11:32:56 bsnie Exp $
 */
public class GraphicUtils {
  private static final Log logger = LogFactory.getLog(GraphicUtils.class);

  public static final int STANDARD_RESOLUTION = 72;

  private static Map<String,Float> widths = new HashMap<>();

  static {
    try {
      Properties properties = new Properties();
      properties.load(GraphicUtils.class.getResourceAsStream("graphic.properties"));

      for (Entry<Object,Object> entry : properties.entrySet()) {
        String key = (String) entry.getKey();
        String value = (String) entry.getValue();
        if (value != null && value.length() > 0 && key.endsWith(".width")) {
          widths.put(key.substring(0, key.length() - 6), Float.parseFloat(value));
        }
      }
      for (Entry<String,Float> width : widths.entrySet()) {
        logger.debug("graphic id=" + width.getKey() + " width=" + width.getValue());
      }
    } catch (IOException e) {
      logger.error("Could not load graphic properties", e);
    }
  }

  public static Dimension getImageSize(File file) throws Exception {
    String suffix = IOUtils.getExtension(file.getName());
    Iterator<ImageReader> iter = ImageIO.getImageReadersBySuffix(suffix);
    while (iter.hasNext()) {
      ImageReader reader = iter.next();
      try {
        ImageInputStream stream = new FileImageInputStream(file);
        reader.setInput(stream);
        int width = reader.getWidth(reader.getMinIndex());
        int height = reader.getHeight(reader.getMinIndex());
        return new Dimension(width, height);
      } catch (IOException e) {
        throw e;
      } finally {
        reader.dispose();
      }
    }
    return null;
  }
  
  public static Dimension getImageSize(byte[] buf, String filename) throws Exception {
    String suffix = IOUtils.getExtension(filename);
    Iterator<ImageReader> iter = ImageIO.getImageReadersBySuffix(suffix);
    while (iter.hasNext()) {
      ImageReader reader = iter.next();
      try {
        ImageInputStream stream = new MemoryCacheImageInputStream(new ByteArrayInputStream(buf));
        reader.setInput(stream);
        int width = reader.getWidth(reader.getMinIndex());
        int height = reader.getHeight(reader.getMinIndex());
        return new Dimension(width, height);
      } catch (IOException e) {
        throw e;
      } finally {
        reader.dispose();
      }
    }
    return null;
  }

  /**
   * Calculate the scaling factor for the given parameters. All parameters are optional.
   * 
   * @param graphic Original graphic
   * @param width New width, or -1 otherwise
   * @param height New height, or -1 otherwise
   * @param maxWidth New maximum width, or -1 otherwise
   * @param maxHeight New maximum height, or -1 otherwise
   * @param scale New scale factor, or -1 otherwise
   * @return Scaling factor
   */
  public static double getScalingFactor(Graphic graphic, double width, double height, double maxWidth, double maxHeight, double scale) {
    if (graphic == null) {
      return 1f;
    }
    if (width <= 0 && height <= 0 && maxWidth <= 0 && maxHeight <= 0 && scale <= 0) {
      return 1f;
    }

    Rectangle2D origBounds = graphic.getBounds();

    double origWidth = origBounds.getWidth();
    double origHeight = origBounds.getHeight();

    double factor = Double.MAX_VALUE;

    if (width > 0) {
      factor = Math.min(factor, width / origWidth);
    }
    if (height > 0) {
      factor = Math.min(factor, height / origHeight);
    }

    if (factor == Double.MAX_VALUE && scale > 0) {
      factor = scale;
    }

    if (factor == Double.MAX_VALUE) {
      factor = 1.0;
    }

    if (maxWidth > 0) {
      factor = Math.min(factor, maxWidth / origWidth);
    }
    if (maxHeight > 0) {
      factor = Math.min(factor, maxHeight / origHeight);
    }
    return factor;
  }

  /**
   * Create a new scaled graphic from a given graphic. This method will not change the aspect ratio.
   * All parameters are optional.
   * 
   * @param graphic Original graphic
   * @param width New width, or -1 otherwise
   * @param height New height, or -1 otherwise
   * @param maxWidth New maximum width, or -1 otherwise
   * @param maxHeight New maximum height, or -1 otherwise
   * @param scale New scale factor, or -1 otherwise
   * @return Scaled graphic
   */
  public static Graphic createScaledGraphic(Graphic graphic, double width, double height, double maxWidth, double maxHeight, double scale) {
    if (graphic == null) {
      return null;
    }
    if (width <= 0 && height <= 0 && maxWidth <= 0 && maxHeight <= 0 && scale <= 0) {
      return graphic;
    }

    Rectangle2D origBounds = graphic.getBounds();

    double origWidth = origBounds.getWidth();
    double origHeight = origBounds.getHeight();

    if (logger.isDebugEnabled()) {
      logger.debug("Scale graphic from (" + origWidth + "/" + origHeight + ") to width:" + width + " height:" + height + " max-width:" +
              maxWidth + " max-height:" + maxHeight + " scale:" + scale);
    }

    double factor = getScalingFactor(graphic, width, height, maxWidth, maxHeight, scale);

    double newWidth = origWidth * factor;
    double newHeight = origHeight * factor;

    if (logger.isDebugEnabled()) {
      logger.debug("New size for graphic (" + newWidth + "/" + newHeight + ") and factor:" + factor);
    }

    double completeWidth = newWidth;
    double completeHeight = newHeight;

    if (width > 0) {
      completeWidth = (float) width;
    }
    if (height > 0) {
      completeHeight = (float) height;
    }

    if (maxWidth > 0 && maxWidth < completeWidth) {
      completeWidth = (float) maxWidth;
    }
    if (maxHeight > 0 && maxHeight < completeHeight) {
      completeHeight = (float) maxHeight;
    }

    Rectangle2D outerBounds =
            new Rectangle2D.Double(0, 0, completeWidth > 0 ? completeWidth : newWidth, completeHeight > 0 ? completeHeight : newHeight);
    CompositeGraphic outerGraphic = new CompositeGraphic(outerBounds, outerBounds);
    Rectangle2D innerBounds = new Rectangle2D.Double(completeWidth > 0 ? (completeWidth - newWidth) / 2 : 0,
            completeHeight > 0 ? (completeHeight - newHeight) / 2 : 0, newWidth, newHeight);
    CompositeGraphic innerGraphic = new CompositeGraphic(innerBounds, graphic.getBounds());
    innerGraphic.addGraphic(graphic);
    outerGraphic.addGraphic(innerGraphic);
    outerGraphic.setType(graphic.getType());
    return outerGraphic;
  }

  public static Graphic createScaledImageGraphic(Graphic graphic, double width, double height, double maxWidth, double maxHeight,
    double scale, int resolution) {
    if (graphic == null) {
      return null;
    }
    if (width <= 0 && height <= 0 && maxWidth <= 0 && maxHeight <= 0 && scale <= 0) {
      return graphic;
    }

    if (graphic.getType().isVector()) {
      throw new IllegalArgumentException("Graphic is a vector graphic");
    }

    Rectangle2D origBounds = graphic.getBounds();

    double origWidth = origBounds.getWidth();
    double origHeight = origBounds.getHeight();

    if (logger.isDebugEnabled()) {
      logger.debug("Scale graphic from (" + origWidth + "/" + origHeight + ") to width:" + width + " height:" + height + " max-width:" +
              maxWidth + " max-height:" + maxHeight + " scale:" + scale);
    }

    double factor = getScalingFactor(graphic, width, height, maxWidth, maxHeight, scale);

    double newWidth = origWidth * factor;
    double newHeight = origHeight * factor;

    if (logger.isDebugEnabled()) {
      logger.debug("New size for graphic (" + newWidth + "/" + newHeight + ") and factor:" + factor);
    }

    double completeWidth = newWidth;
    double completeHeight = newHeight;

    if (width > 0) {
      completeWidth = (float) width;
    }
    if (height > 0) {
      completeHeight = (float) height;
    }

    if (maxWidth > 0 && maxWidth < completeWidth) {
      completeWidth = (float) maxWidth;
    }
    if (maxHeight > 0 && maxHeight < completeHeight) {
      completeHeight = (float) maxHeight;
    }

    Image image = graphic.getImage(false);

    if (image == null) {
      throw new IllegalArgumentException("Cannot get image of graphic with type " + graphic.getType());
    }

    BufferedImage scaledImage = createScaledImage(convertImage(image, BufferedImage.TYPE_INT_ARGB),
            (int) newWidth * resolution / STANDARD_RESOLUTION, (int) newHeight * resolution / STANDARD_RESOLUTION);

    ImageGraphic imageGraphic = new ImageGraphic(scaledImage, graphic.getType());

    Rectangle2D newBounds =
            new Rectangle2D.Double(0, 0, completeWidth > 0 ? completeWidth : newWidth, completeHeight > 0 ? completeHeight : newHeight);
    CompositeGraphic newGraphic = new CompositeGraphic(newBounds, newBounds);
    imageGraphic.setBounds(new Rectangle2D.Double(completeWidth > 0 ? (completeWidth - newWidth) / 2 : 0,
            completeHeight > 0 ? (completeHeight - newHeight) / 2 : 0, newWidth, newHeight));
    newGraphic.addGraphic(imageGraphic);
    newGraphic.setType(graphic.getType());
    return newGraphic;
  }

  /**
   * Apply predefined bounds to a graphic. These bounds are defined in a file called
   * graphic.properties.
   * 
   * @param publicId Public ID of the graphic
   * @param graphic Graphic
   * @return Scaled graphic
   */
  public static Graphic applyBounds(String publicId, Graphic graphic) {
    if (graphic != null && graphic.getType() != null && !graphic.getType().isVector()) {
      if (widths.get(publicId) != null) {
        return createScaledGraphic(graphic, widths.get(publicId), -1, -1, -1, -1);
      }
      logger.warn("No width specified for graphic " + publicId);
    }
    return graphic;
  }

  /**
   * Returns the predefined with for a graphic.
   * 
   * @param publicId Public ID
   * @return Predefined width
   */
  public static float getSpecifiedWidth(String publicId) {
    if (widths.get(publicId) != null) {
      return widths.get(publicId);
    }
    return -1;
  }

  /**
   * Make a {@link BufferedImage} transparent by replacing white pixels with pixels with the new
   * background color.
   * 
   * @param image Image
   * @param backgroundColor New background color
   */
  public static void makeTrasparent(BufferedImage image, Color backgroundColor) {
    int color = 0x00FFFFFF;
    if (backgroundColor != null) {
      color &= backgroundColor.getRGB();
    }

    // make white and grey areas transparant
    for (int i = 0; i < image.getHeight(); i++) {
      for (int j = 0; j < image.getWidth(); j++) {
        int rgb = image.getRGB(j, i);
        int red = (rgb & 0x00FF0000) >> 16;
        int green = (rgb & 0x0000FF00) >> 8;
        int blue = rgb & 0x000000FF;
        int brightness = red + green + blue;
        if (brightness > 230 * 3) {
          image.setRGB(j, i, color);
        }
      }
    }
  }

  /**
   * Make a {@link BufferedImage} opaque.
   * 
   * @param image Image
   * @param backgroundColor new background color
   * @return New opaque image
   */
  public static BufferedImage makeOpaque(BufferedImage image, Color backgroundColor) {
    BufferedImage newImage = new BufferedImage(image.getWidth(null), image.getHeight(null), BufferedImage.TYPE_INT_RGB);

    Graphics2D graphics = newImage.createGraphics();
    graphics.setColor(backgroundColor);
    graphics.fillRect(0, 0, image.getWidth(null), image.getHeight(null));
    graphics.drawImage(image, 0, 0, null);
    graphics.dispose();

    return newImage;
  }

  public static int[] getResolution(IIOMetadata metadata) {
    String formatName = "javax_imageio_1.0";
    IIOMetadataNode rootNode = (IIOMetadataNode) metadata.getAsTree(formatName);
    IIOMetadataNode node = (IIOMetadataNode) rootNode.getFirstChild();
    int[] resolution = { 72, 72 };
    while (node != null) {
      if (node.getNodeName().equals("Dimension")) {
        Node n2 = node.getFirstChild();
        while (n2 != null) {
          if (n2.getNodeName().equals("HorizontalPixelSize")) {
            NamedNodeMap nnm = n2.getAttributes();
            float ps = Float.parseFloat(nnm.item(0).getNodeValue());
            resolution[0] = Math.round(25.4f / ps);
          }

          if (n2.getNodeName().equals("VerticalPixelSize")) {
            NamedNodeMap nnm = n2.getAttributes();
            float ps = Float.parseFloat(nnm.item(0).getNodeValue());
            resolution[1] = Math.round(25.4f / ps);
          }
          n2 = n2.getNextSibling();
        }
      }
      node = (IIOMetadataNode) node.getNextSibling();
    }
    return resolution;
  }

  public static void setResolution(IIOMetadata metadata, int[] resolution) throws IIOInvalidTreeException {
    String formatName = "javax_imageio_1.0";
    IIOMetadataNode rootNode = (IIOMetadataNode) metadata.getAsTree(formatName);
    NodeList nodeList1 = rootNode.getElementsByTagName("Dimension");
    IIOMetadataNode n1;
    if (nodeList1.getLength() == 0) {
      n1 = new IIOMetadataNode("Dimension");
      rootNode.appendChild(n1);
    } else {
      n1 = (IIOMetadataNode) nodeList1.item(0);
    }
    NodeList nodeList2 = rootNode.getElementsByTagName("HorizontalPixelSize");
    IIOMetadataNode n2;
    if (nodeList2.getLength() == 0) {
      n2 = new IIOMetadataNode("HorizontalPixelSize");
      n1.appendChild(n2);
    } else {
      n2 = (IIOMetadataNode) nodeList2.item(0);
    }
    n2.setAttribute("value", Float.toString(25.4f / resolution[0]));

    nodeList2 = rootNode.getElementsByTagName("VerticalPixelSize");
    if (nodeList2.getLength() == 0) {
      n2 = new IIOMetadataNode("VerticalPixelSize");
      n1.appendChild(n2);
    } else {
      n2 = (IIOMetadataNode) nodeList2.item(0);
    }
    n2.setAttribute("value", Float.toString(25.4f / resolution[1]));

    metadata.setFromTree(formatName, rootNode);
  }

  /**
   * <p> Returns a scale image of a source image. </p> <p> This method offers a good trade-off
   * between speed and quality. The result looks better when the new size is less than half the
   * longest dimension of the source image, yet the rendering speed is almost similar. </p>
   * 
   * @param image the source image
   * @param newWidth the width of the scaled image
   * @param newHeight the height of the scaled image
   * @return a new compatible <code>BufferedImage</code> containing a thumbnail of
   *         <code>image</code>
   * @throws IllegalArgumentException if <code>newWidth</code> is larger than the width of
   *           <code>image</code> or if code>newHeight</code> is larger than the height of
   *           <code>image or if one the dimensions is not &gt; 0</code>
   */
  private static BufferedImage createScaledImage(BufferedImage image, int newWidth, int newHeight) {
    int width = image.getWidth();
    int height = image.getHeight();

    // don't scape image if the image must be scale up
    if (newWidth >= width && newHeight >= height) {
      return image;
    } else if (newWidth <= 0 || newHeight <= 0) {
      return image;
    }

    // limit new dimensions to the original dimension, to prevent the up scaling
    if (newWidth > width) {
      newWidth = width;
    }
    if (newHeight > height) {
      newHeight = height;
    }

    ImageScaler scaler = new ImageScaler();
    return scaler.scale(image, width, height, newWidth, newHeight);

  }

  /**
   * Convert an {@link Image} into an instance of {@link BufferedImage}.
   * 
   * @param image Instance of {@link Image}
   * @param imageType type of the created image. See {@link BufferedImage} for more information
   * @return Instance of {@link BufferedImage}
   * 
   * @see http://www.coderanch.com/t/380929/Java-General/java/convert-Image-RenderedImage
   */
  public static BufferedImage convertImage(final Image image, final int imageType) {
    if (image instanceof BufferedImage) {
      return (BufferedImage) image;
    }
    if (image instanceof VolatileImage) {
      return ((VolatileImage) image).getSnapshot();
    }
    loadImage(image);
    final BufferedImage buffImg = new BufferedImage(image.getWidth(null), image.getHeight(null), imageType);
    final Graphics2D g2 = buffImg.createGraphics();
    g2.drawImage(image, null, null);
    g2.dispose();
    return buffImg;
  }

  private static void loadImage(final Image image) {
    class StatusObserver implements ImageObserver {
      boolean imageLoaded = false;

      @Override
      public boolean imageUpdate(final Image img, final int infoflags, final int x, final int y, final int width, final int height) {
        if (infoflags == ALLBITS) {
          synchronized (this) {
            imageLoaded = true;
            notifyAll();
          }
          return true;
        }
        return false;
      }
    }
    final StatusObserver imageStatus = new StatusObserver();
    synchronized (imageStatus) {
      if (image.getWidth(imageStatus) == -1 || image.getHeight(imageStatus) == -1) {
        while (!imageStatus.imageLoaded) {
          try {
            imageStatus.wait();
          } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
          }
        }
      }
    }
  }

  /**
   * Convert a {@link RenderedImage} into an instance of {@link BufferedImage}.
   * 
   * @param image Instance of {@link RenderedImage}
   * @return Instance of {@link BufferedImage}
   */
  public static BufferedImage convertRenderedImage(RenderedImage image) {
    if (image instanceof BufferedImage) {
      return (BufferedImage) image;
    }
    WritableRaster r = image.copyData(null);
    ColorModel cm = image.getColorModel();
    Hashtable<String,Object> properties = new Hashtable<String,Object>();
    String[] s = image.getPropertyNames();
    for (int a = 0; a < s.length; a++) {
      properties.put(s[a], image.getProperty(s[a]));
    }
    return new BufferedImage(cm, r, cm.isAlphaPremultiplied(), properties);
  }

  /**
   * THis method check the shape for invalid values
   * 
   * @param shape Shape
   */
  public static void checkShape(Shape shape) {
    if (shape == null) {
      throw new IllegalArgumentException("No shape given");
    }

    float[] coords = new float[6];
    for (PathIterator i = shape.getPathIterator(null); !i.isDone(); i.next()) {
      int type = i.currentSegment(coords);
      switch (type) {
        case PathIterator.SEG_MOVETO: {
          checkValues(coords, 2);
          break;
        }
        case PathIterator.SEG_LINETO: {
          checkValues(coords, 2);
          break;
        }
        case PathIterator.SEG_QUADTO: {
          checkValues(coords, 4);
          break;
        }
        case PathIterator.SEG_CUBICTO: {
          checkValues(coords, 6);
          break;
        }
        case PathIterator.SEG_CLOSE: {
          break;
        }
      }
    }
  }

  private static void checkValues(float[] values, int count) {
    for (int index = 0; index < count; index++) {
      if (Float.isNaN(values[index])) {
        throw new IllegalArgumentException("Invalid number: " + values[index]);
      }
      if (Float.isInfinite(values[index])) {
        throw new IllegalArgumentException("Invalid number: " + values[index]);
      }
    }
  }

  /**
   * Convert a shape to a string.
   * 
   * @param shape Instance of a {@link Shape}
   * @return Text representation
   */
  public static String toString(Shape shape) {
    StringBuilder sb = new StringBuilder();

    DecimalFormat format = new DecimalFormat("######.###", new DecimalFormatSymbols(Locale.ENGLISH));

    if (shape != null) {
      float[] coords = new float[6];
      for (PathIterator i = shape.getPathIterator(null); !i.isDone(); i.next()) {
        int type = i.currentSegment(coords);
        switch (type) {
          case PathIterator.SEG_MOVETO: {
            sb.append(" M " + format.format(coords[0]) + " " + format.format(coords[1]));
            break;
          }
          case PathIterator.SEG_LINETO: {
            sb.append(" L " + format.format(coords[0]) + " " + format.format(coords[1]));
            break;
          }
          case PathIterator.SEG_QUADTO: {
            sb.append(" Q " + format.format(coords[0]) + " " + format.format(coords[1]) + " " + format.format(coords[2]) + " " +
                    format.format(coords[3]));
            break;
          }
          case PathIterator.SEG_CUBICTO: {
            sb.append(" C " + format.format(coords[0]) + " " + format.format(coords[1]) + " " + format.format(coords[2]) + " " +
                    format.format(coords[3]) + " " + format.format(coords[4]) + " " + format.format(coords[5]));
            break;
          }
          case PathIterator.SEG_CLOSE: {
            sb.append(" Z");
            break;
          }
        }
      }
    }
    return sb.length() > 0 ? sb.toString().substring(1) : "";
  }

  /**
   * Convert a string to a shape.
   * 
   * @param string Text representation of a shape
   * @return Shape
   */
  public static Shape toShape(String string) {
    StringTokenizer tokenizer = new StringTokenizer(string);
    GeneralPath path = new GeneralPath();
    while (tokenizer.hasMoreTokens()) {
      String token = tokenizer.nextToken();
      if (token.equals("M")) {
        double[] coords = new double[2];
        for (int i = 0; i < coords.length; i++) {
          if (!tokenizer.hasMoreTokens()) {
            throw new IllegalArgumentException();
          }
          String token2 = tokenizer.nextToken();
          try {
            coords[i] = Double.parseDouble(token2);
          } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Unable to parse number \"" + token2 + "\" in \"" + string + "\"");
          }
        }
        path.moveTo(coords[0], coords[1]);
      } else if (token.equals("L")) {
        double[] coords = new double[2];
        for (int i = 0; i < coords.length; i++) {
          if (!tokenizer.hasMoreTokens()) {
            throw new IllegalArgumentException();
          }
          String token2 = tokenizer.nextToken();
          try {
            coords[i] = Double.parseDouble(token2);
          } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Unable to parse number \"" + token2 + "\" in \"" + string + "\"");
          }
        }
        path.lineTo(coords[0], coords[1]);
      } else if (token.equals("Q")) {
        double[] coords = new double[4];
        for (int i = 0; i < coords.length; i++) {
          if (!tokenizer.hasMoreTokens()) {
            throw new IllegalArgumentException();
          }
          String token2 = tokenizer.nextToken();
          try {
            coords[i] = Double.parseDouble(token2);
          } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Unable to parse number \"" + token2 + "\" in \"" + string + "\"");
          }
        }
        path.quadTo(coords[0], coords[1], coords[2], coords[3]);
      } else if (token.equals("C")) {
        double[] coords = new double[6];
        for (int i = 0; i < coords.length; i++) {
          if (!tokenizer.hasMoreTokens()) {
            throw new IllegalArgumentException();
          }
          String token2 = tokenizer.nextToken();
          try {
            coords[i] = Double.parseDouble(token2);
          } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Unable to parse number \"" + token2 + "\" in \"" + string + "\"");
          }
        }
        path.curveTo(coords[0], coords[1], coords[2], coords[3], coords[4], coords[5]);
      } else if (token.equals("Z")) {
        path.closePath();
      } else {
        throw new IllegalArgumentException("Unknown command \"" + token + "\" in \"" + string + "\"");
      }
    }
    return path;
  }

  /**
   * Convert a {@link Composite} to a string.
   * 
   * @param composite Instance of a {@link Composite}
   * @return Text representation
   */
  public static String toString(Composite composite) {
    if (composite == AlphaComposite.Clear) {
      return "Clear";
    } else if (composite == AlphaComposite.Src) {
      return "Src";
    } else if (composite == AlphaComposite.Dst) {
      return "Dst";
    } else if (composite == AlphaComposite.SrcOver) {
      return "SrcOver";
    } else if (composite == AlphaComposite.DstOver) {
      return "DstOver";
    } else if (composite == AlphaComposite.SrcIn) {
      return "SrcIn";
    } else if (composite == AlphaComposite.DstIn) {
      return "DstIn";
    } else if (composite == AlphaComposite.SrcOut) {
      return "SrcOut";
    } else if (composite == AlphaComposite.DstOut) {
      return "DstOut";
    } else if (composite == AlphaComposite.SrcAtop) {
      return "SrcAtop";
    } else if (composite == AlphaComposite.DstAtop) {
      return "DstAtop";
    } else if (composite == AlphaComposite.Xor) {
      return "Xor";
    } else {
      throw new IllegalArgumentException("Unknown composite: " + composite);
    }
  }

  public static Composite toComposite(String string) {
    if ("Clear".equals(string)) {
      return AlphaComposite.Clear;
    } else if ("Src".equals(string)) {
      return AlphaComposite.Src;
    } else if ("Dst".equals(string)) {
      return AlphaComposite.Dst;
    } else if ("SrcOver".equals(string)) {
      return AlphaComposite.SrcOver;
    } else if ("DstOver".equals(string)) {
      return AlphaComposite.DstOver;
    } else if ("SrcIn".equals(string)) {
      return AlphaComposite.SrcIn;
    } else if ("DstIn".equals(string)) {
      return AlphaComposite.DstIn;
    } else if ("SrcOut".equals(string)) {
      return AlphaComposite.SrcOut;
    } else if ("DstOut".equals(string)) {
      return AlphaComposite.DstOut;
    } else if ("SrcAtop".equals(string)) {
      return AlphaComposite.SrcAtop;
    } else if ("DstAtop".equals(string)) {
      return AlphaComposite.DstAtop;
    } else if ("Xor".equals(string)) {
      return AlphaComposite.Xor;
    }
    throw new IllegalArgumentException("Unable to determine composite: " + string);
  }

  /**
   * Compare two shapes.
   * 
   * @param shape1 First shape
   * @param shape2 Second shape
   * @return True, if the shapes are equal
   */
  public static boolean equals(Shape shape1, Shape shape2) {
    return equals(shape1, shape2, 0d);
  }

  /**
   * Compare two shapes.
   * 
   * @param shape1 First shape
   * @param shape2 Second shape
   * @param tolerance Tolerance for the coordinates
   * @return True, if the shapes are equal
   */
  public static boolean equals(Shape shape1, Shape shape2, double tolerance) {
    if (shape1 == null && shape2 == null) {
      return true;
    }
    if (shape1 == null || shape2 == null) {
      return false;
    }
    PathIterator pathIterator1 = shape1.getPathIterator(null);
    PathIterator pathIterator2 = shape2.getPathIterator(null);
    float[] coords1 = new float[6];
    float[] coords2 = new float[6];
    while (!pathIterator1.isDone() && !pathIterator2.isDone()) {
      int type1 = pathIterator1.currentSegment(coords1);
      int type2 = pathIterator2.currentSegment(coords2);
      if (type1 != type2) {
        return false;
      }
      int length = 0;
      switch (type1) {
        case PathIterator.SEG_MOVETO: {
          length = 2;
          break;
        }
        case PathIterator.SEG_LINETO: {
          length = 2;
          break;
        }
        case PathIterator.SEG_QUADTO: {
          length = 4;
          break;
        }
        case PathIterator.SEG_CUBICTO: {
          length = 6;
          break;
        }
        case PathIterator.SEG_CLOSE: {
          break;
        }
      }
      for (int i = 0; i < length; i++) {
        if (Math.abs(coords1[i] - coords2[i]) > tolerance) {
          return false;
        }
      }
      pathIterator1.next();
      pathIterator2.next();
    }

    if (pathIterator1.isDone() ^ pathIterator2.isDone()) {
      return false;
    }
    return true;
  }

  public static boolean equals(AffineTransform transform1, AffineTransform transform2, float tolerance) {
    if (transform1 == null && transform2 == null) {
      return true;
    }
    if (transform1 == null || transform2 == null) {
      return false;
    }
    double[] values1 = new double[6];
    transform1.getMatrix(values1);
    double[] values2 = new double[6];
    transform2.getMatrix(values2);

    for (int i = 0; i < 6; i++) {
      if (Math.abs(values1[i] - values2[i]) > tolerance) {
        return false;
      }
    }
    return true;
  }

  public static boolean equals(Paint paint1, Paint paint2, float tolerance) {
    if (paint1 == null && paint2 == null) {
      return true;
    }
    if (paint1 == null || paint2 == null) {
      return false;
    }
    if (paint1 instanceof GradientPaint && paint2 instanceof GradientPaint) {
      GradientPaint gradientPaint1 = (GradientPaint) paint1;
      GradientPaint gradientPaint2 = (GradientPaint) paint2;
      if (!gradientPaint1.getColor1().equals(gradientPaint2.getColor1())) {
        return false;
      }
      if (!gradientPaint1.getColor2().equals(gradientPaint2.getColor2())) {
        return false;
      }
      if (!equals(gradientPaint1.getPoint1(), gradientPaint2.getPoint1(), tolerance)) {
        return false;
      }
      if (!equals(gradientPaint1.getPoint2(), gradientPaint2.getPoint2(), tolerance)) {
        return false;
      }
      if (gradientPaint1.isCyclic() != gradientPaint2.isCyclic()) {
        return false;
      }
      return true;

    }
    return paint1.equals(paint2);
  }

  public static boolean equals(Point2D point1, Point2D point2, float tolerance) {
    if (Math.abs(point1.getX() - point2.getX()) > tolerance) {
      return false;
    }
    if (Math.abs(point1.getY() - point2.getY()) > tolerance) {
      return false;
    }
    return true;
  }

  /**
   * Convert a {@link Stroke} to a string
   * 
   * @param stroke Instance of a {@link Stroke}
   * @return Text representation
   */
  public static String toString(Stroke stroke) {
    StringBuilder sb = new StringBuilder();
    if (stroke instanceof BasicStroke) {
      BasicStroke basicStroke = (BasicStroke) stroke;

      sb.append(basicStroke.getLineWidth());
      sb.append(" ");
      sb.append(basicStroke.getEndCap());
      sb.append(" ");
      sb.append(basicStroke.getLineJoin());
      sb.append(" ");
      sb.append(basicStroke.getMiterLimit());
    } else {
      throw new IllegalArgumentException("Unknown stroke: " + stroke);
    }
    return sb.toString();
  }

  public static BasicStroke toStroke(String string) {
    StringTokenizer tokenizer = new StringTokenizer(string);
    float[] values = new float[6];
    int index = 0;
    while (tokenizer.hasMoreTokens()) {
      if (index >= values.length) {
        throw new IllegalArgumentException("No more value " + values.length + " values allowed: " + string);
      }
      String token = tokenizer.nextToken();

      try {
        values[index++] = Float.parseFloat(token);
      } catch (NumberFormatException e) {
        throw new IllegalArgumentException("Invalid number found: " + string);
      }
    }
    return new BasicStroke(values[0], (int) values[1], (int) values[2], values[3]);
  }

  public static String toString(Color color) {
    return Integer.toHexString(color.getRGB());
  }

  public static String toString(Paint paint) {
    if (paint instanceof Color) {
      return toString((Color) paint);
    }
    throw new IllegalArgumentException("Unknown paint: " + paint);
  }

  public static Paint toPaint(String string) {
    return new Color((int) Long.parseLong(string.toUpperCase(), 16));
  }

  /**
   * Convert an {@link AffineTransform} to a string.
   * 
   * @param transform Instance of an {@link AffineTransform}
   * @return Text representation
   */
  public static String toString(AffineTransform transform) {
    StringBuilder sb = new StringBuilder();
    double[] values = new double[6];
    transform.getMatrix(values);

    DecimalFormat format = new DecimalFormat("######.###", new DecimalFormatSymbols(Locale.ENGLISH));

    for (int i = 0; i < values.length; i++) {
      if (i > 0) {
        sb.append(" ");
      }
      sb.append(format.format(values[i]));
    }
    return sb.toString();
  }

  public static AffineTransform toTransform(String string) {
    StringTokenizer tokenizer = new StringTokenizer(string);
    float[] values = new float[6];
    int index = 0;
    while (tokenizer.hasMoreTokens()) {
      if (index >= 6) {
        throw new IllegalArgumentException("No more value 6 values allowed: " + string);
      }
      String token = tokenizer.nextToken();

      try {
        values[index++] = Float.parseFloat(token);
      } catch (NumberFormatException e) {
        throw new IllegalArgumentException("Invalid number found: " + string);
      }
    }
    return new AffineTransform(values);
  }

  public static String toString(Rectangle rectangle) {
    return rectangle.x + " " + rectangle.y + " " + rectangle.width + " " + rectangle.height;
  }

  public static Rectangle toRectangle(String string) {
    StringTokenizer tokenizer = new StringTokenizer(string);
    int[] values = new int[4];
    int index = 0;
    while (tokenizer.hasMoreTokens()) {
      if (index >= 4) {
        throw new IllegalArgumentException("No more value 4 values allowed: " + string);
      }
      String token = tokenizer.nextToken();

      try {
        values[index++] = Integer.parseInt(token);
      } catch (NumberFormatException e) {
        throw new IllegalArgumentException("Invalid number found \"" + token + "\" in \"" + string + "\"");
      }
    }
    return new Rectangle(values[0], values[1], values[2], values[3]);
  }

  public static String toString(Rectangle2D rectangle) {
    return rectangle.getX() + " " + rectangle.getY() + " " + rectangle.getWidth() + " " + rectangle.getHeight();
  }

  public static Rectangle2D toRectangle2D(String string) {
    StringTokenizer tokenizer = new StringTokenizer(string);
    float[] values = new float[4];
    int index = 0;
    while (tokenizer.hasMoreTokens()) {
      if (index >= 4) {
        throw new IllegalArgumentException("No more value 4 values allowed: " + string);
      }
      String token = tokenizer.nextToken();

      try {
        values[index++] = Float.parseFloat(token);
      } catch (NumberFormatException e) {
        throw new IllegalArgumentException("Invalid number found \"" + token + "\" in \"" + string + "\"");
      }
    }
    return new Rectangle2D.Float(values[0], values[1], values[2], values[3]);
  }

  public static String toString(Image image) {
    try {
      BufferedImage bufferedImage = convertImage(image, BufferedImage.TYPE_INT_ARGB);

      ByteArrayOutputStream baos = new ByteArrayOutputStream();
      if (!ImageIO.write(bufferedImage, "png", baos)) {
        throw new IllegalStateException("Format not supported");
      }
      return Base64.encodeBytes(baos.toByteArray());
    } catch (IOException e) {
      throw new IllegalStateException("Cannot convert image to string", e);
    }
  }

  public static BufferedImage toImage(String string) {
    try {
      ByteArrayInputStream bais = new ByteArrayInputStream(Base64.decode(string));

      return ImageIO.read(bais);
    } catch (IOException e) {
      throw new IllegalStateException("Cannot convert string to image", e);
    }
  }

  public static Graphics2D debug(final Graphics2D g) {
    InvocationHandler handler = new InvocationHandler() {
      @Override
      public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
        String argsAsString = args != null ? Arrays.toString(args) : "";
        if (args != null) {
          argsAsString = argsAsString.substring(1, argsAsString.length() - 1);
        }
        logger.debug("Invoke " + method.getName() + "(" + argsAsString + ") from " + getLastStackTraceElement());
        return method.invoke(g, args);
      }

      private StackTraceElement getLastStackTraceElement() {
        Exception exception = new Exception();
        StackTraceElement[] stackTrace = exception.getStackTrace();
        return stackTrace[3];
      }
    };
    return (Graphics2D) Proxy.newProxyInstance(Graphics2D.class.getClassLoader(), new Class[] { Graphics2D.class }, handler);

  }
}
