import "react-datepicker/dist/react-datepicker.css";
import "react-loading-skeleton/dist/skeleton.css";
import { RouterProvider } from "react-router-dom";
import { router } from "./pages/Router";
import { useEffect } from "react";
import { useColorMode } from "@chakra-ui/react";
import { updateThemeColor } from "utils/themeColor";

function App() {
  const { colorMode } = useColorMode();

  useEffect(() => {
    document.body.setAttribute("data-theme", colorMode);
    updateThemeColor(colorMode);
  }, [colorMode]);

  return (
    <main className="p-8">
      <RouterProvider router={router} />
    </main>
  );
}

export default App;
