import { ChakraProvider, localStorageManager } from "@chakra-ui/react";
import dayjs from "dayjs";
import Duration from "dayjs/plugin/duration";
import LocalizedFormat from "dayjs/plugin/localizedFormat";
import RelativeTime from "dayjs/plugin/relativeTime";
import Timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import "locales/i18n";
import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "react-query";
import { AppErrorBoundary } from "components/AppErrorBoundary";
import { queryClient } from "utils/react-query";
import { updateThemeColor } from "utils/themeColor";
import { theme } from "../chakra.config";
import App from "./App";
import "index.scss";




dayjs.extend(Timezone);
dayjs.extend(LocalizedFormat);
dayjs.extend(utc);
dayjs.extend(RelativeTime);
dayjs.extend(Duration);

const initialTheme =
  (window.localStorage.getItem("flew-theme") as "light" | "dark" | null) ||
  (localStorageManager.get() as "light" | "dark" | null) ||
  "dark";

window.localStorage.setItem("chakra-ui-color-mode", initialTheme);
document.body?.setAttribute("data-theme", initialTheme);
document.documentElement?.setAttribute("translate", "no");
document.body?.setAttribute("translate", "no");
document.documentElement?.classList.add("notranslate");
document.body?.classList.add("notranslate");
updateThemeColor(initialTheme);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ChakraProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <AppErrorBoundary>
          <App />
        </AppErrorBoundary>
      </QueryClientProvider>
    </ChakraProvider>
  </React.StrictMode>
);
