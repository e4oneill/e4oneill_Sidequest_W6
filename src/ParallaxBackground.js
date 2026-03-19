// src/ParallaxBackground.js
// Parallax background renderer (VIEW layer).

export class ParallaxBackground {
  constructor(layers = []) {
    this.layers = layers;
  }

  draw({ cameraX = 0, viewW, viewH }) {
    camera.off();
    drawingContext.imageSmoothingEnabled = false;

    for (const layer of this.layers) {
      const { img, factor = 1 } = layer;
      if (!img) continue;

      // Wrap the scroll offset so it tiles seamlessly
      const scrollX = ((-cameraX * factor) % viewW + viewW) % viewW;

      // Draw two copies so the seam is always off-screen
      image(img, Math.round(scrollX - viewW), 0, viewW, viewH);
      image(img, Math.round(scrollX), 0, viewW, viewH);
    }

    camera.on();
  }
}
