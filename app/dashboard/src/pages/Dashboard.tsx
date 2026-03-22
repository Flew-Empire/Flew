import { Box } from "@chakra-ui/react";
import { AdminLimitsModal } from "components/AdminLimitsModal";
import { CoreSettingsModal } from "components/CoreSettingsModal";
import { CryptoLinkModal } from "components/CryptoLinkModal";
import { DeleteUserModal } from "components/DeleteUserModal";
import { Filters } from "components/Filters";
import { HostsDialog } from "components/HostsDialog";
import { NodesDialog } from "components/NodesModal";
import { NodesUsage } from "components/NodesUsage";
import { QRCodeDialog } from "components/QRCodeDialog";
import { ResetAllUsageModal } from "components/ResetAllUsageModal";
import { ResetUserUsageModal } from "components/ResetUserUsageModal";
import { RevokeSubscriptionModal } from "components/RevokeSubscriptionModal";
import { UserDialog } from "components/UserDialog";
import { UsersTable } from "components/UsersTable";
import { useDashboard } from "contexts/DashboardContext";
import { FC, useEffect } from "react";
import { Statistics } from "../components/Statistics";
import { useFeatures } from "hooks/useFeatures";
import { useLocation } from "react-router-dom";

export const Dashboard: FC = () => {
  const { hasFeature } = useFeatures();
  const location = useLocation();
  const showSidebarOffset = location.pathname === "/";

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        useDashboard.getState().refetchUsers();
      } catch (error) {
        console.error("Dashboard initialization failed:", error);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      <Statistics mt="4" />
      <Box pr={showSidebarOffset ? { lg: "340px" } : undefined}>
        <Filters />
        <UsersTable />
      </Box>

      <UserDialog />
      <DeleteUserModal />
      <QRCodeDialog />
      <HostsDialog />
      <ResetUserUsageModal />
      <RevokeSubscriptionModal />
      <NodesDialog />
      <NodesUsage />
      <ResetAllUsageModal />
      {hasFeature("admin_limits") && <AdminLimitsModal />}
      <CoreSettingsModal />
      {hasFeature("happ_crypto") && <CryptoLinkModal />}
    </>
  );
};

export default Dashboard;
