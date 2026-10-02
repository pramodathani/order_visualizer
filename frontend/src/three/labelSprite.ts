import * as THREE from 'three';

const FONT_PIXELS = 44;
const PADDING_PIXELS = 14;

/** Draws text onto a sprite that always faces the camera. */
export class LabelSprite {
  /**
   * Makes a label.
   * @param text The text, where each line is drawn on its own row.
   * @param colour The text colour, as CSS.
   * @param height The height of one row of text in scene units.
   * @returns The sprite, anchored at its left middle.
   */
  create(text: string, colour: string, height: number): THREE.Sprite {
    const lines = text.split('\n');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (context === null) {
      return new THREE.Sprite();
    }
    const font = `${FONT_PIXELS}px Roboto, system-ui, sans-serif`;
    context.font = font;
    let widest = 0;
    for (const line of lines) {
      widest = Math.max(widest, context.measureText(line).width);
    }
    canvas.width = Math.ceil(widest + PADDING_PIXELS * 2);
    canvas.height = Math.ceil(lines.length * FONT_PIXELS * 1.25 + PADDING_PIXELS);
    context.font = font;
    context.fillStyle = colour;
    context.textBaseline = 'top';
    lines.forEach((line, index) => {
      context.fillText(line, PADDING_PIXELS, PADDING_PIXELS / 2 + index * FONT_PIXELS * 1.25);
    });
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    const scale = (height * lines.length * 1.25) / canvas.height;
    sprite.scale.set(canvas.width * scale, canvas.height * scale, 1);
    sprite.center.set(0, 0.5);
    return sprite;
  }
}

export const labelSprite = new LabelSprite();
