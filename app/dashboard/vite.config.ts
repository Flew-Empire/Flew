import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import svgr from "vite-plugin-svgr";
import { visualizer } from "rollup-plugin-visualizer";
import tsconfigPaths from "vite-tsconfig-paths";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    tsconfigPaths(),
    react({
      include: "**/*.tsx",
    }),
    svgr(),
    visualizer(),
  ],
  build: {
    assetsDir: "statics",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return;
          }

          if (
            id.includes("react-router-dom") ||
            id.includes("react-dom") ||
            id.includes("/react/") ||
            id.includes("react-query") ||
            id.includes("zustand")
          ) {
            return "vendor-react";
          }

          if (
            id.includes("@chakra-ui") ||
            id.includes("@emotion") ||
            id.includes("framer-motion")
          ) {
            return "vendor-ui";
          }

          if (
            id.includes("dayjs") ||
            id.includes("react-datepicker")
          ) {
            return "vendor-date";
          }

          if (
            id.includes("apexcharts") ||
            id.includes("react-apexcharts")
          ) {
            return "vendor-charts";
          }

          if (
            id.includes("jsoneditor") ||
            id.includes("react-json-editor-ajrm") ||
            id.includes("qrcode.react")
          ) {
            return "vendor-editor";
          }

          if (
            id.includes("i18next") ||
            id.includes("react-i18next")
          ) {
            return "vendor-i18n";
          }

          return "vendor";
        },
      },
    },
  },
  define: {
    'import.meta.env.VITE_BASE_API': JSON.stringify('/api/'),
    'import.meta.env.VITE_DOMAIN': JSON.stringify('')
  }
});
