import "react-datepicker/dist/react-datepicker.css";
import { RouterProvider } from "react-router-dom";
import { router } from "./pages/Router";
import { useEffect } from "react";
import { useColorMode } from "@chakra-ui/react";
import { updateThemeColor } from "utils/themeColor";
import { scheduleRoutePreload } from "pages/lazyRoutes";

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
    return scheduleRoutePreload([
      "subscriptionEditor",
      "inbounds",
      "nodes",
      "hosts",
    ]);
  }, []);

  return (
    <main className="app-shell notranslate" translate="no">
      <RouterProvider router={router} />
    </main>
  );
}

export default App;
