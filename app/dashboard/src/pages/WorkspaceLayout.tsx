import { Box, Button, HStack, Spinner, VStack, chakra } from "@chakra-ui/react";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { Footer } from "components/Footer";
import { Header } from "components/Header";
import { fetchInbounds } from "contexts/DashboardContext";
import { AnimatePresence, motion } from "framer-motion";
import { FC, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation, useNavigate, useNavigation } from "react-router-dom";

const BackIcon = chakra(ArrowLeftIcon, {
  baseStyle: {
    w: 4,
    h: 4,
  },
});

const MotionBox = motion(Box);

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
      className="flew-page-shift"
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

        <AnimatePresence mode="wait" initial={false}>
          <MotionBox
            key={location.pathname}
            className="workspace-route-shell"
            initial={{ opacity: 0, x: 22 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -18 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <Outlet />
          </MotionBox>
        </AnimatePresence>
      </Box>

      <Footer />
    </VStack>
  );
};

export default WorkspaceLayout;
