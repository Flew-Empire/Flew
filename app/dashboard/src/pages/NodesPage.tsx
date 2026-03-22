import { Box, Card, CardBody, CardHeader, Text } from "@chakra-ui/react";
import { NodesPanel } from "components/NodesModal";
import { FC } from "react";
import { useTranslation } from "react-i18next";

export const NodesPage: FC = () => {
  const { t } = useTranslation();

  return (
    <Box minW={0}>
      <Card className="glass-card">
        <CardHeader pb={0}>
          <Text fontSize={{ base: "xl", md: "2xl" }} fontWeight="700">
            {t("header.nodes")}
          </Text>
        </CardHeader>
        <CardBody pt={5}>
          <NodesPanel />
        </CardBody>
      </Card>
    </Box>
  );
};

export default NodesPage;
