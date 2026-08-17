import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '0.5.0'),
  },
  plugins: [
    react(),
    VitePWA({
      // QUY TẮC BẤT BIẾN: Dùng 'prompt' thay vì 'autoUpdate'.
      // Lý do: Nếu dùng 'autoUpdate', Service Worker mới có thể tự động reload trang
      // ngay giữa lúc người chơi đang trong ván cờ, gây ức chế và mất dữ liệu ván đấu.
      registerType: 'prompt',

      // Tắt Service Worker khi chạy 'npm run dev' để tránh cơ chế cache làm nhiễu
      // quá trình lập trình và sửa đổi mã nguồn cục bộ.
      devOptions: {
        enabled: false,
      },

      // Khai báo Web App Manifest chuẩn chỉnh cho PWA Installability
      manifest: {
        name: 'PlayFusion - Web Game Hub',
        short_name: 'PlayFusion',
        description: 'Nền tảng Web Game Hub chơi cờ và board games đối kháng trực tuyến & offline',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        id: '/',
        lang: 'vi',
        categories: ['games', 'entertainment'],
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },

      // ==============================================================================
      // CHIẾN LƯỢC CACHE WORKBOX CHUYÊN SÂU (PHASE P0.5b)
      // ==============================================================================
      workbox: {
        // 1. PRECACHE: Toàn bộ static assets của build bundle
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],

        // 2. SPA OFFLINE FALLBACK: Mọi route SPA (/profile, /leaderboard...) khi offline
        // đều được fallback về /index.html để AppShell và React Router tự render
        navigateFallback: '/index.html',

        // 3. DENYLIST: Chống navigateFallback "nuốt" nhầm các static file thực tế hoặc assets
        navigateFallbackDenylist: [/^\/assets\//, /\.[a-zA-Z0-9]+$/],

        // 4. QUẢN LÝ VÒNG ĐỜI SERVICE WORKER:
        // Tự động dọn dẹp các cache phiên bản cũ đã lỗi thời
        cleanupOutdatedCaches: true,

        // Không tự động chiếm quyền điều khiển (skipWaiting: false, clientsClaim: false)
        // để phối hợp cùng registerType: 'prompt', chờ người dùng xác nhận reload
        skipWaiting: false,
        clientsClaim: false,

        // 5. RUNTIME CACHE THEO TỪNG LOẠI TÀI NGUYÊN:
        runtimeCaching: [
          // A. Cache Hình ảnh: CacheFirst, tối đa 60 ảnh, lưu trữ 30 ngày
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-v1',
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 30 * 24 * 60 * 60, // 30 ngày
              },
            },
          },

          // B. Cache Web Fonts: CacheFirst, tối đa 20 fonts, lưu trữ 1 năm
          {
            urlPattern: /\.(?:woff|woff2|ttf|eot|otf)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fonts-v1',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 365 * 24 * 60 * 60, // 1 năm
              },
            },
          },

          // ============================================================================
          // C. NGUYÊN TẮC BẤT BIẾN: LOẠI TRỪ TUYỆT ĐỐI BACKEND SUPABASE
          // Dữ liệu ván đấu thời gian thực, bảng xếp hạng Elo, lịch sử đấu và số dư ví
          // TUYỆT ĐỐI KHÔNG BAO GIỜ được cache bởi Service Worker.
          // Khi tích hợp Supabase ở Phase P2.x / P3.x, mọi request đến *.supabase.co hoặc
          // *.supabase.in sẽ tự động đi thẳng ra mạng (NetworkOnly theo mặc định của Workbox
          // vì không có bất kỳ routing rule nào khớp với tên miền Supabase).
          // ============================================================================
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@engines': path.resolve(__dirname, './packages/engines'),
    },
  },
  build: {
    target: 'es2020',
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}', 'packages/engines/**/*.{ts,tsx}'],
      exclude: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', '**/*.d.ts'],
    },
  },
});
