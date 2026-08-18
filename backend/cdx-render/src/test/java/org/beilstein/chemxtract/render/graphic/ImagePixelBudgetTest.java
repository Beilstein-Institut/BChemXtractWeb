package org.beilstein.chemxtract.render.graphic;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.zip.CRC32;

import org.junit.Test;

/**
 * Guards the embedded-picture heap ceiling.
 *
 * <p>A ChemDraw file can embed a picture whose header declares enormous pixel
 * dimensions while compressing to almost nothing. Decoding one allocates about
 * four bytes per pixel and would exhaust the JVM heap; the backend runs with
 * {@code -XX:+ExitOnOutOfMemoryError}, so that would terminate the process and
 * drop every concurrent request. These tests pin the refusal, and pin that it
 * happens from the header — before any raster is allocated.
 */
public class ImagePixelBudgetTest {

  /**
   * Build a PNG carrying only a signature and an IHDR chunk. That is enough for
   * {@code ImageReader.getWidth}/{@code getHeight}, and deliberately not enough
   * to decode — so a test that passes proves the refusal came from the header.
   */
  private static byte[] pngHeaderOnly(int width, int height) throws IOException {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    out.write(new byte[] {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A});

    ByteArrayOutputStream ihdr = new ByteArrayOutputStream();
    ihdr.write(new byte[] {'I', 'H', 'D', 'R'});
    writeInt(ihdr, width);
    writeInt(ihdr, height);
    ihdr.write(8); // bit depth
    ihdr.write(2); // colour type: truecolour
    ihdr.write(0); // compression
    ihdr.write(0); // filter
    ihdr.write(0); // interlace
    byte[] chunk = ihdr.toByteArray();

    writeInt(out, chunk.length - 4); // length excludes the type field
    out.write(chunk);
    CRC32 crc = new CRC32();
    crc.update(chunk);
    writeInt(out, (int) crc.getValue());
    return out.toByteArray();
  }

  private static void writeInt(ByteArrayOutputStream out, int value) {
    out.write(value >>> 24);
    out.write(value >>> 16);
    out.write(value >>> 8);
    out.write(value);
  }

  @Test
  public void refusesPngWhoseHeaderDeclaresMoreThanTheBudget() throws Exception {
    // 20000 x 20000 = 400 megapixels, about 1.6 GB of raster.
    byte[] bomb = pngHeaderOnly(20_000, 20_000);
    ImagePixelBudget budget = new ImagePixelBudget();

    try {
      PNGGraphicReader.readGraphic(new ByteArrayInputStream(bomb), budget);
      fail("oversized picture was decoded instead of refused");
    } catch (IOException expected) {
      assertTrue(
          "unexpected failure reason: " + expected.getMessage(),
          expected.getMessage().contains("exceeds the permitted size"));
    }
    assertEquals("refused picture must not consume budget", 0L, budget.used());
  }

  @Test
  public void acceptsAPictureThatFitsAndChargesIt() throws Exception {
    ImagePixelBudget budget = new ImagePixelBudget();
    // A 300 dpi A4 scan — the largest artwork a real document plausibly embeds.
    budget.claim(2480, 3508);
    assertEquals(2480L * 3508L, budget.used());
  }

  @Test
  public void refusesTheSecondPictureOnceTheBudgetIsSpent() throws Exception {
    ImagePixelBudget budget = new ImagePixelBudget();
    long half = ImagePixelBudget.MAX_TOTAL_PIXELS / 2;
    budget.claim(half, 1);
    budget.claim(half, 1);

    try {
      budget.claim(1000, 1000);
      fail("budget kept granting pixels after the ceiling was reached");
    } catch (IOException expected) {
      assertEquals(ImagePixelBudget.MAX_TOTAL_PIXELS, budget.used());
    }
  }

  @Test
  public void refusesNonPositiveDimensions() {
    ImagePixelBudget budget = new ImagePixelBudget();
    try {
      budget.claim(0, 1000);
      fail("zero-width picture was accepted");
    } catch (IOException expected) {
      assertTrue(expected.getMessage().contains("non-positive"));
    }
  }
}
