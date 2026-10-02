import * as THREE from 'three';

const FONT_PIXELS = 64;
const PADDING_PIXELS = 18;
const LINE_SPACING = 1.3;
const SIZE_FACTOR = 0.8;
export const LABEL_FONT_FAMILY = '"JetBrains Mono", ui-monospace, monospace';

/** How a label looks. */
export interface LabelStyle {
  colour: string;
  height: number;
  background?: string | null;
  bold?: boolean;
  anchor?: 'left' | 'centre';
}

/** Draws text onto a sprite that always faces the camera, in JetBrains Mono. */
export class LabelSprite {
  /**
   * Makes a label.
   * @param text The text, where each line is drawn on its own row and the first row is drawn bold when asked.
   * @param style The colour, the nominal height of one row in scene units (drawn at 80% of it), an optional pill background, boldness and anchor.
   * @returns The sprite.
   */
  create(text: string, style: LabelStyle): THREE.Sprite {
    const lines = text.split('\n');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (context === null) {
      return new THREE.Sprite();
    }
    const boldFont = `600 ${FONT_PIXELS}px ${LABEL_FONT_FAMILY}`;
    const plainFont = `400 ${FONT_PIXELS}px ${LABEL_FONT_FAMILY}`;
    let widest = 0;
    lines.forEach((line, index) => {
      context.font = style.bold === true && index === 0 ? boldFont : plainFont;
      widest = Math.max(widest, context.measureText(line).width);
    });
    canvas.width = Math.ceil(widest + PADDING_PIXELS * 2);
    canvas.height = Math.ceil(lines.length * FONT_PIXELS * LINE_SPACING + PADDING_PIXELS);
    if (style.background) {
      context.fillStyle = style.background;
      context.beginPath();
      context.roundRect(0, 0, canvas.width, canvas.height, canvas.height > FONT_PIXELS * 2 ? 22 : canvas.height / 2);
      context.fill();
    }
    context.fillStyle = style.colour;
    context.textBaseline = 'top';
    lines.forEach((line, index) => {
      context.font = style.bold === true && index === 0 ? boldFont : plainFont;
      context.globalAlpha = index === 0 ? 1 : 0.78;
      context.fillText(line, PADDING_PIXELS, PADDING_PIXELS / 2 + index * FONT_PIXELS * LINE_SPACING + 4);
    });
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    });
    const sprite = new THREE.Sprite(material);
    const scale = (style.height * SIZE_FACTOR * lines.length * LINE_SPACING) / canvas.height;
    sprite.scale.set(canvas.width * scale, canvas.height * scale, 1);
    sprite.center.set(style.anchor === 'centre' ? 0.5 : 0, 0.5);
    sprite.renderOrder = 10;
    return sprite;
  }

  /**
   * Turns a CSS colour into a translucent version for a label's background pill.
   * @param colour A CSS hex colour such as "#21252b".
   * @param opacity How opaque the pill is, from 0 to 1.
   * @returns An rgba() colour.
   */
  pill(colour: string, opacity: number): string {
    const hex = new THREE.Color(colour).getHexString();
    const red = parseInt(hex.slice(0, 2), 16);
    const green = parseInt(hex.slice(2, 4), 16);
    const blue = parseInt(hex.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
  }
}

export const labelSprite = new LabelSprite();
