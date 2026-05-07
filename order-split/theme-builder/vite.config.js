import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  define: {
    "import.meta.env.NODE_ENV": JSON.stringify("production"), // Or "development"
  },
  build: {
    outDir: "../extensions/order-slit/assets",  // Output folder inside your theme app extension
    emptyOutDir: false,      // Keep other assets intact
    assetsInlineLimit: 0,    // Do not inline assets (fonts/images)
    lib: {
      entry: path.resolve(__dirname, "src/promotion-entry.jsx"), // Your widget React entry
      formats: ["iife"],     // Shopify prefers iife bundles for embedding
      name: "NewPromotion",
      fileName: () => "promotion-form.js",
    },
  },
});
