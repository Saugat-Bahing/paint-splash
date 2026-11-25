function hexToRgba(hex) {
  const value = hex.replace("#", "");
  if (!/^[\da-f]{6}([\da-f]{2})?$/i.test(value)) {
    throw new Error(`Invalid sprite color: ${hex}`);
  }

  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
    value.length === 8 ? Number.parseInt(value.slice(6, 8), 16) : 255,
  ];
}

/**
 * Turns rows of palette keys into a WebGL texture.
 * Use "." for transparent pixels, for example: ["..xx..", ".xxxx.", "..xx.."].
 */
export function spriteFromRows(renderer, rows, palette) {
  const width = rows[0]?.length ?? 0;
  if (!width || rows.some((row) => row.length !== width)) {
    throw new Error("Sprite rows must be non-empty and have equal widths.");
  }

  const pixels = new Uint8Array(width * rows.length * 4);

  rows.forEach((row, y) => {
    [...row].forEach((key, x) => {
      if (key === ".") return;
      if (!palette[key]) throw new Error(`Missing palette entry: ${key}`);

      pixels.set(hexToRgba(palette[key]), (y * width + x) * 4);
    });
  });

  return {
    texture: renderer.createTexture(width, rows.length, pixels),
    width,
    height: rows.length,
  };
}
