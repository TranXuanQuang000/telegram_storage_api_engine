import sharp from "sharp";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("../artifacts/brand/muc-social-source.png", import.meta.url));
const output = fileURLToPath(new URL("../public/og.png", import.meta.url));

await sharp(source)
  .resize(1200, 630, { fit: "cover", position: "centre" })
  .png({ compressionLevel: 9 })
  .toFile(output);

function iconMarkup(size) {
  const stamp = Math.round(size * 0.58);
  const stampX = Math.round((size - stamp) / 2);
  return Buffer.from(`<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" rx="${Math.round(size * 0.2)}" fill="#171714"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${stamp / 2}" fill="#e4512e"/>
    <text x="50%" y="57%" text-anchor="middle" dominant-baseline="middle" fill="#fbf8f1" font-family="Georgia,serif" font-size="${Math.round(size * 0.43)}" font-style="italic" font-weight="700">M</text>
    <rect x="${stampX}" y="${Math.round(size * 0.79)}" width="${stamp}" height="${Math.max(3, Math.round(size * 0.025))}" fill="#f1eadc" opacity=".82"/>
  </svg>`);
}

for (const size of [192, 512]) {
  await sharp(iconMarkup(size)).png({ compressionLevel: 9 }).toFile(fileURLToPath(new URL(`../public/icon-${size}.png`, import.meta.url)));
}

await sharp(iconMarkup(64)).resize(64, 64).png({ compressionLevel: 9 }).toFile(fileURLToPath(new URL("../public/favicon.png", import.meta.url)));
