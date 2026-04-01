import { Box } from "@chakra-ui/react";
import { CryptoLinkModal } from "components/CryptoLinkModal";
import { FC } from "react";

export const CryptoLinkPage: FC = () => {
  return (
    <Box minW={0}>
      <CryptoLinkModal mode="page" view="generator" />
    </Box>
  );
};

export default CryptoLinkPage;
