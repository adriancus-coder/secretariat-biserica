// Rasterises public/icons/icon.svg into the PNG icons of the web app manifest (committed).
// Run after changing the SVG: node scripts/build-icons.mjs
import sharp from "sharp";
import { readFileSync } from "node:fs";

const svg = readFileSync(new URL("../public/icons/icon.svg", import.meta.url));
const out = (name) => new URL(`../public/icons/${name}`, import.meta.url).pathname;

for (const size of [192, 512]) await sharp(svg, { density: 300 }).resize(size, size).png().toFile(out(`icon-${size}.png`));
// Apple touch icon: iOS rounds the corners itself, so a square full-bleed background.
const square = Buffer.from(svg.toString().replace('rx="96"', 'rx="0"'));
await sharp(square, { density: 300 }).resize(180, 180).png().toFile(out("apple-touch-icon.png"));
// Maskable: full-bleed background, the mark inside the central 80 % safe zone.
const mark = await sharp(square, { density: 300 }).resize(400, 400).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: "#1B2843" } })
  .composite([{ input: mark, top: 56, left: 56 }])
  .png()
  .toFile(out("maskable-512.png"));
console.log("icons written");
