import { Box, Button, HStack, Spinner, VStack, chakra } from "@chakra-ui/react";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { Footer } from "components/Footer";
import { Header } from "components/Header";
import { WorkspaceDialogs } from "components/WorkspaceDialogs";
import { fetchInbounds } from "contexts/DashboardContext";
import { FC, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation, useNavigate, useNavigation } from "react-router-dom";

const BackIcon = chakra(ArrowLeftIcon, {
  baseStyle: {
    w: 4,
    h: 4,
  },
});

export const WorkspaceLayout: FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const { t } = useTranslation();

  useEffect(() => {
    fetchInbounds().catch((error) => {
      console.error("Failed to fetch inbounds for workspace layout:", error);
    });
  }, []);

  const isHome = location.pathname === "/";

  return (
    <VStack
      justifyContent="space-between"
      minH="100vh"
      p={{ base: "4", lg: "6" }}
      rowGap={4}
      w="full"
      minW={0}
      maxW="100%"
      overflowX="hidden"
    >
      <Box w="full" minW={0}>
        <Header />

        {!isHome && (
          <HStack mb={4}>
            <Button
              size="sm"
              variant="ghost"
              leftIcon={<BackIcon />}
              className="workspace-back-btn"
              onClick={() => navigate("/")}
            >
              {t("adminManager.back")}
            </Button>
          </HStack>
        )}

        {navigation.state !== "idle" && (
          <HStack justifyContent="center" py={2}>
            <Spinner size="sm" color="primary.300" />
          </HStack>
        )}

        <Box className="workspace-route-shell">
          <Outlet />
        </Box>
        <WorkspaceDialogs />
      </Box>

      <Footer />
    </VStack>
  );
};

export default WorkspaceLayout;
