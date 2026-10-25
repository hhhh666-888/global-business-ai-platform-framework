import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    rolldownOptions: { input: { app: 'index.html', excel: 'src/preview-frame/excel.html' } },
  },
});
