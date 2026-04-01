import { Box, Button, Text, VStack } from "@chakra-ui/react";
import { Filters } from "components/Filters";
import { PrefetchLink } from "components/PrefetchLink";
import { UsersTable } from "components/UsersTable";
import { useDashboard } from "contexts/DashboardContext";
import { FC, Suspense, lazy, useEffect } from "react";
import { Statistics } from "../components/Statistics";
import { useFeatures } from "hooks/useFeatures";
import { useLocation } from "react-router-dom";
import useGetUser from "hooks/useGetUser";
import { useTranslation } from "react-i18next";
import {
  AdjustmentsHorizontalIcon,
  BanknotesIcon,
  ShieldCheckIcon,
  UserGroupIcon,
  UserPlusIcon,
  LockClosedIcon,
  ChartBarIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { chakra } from "@chakra-ui/react";

const iconProps = { baseStyle: { w: "18px", h: "18px" } };
const AdminLimitsIcon = chakra(ShieldCheckIcon, iconProps);
const AdminAccountsIcon = chakra(UserPlusIcon, iconProps);
const AdminManagerIcon = chakra(UserGroupIcon, iconProps);
const AdminBillingIcon = chakra(BanknotesIcon, iconProps);
const CryptoLinkIcon = chakra(LockClosedIcon, iconProps);
const CryptoSettingsIcon = chakra(AdjustmentsHorizontalIcon, iconProps);
const NodesUsageIcon = chakra(ChartBarIcon, iconProps);
const ResetUsageIcon = chakra(ArrowPathIcon, iconProps);

const CoreSettingsModal = lazy(() =>
  import("components/CoreSettingsModal").then((module) => ({
    default: module.CoreSettingsModal,
  }))
);
const HostsDialog = lazy(() =>
  import("components/HostsDialog").then((module) => ({
    default: module.HostsDialog,
  }))
);
const NodesDialog = lazy(() =>
  import("components/NodesModal").then((module) => ({
    default: module.NodesDialog,
  }))
);
const NodesUsage = lazy(() =>
  import("components/NodesUsage").then((module) => ({
    default: module.NodesUsage,
  }))
);
const ResetAllUsageModal = lazy(() =>
  import("components/ResetAllUsageModal").then((module) => ({
    default: module.ResetAllUsageModal,
  }))
);
type SidebarActionKey = "nodesUsage" | "resetAllUsage";

export const Dashboard: FC = () => {
  const { hasFeature } = useFeatures();
  const location = useLocation();
  const showSidebar = location.pathname === "/";
  const { userData, getUserIsSuccess, getUserIsPending } = useGetUser();
  const { t } = useTranslation();

  const isSudo = () => {
    if (!getUserIsPending && getUserIsSuccess) {
      return userData.is_sudo;
    }
    return false;
  };

  const {
    onResetAllUsage,
    onShowingNodesUsage,
    hasFetchedUsers,
    isEditingHosts,
    isEditingNodes,
    isShowingNodesUsage,
    isResetingAllUsage,
    isEditingCore,
  } = useDashboard();

  const handleSidebarAction = (key: SidebarActionKey) => {
    if (key === "nodesUsage") onShowingNodesUsage(true);
    else if (key === "resetAllUsage") onResetAllUsage(true);
  };

  useEffect(() => {
    if (hasFetchedUsers) {
      return;
    }

    try {
      useDashboard.getState().refetchUsers();
    } catch (error) {
      console.error("Dashboard initialization failed:", error);
    }
  }, [hasFetchedUsers]);

  return (
    <>
      <Statistics mt="4" />

      {/* Main layout: panel + sidebar — like the demo HTML .layout */}
      <Box
        display="grid"
        gridTemplateColumns={{
          base: "1fr",
          lg: showSidebar ? "minmax(0, 1fr) 320px" : "1fr",
        }}
        gap="24px"
        alignItems="start"
      >
        {/* LEFT: Glass panel with filters + table */}
        <Box
          className="glass-card"
          sx={{
            borderRadius: "22px",
            overflow: "hidden",
          }}
        >
          <Filters />
          <UsersTable />
        </Box>

        {/* RIGHT: Sidebar — in the grid flow, not position:fixed */}
        {showSidebar && (
          <Box
            className="glass-sidebar"
            display={{ base: "none", lg: "block" }}
            p={5}
            alignSelf="start"
            sx={{
              "&::-webkit-scrollbar": { width: "4px" },
              "&::-webkit-scrollbar-track": { bg: "transparent" },
              "&::-webkit-scrollbar-thumb": {
                bg: "var(--divider)",
                borderRadius: "2px",
              },
            }}
          >
            <Box className="server-status">
              <Box className="pulse-dot" />
              <Box>
                <Text fontWeight="600" fontSize="sm">
                  Server Online
                </Text>
                <Text fontSize="xs" opacity={0.7}>
                  All systems operational
                </Text>
              </Box>
            </Box>

            <Box className="sidebar-divider" />

            <VStack gap={2} align="stretch" pb={4}>
              <>
                  {isSudo() && hasFeature("admin_accounts") && (
                    <PrefetchLink
                      to="/admin-accounts/"
                      preload="adminAccounts"
                      style={{ display: "block", width: "100%" }}
                    >
                      <Button
                        size="sm"
                        h="52px"
                        w="full"
                        px={4}
                        textAlign="left"
                        justifyContent="flex-start"
                        leftIcon={<AdminAccountsIcon />}
                        className="sidebar-btn"
                      >
                        {t("sidebar.adminAccounts")}
                      </Button>
                    </PrefetchLink>
                  )}

                  {isSudo() && hasFeature("subscription_settings") && (
                    <PrefetchLink
                      to="/subscription-settings/"
                      preload="cryptoLinkSettings"
                      style={{ display: "block", width: "100%" }}
                    >
                      <Button
                        size="sm"
                        h="52px"
                        w="full"
                        px={4}
                        textAlign="left"
                        justifyContent="flex-start"
                        leftIcon={<CryptoSettingsIcon />}
                        className="sidebar-btn"
                      >
                        {t("sidebar.subscriptionSettings")}
                      </Button>
                    </PrefetchLink>
                  )}

                  {isSudo() && hasFeature("admin_limits") && (
                    <PrefetchLink
                      to="/admin-limits/"
                      preload="adminLimits"
                      style={{ display: "block", width: "100%" }}
                    >
                      <Button
                        size="sm"
                        h="52px"
                        w="full"
                        px={4}
                        textAlign="left"
                        justifyContent="flex-start"
                        leftIcon={<AdminLimitsIcon />}
                        className="sidebar-btn"
                      >
                        {t("sidebar.adminLimits")}
                      </Button>
                    </PrefetchLink>
                  )}

                  {isSudo() && hasFeature("admin_manager") && (
                    <PrefetchLink
                      to="/admin-manager/"
                      preload="adminManager"
                      style={{ display: "block", width: "100%" }}
                    >
                      <Button
                        size="sm"
                        h="52px"
                        px={4}
                        w="full"
                        textAlign="left"
                        justifyContent="flex-start"
                        leftIcon={<AdminManagerIcon />}
                        className="sidebar-btn"
                      >
                        {t("sidebar.adminManager")}
                      </Button>
                    </PrefetchLink>
                  )}

                  {hasFeature("admin_billing") && (
                    <PrefetchLink
                      to="/admin-billing/"
                      preload="adminBilling"
                      style={{ display: "block", width: "100%" }}
                    >
                      <Button
                        size="sm"
                        h="52px"
                        px={4}
                        w="full"
                        textAlign="left"
                        justifyContent="flex-start"
                        leftIcon={<AdminBillingIcon />}
                        className="sidebar-btn"
                      >
                        {t("sidebar.adminBilling")}
                      </Button>
                    </PrefetchLink>
                  )}
              </>

              {hasFeature("happ_crypto") && (
                <PrefetchLink
                  to="/happ-crypto/"
                  preload="cryptoLink"
                  style={{ display: "block", width: "100%" }}
                >
                  <Button
                    size="sm"
                    h="52px"
                    w="full"
                    px={4}
                    textAlign="left"
                    justifyContent="flex-start"
                    leftIcon={<CryptoLinkIcon />}
                    className="sidebar-btn"
                  >
                    {t("sidebar.happyCrypto")}
                  </Button>
                </PrefetchLink>
              )}

              {isSudo() && (
                <>
                  <Button
                    size="sm"
                    h="52px"
                    w="full"
                    px={4}
                    textAlign="left"
                    justifyContent="flex-start"
                    leftIcon={<NodesUsageIcon />}
                    className="sidebar-btn"
                    onClick={() => handleSidebarAction("nodesUsage")}
                  >
                    {t("sidebar.nodesUsage")}
                  </Button>

                  <Button
                    size="sm"
                    h="52px"
                    w="full"
                    px={4}
                    textAlign="left"
                    justifyContent="flex-start"
                    leftIcon={<ResetUsageIcon />}
                    className="sidebar-btn sidebar-btn-danger"
                    onClick={() => handleSidebarAction("resetAllUsage")}
                  >
                    {t("sidebar.resetAllUsages")}
                  </Button>
                </>
              )}
            </VStack>
          </Box>
        )}
      </Box>

      <Suspense fallback={null}>
        {isEditingHosts && <HostsDialog />}
        {isEditingNodes && <NodesDialog />}
        {isShowingNodesUsage && <NodesUsage />}
        {isResetingAllUsage && <ResetAllUsageModal />}
        {isEditingCore && <CoreSettingsModal />}
      </Suspense>
    </>
  );
};

export default Dashboard;
