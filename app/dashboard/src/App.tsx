import "react-datepicker/dist/react-datepicker.css";
import { RouterProvider } from "react-router-dom";
import { router } from "./pages/Router";
import { useEffect } from "react";
import { useColorMode } from "@chakra-ui/react";
import { updateThemeColor } from "utils/themeColor";
import { scheduleRoutePreload } from "pages/lazyRoutes";

const shouldWarmCommonRoutes = () => {
  if (typeof window === "undefined") {
    return false;
  }

  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
    mozConnection?: { saveData?: boolean; effectiveType?: string };
    webkitConnection?: { saveData?: boolean; effectiveType?: string };
  }).connection ||
    (navigator as any).mozConnection ||
    (navigator as any).webkitConnection;

  if (connection?.saveData) {
    return false;
  }

  const effectiveType = String(connection?.effectiveType || "").toLowerCase();
  if (
    effectiveType === "slow-2g" ||
    effectiveType.includes("2g") ||
    effectiveType.includes("3g")
  ) {
    return false;
  }

  return window.innerWidth >= 1024;
};

function App() {
  const { colorMode, setColorMode } = useColorMode();

  useEffect(() => {
    const savedTheme =
      (localStorage.getItem("flew-theme") as "light" | "dark" | null) ||
      "dark";

    if (colorMode !== savedTheme) {
      setColorMode(savedTheme);
    }
  }, [setColorMode]);

  useEffect(() => {
    const currentTheme = colorMode as "light" | "dark";
    document.body.setAttribute("data-theme", currentTheme);
    document.documentElement.setAttribute("translate", "no");
    document.body.setAttribute("translate", "no");
    document.documentElement.classList.add("notranslate");
    document.body.classList.add("notranslate");
    localStorage.setItem("flew-theme", currentTheme);
    updateThemeColor(currentTheme);
  }, [colorMode]);

  useEffect(() => {
    if (!shouldWarmCommonRoutes()) {
      return undefined;
    }

    return scheduleRoutePreload(["inbounds", "nodes", "hosts"]);
  }, []);

  return (
    <main className="app-shell notranslate" translate="no">
      <RouterProvider router={router} />
    </main>
  );
}

export default App;
