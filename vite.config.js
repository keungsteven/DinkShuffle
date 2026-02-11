import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react({
      jsxRuntime: 'automatic',
    }),
  ],
  resolve: {
    alias: {
      'react-native': 'react-native-web',
    },
    extensions: ['.web.jsx', '.web.js', '.jsx', '.js', '.tsx', '.ts'],
  },
  define: {
    __DEV__: JSON.stringify(process.env.NODE_ENV !== 'production'),
    'process.env': {},
  },
  esbuild: {
    jsx: 'automatic',
    loader: 'jsx',
    include: /src\/.*\.[jt]sx?$/,
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.js': 'jsx',
        '.jsx': 'jsx',
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
