import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/** Hosted Cloudflare Pages app — same APIs and data as production. */
const PAGES_ORIGIN = 'https://wilhite-portfolio.pages.dev';

export default defineConfig({
  appType: 'spa',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: PAGES_ORIGIN,
        changeOrigin: true,
        secure: true,
        cookieDomainRewrite: '',
        configure(proxy) {
          proxy.on('proxyRes', (proxyRes) => {
            const cookies = proxyRes.headers['set-cookie'];
            if (!cookies) return;
            proxyRes.headers['set-cookie'] = cookies.map((cookie) =>
              cookie
                .replace(/;\s*Secure/gi, '')
                .replace(/;\s*SameSite=Strict/gi, '; SameSite=Lax'),
            );
          });
        },
      },
      '/health': {
        target: PAGES_ORIGIN,
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
