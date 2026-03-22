import { Box, Card, CardBody, CardHeader, Text } from "@chakra-ui/react";
import { HostsPanel } from "components/HostsDialog";
import { FC } from "react";
import { useTranslation } from "react-i18next";

export const HostsPage: FC = () => {
  const { t } = useTranslation();

  return (
    <Box minW={0}>
      <Card className="glass-card">
        <CardHeader pb={0}>
          <Text fontSize={{ base: "xl", md: "2xl" }} fontWeight="700">
            {t("header.hosts")}
          </Text>
        </CardHeader>
        <CardBody pt={5}>
          <HostsPanel isActive />
        </CardBody>
      </Card>
    </Box>
  );
};

export default HostsPage;
