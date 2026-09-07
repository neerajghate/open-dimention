import { defineConfig } from 'vite';

export default defineConfig({
  // Keep unrelated configuration in a parent home folder out of this project.
  css: { postcss: { plugins: [] } },
  build: { rollupOptions: { output: { manualChunks: { three: ['three', 'three/addons/controls/OrbitControls.js'] } } } },
});
