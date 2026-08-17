import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const srcDir = path.resolve(rootDir, 'assets-src');
const publicDir = path.resolve(rootDir, 'public');

async function generateIcons() {
  console.log('🚀 Đang tạo bộ icon PWA cho PlayFusion...');

  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  const logoSvgPath = path.resolve(srcDir, 'logo.svg');
  const maskableSvgPath = path.resolve(srcDir, 'logo-maskable.svg');

  const logoSvgBuffer = fs.readFileSync(logoSvgPath);
  const maskableSvgBuffer = fs.readFileSync(maskableSvgPath);

  // 1. pwa-192x192.png
  await sharp(logoSvgBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.resolve(publicDir, 'pwa-192x192.png'));
  console.log('✅ Đã tạo public/pwa-192x192.png');

  // 2. pwa-512x512.png
  await sharp(logoSvgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.resolve(publicDir, 'pwa-512x512.png'));
  console.log('✅ Đã tạo public/pwa-512x512.png');

  // 3. pwa-maskable-512x512.png
  await sharp(maskableSvgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.resolve(publicDir, 'pwa-maskable-512x512.png'));
  console.log('✅ Đã tạo public/pwa-maskable-512x512.png');

  // 4. apple-touch-icon.png (180x180 cho iOS)
  await sharp(logoSvgBuffer)
    .resize(180, 180)
    .png()
    .toFile(path.resolve(publicDir, 'apple-touch-icon.png'));
  console.log('✅ Đã tạo public/apple-touch-icon.png');

  // 5. favicon.ico (dạng PNG 48x48 tương thích cao)
  await sharp(logoSvgBuffer).resize(48, 48).png().toFile(path.resolve(publicDir, 'favicon.ico'));
  console.log('✅ Đã tạo public/favicon.ico');

  // 6. favicon.svg
  fs.copyFileSync(logoSvgPath, path.resolve(publicDir, 'favicon.svg'));
  console.log('✅ Đã sao chép public/favicon.svg');

  console.log('🎉 Toàn bộ icon PWA đã được tạo thành công!');
}

generateIcons().catch((err) => {
  console.error('❌ Lỗi tạo icon:', err);
  process.exit(1);
});
