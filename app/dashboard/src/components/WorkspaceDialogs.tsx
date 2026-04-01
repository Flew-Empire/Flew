import { Suspense, lazy } from "react";
import { useDashboard } from "contexts/DashboardContext";

const DeleteUserModal = lazy(() =>
  import("components/DeleteUserModal").then((module) => ({
    default: module.DeleteUserModal,
  }))
);
const QRCodeDialog = lazy(() =>
  import("components/QRCodeDialog").then((module) => ({
    default: module.QRCodeDialog,
  }))
);
const ResetUserUsageModal = lazy(() =>
  import("components/ResetUserUsageModal").then((module) => ({
    default: module.ResetUserUsageModal,
  }))
);
const RevokeSubscriptionModal = lazy(() =>
  import("components/RevokeSubscriptionModal").then((module) => ({
    default: module.RevokeSubscriptionModal,
  }))
);

export const WorkspaceDialogs = () => {
  const { deletingUser, QRcodeLinks, resetUsageUser, revokeSubscriptionUser } =
    useDashboard();

  return (
    <Suspense fallback={null}>
      {!!deletingUser && <DeleteUserModal />}
      {!!QRcodeLinks && <QRCodeDialog />}
      {!!resetUsageUser && <ResetUserUsageModal />}
      {!!revokeSubscriptionUser && <RevokeSubscriptionModal />}
    </Suspense>
  );
};

export default WorkspaceDialogs;
