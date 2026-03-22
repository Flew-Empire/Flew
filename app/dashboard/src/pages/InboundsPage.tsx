import {
  Badge,
  Box,
  Button,
  Card,
  CardBody,
  CardHeader,
  HStack,
  SimpleGrid,
  Stack,
  Text,
} from "@chakra-ui/react";
import { fetchInbounds, useDashboard } from "contexts/DashboardContext";
import { FC, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

export const InboundsPage: FC = () => {
  const { inbounds } = useDashboard();
  const { t } = useTranslation();

  useEffect(() => {
    if (inbounds.size === 0) {
      fetchInbounds().catch((error) => {
        console.error("Failed to fetch inbounds:", error);
      });
    }
  }, [inbounds.size]);

  const items = Array.from(inbounds.entries()).flatMap(([protocol, list]) =>
    list.map((inbound) => ({ ...inbound, protocol }))
  );

  return (
    <Box minW={0}>
      <Card className="glass-card">
        <CardHeader pb={0}>
          <Stack
            direction={{ base: "column", md: "row" }}
            justify="space-between"
            align={{ base: "stretch", md: "center" }}
            spacing={3}
          >
            <Box>
              <Text fontSize={{ base: "xl", md: "2xl" }} fontWeight="700">
                {t("header.inbounds")}
              </Text>
              <Text color="gray.500" _dark={{ color: "gray.400" }} fontSize="sm">
                Quick overview of active tags, protocols and transport settings.
              </Text>
            </Box>
            <HStack spacing={2} justify={{ base: "stretch", md: "flex-end" }}>
              <Button size="sm" variant="outline" onClick={() => fetchInbounds()}>
                Refresh
              </Button>
              <Link to="/hosts/">
                <Button size="sm" colorScheme="primary">
                  {t("header.hosts")}
                </Button>
              </Link>
            </HStack>
          </Stack>
        </CardHeader>

        <CardBody pt={5}>
          <HStack spacing={2} mb={4} wrap="wrap">
            <Badge colorScheme="blue" px={3} py={1} rounded="full">
              {items.length} inbound{items.length === 1 ? "" : "s"}
            </Badge>
            <Badge colorScheme="purple" px={3} py={1} rounded="full">
              {inbounds.size} protocol group{inbounds.size === 1 ? "" : "s"}
            </Badge>
          </HStack>

          <SimpleGrid columns={{ base: 1, sm: 2, xl: 3 }} spacing={4}>
            {items.map((inbound) => (
              <Box
                key={`${inbound.protocol}-${inbound.tag}`}
                className="glass-card"
                p={4}
                minW={0}
              >
                <HStack justifyContent="space-between" alignItems="flex-start" mb={3}>
                  <Box minW={0}>
                    <Text fontSize="lg" fontWeight="700" noOfLines={1}>
                      {inbound.tag}
                    </Text>
                    <Text fontSize="xs" color="gray.500" _dark={{ color: "gray.400" }}>
                      {String(inbound.protocol).toUpperCase()}
                    </Text>
                  </Box>
                  <Badge colorScheme="cyan" rounded="full" px={3} py={1}>
                    {inbound.port || "-"}
                  </Badge>
                </HStack>

                <SimpleGrid columns={2} spacing={2}>
                  <Box className="workspace-mini-card">
                    <Text className="workspace-mini-label">Network</Text>
                    <Text className="workspace-mini-value">{inbound.network || "-"}</Text>
                  </Box>
                  <Box className="workspace-mini-card">
                    <Text className="workspace-mini-label">TLS</Text>
                    <Text className="workspace-mini-value">{inbound.tls || "-"}</Text>
                  </Box>
                </SimpleGrid>
              </Box>
            ))}
          </SimpleGrid>

          {items.length === 0 && (
            <Text mt={4} color="gray.500" _dark={{ color: "gray.400" }}>
              No inbound found. Please check your Xray config file.
            </Text>
          )}
        </CardBody>
      </Card>
    </Box>
  );
};

export default InboundsPage;
