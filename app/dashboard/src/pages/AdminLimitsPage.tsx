import { Box } from "@chakra-ui/react";
import { AdminLimitsModal } from "components/AdminLimitsModal";
import { FC } from "react";

export const AdminLimitsPage: FC = () => {
  return (
    <Box minW={0}>
      <AdminLimitsModal mode="page" />
    </Box>
  );
};

export default AdminLimitsPage;
