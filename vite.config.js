import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    // Minificación agresiva
    minify: 'esbuild',
    // Separar chunks grandes para carga bajo demanda
    rollupOptions: {
      output: {
        // Separar React core en su propio chunk (cacheado por el navegador)
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'router': ['react-router-dom']
        }
      }
    },
    // Umbral para advertencias de chunk grande (en KB)
    chunkSizeWarningLimit: 400,
    // Eliminar console.log y debugger en producción
    esbuildOptions: {
      drop: ['console', 'debugger']
    }
  },
  server: {
    port: 5173,
    strictPort: true
  },
  // Optimizar dependencias en dev
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom']
  }
});
