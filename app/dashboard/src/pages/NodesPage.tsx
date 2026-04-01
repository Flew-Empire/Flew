import {
  Box,
  Card,
  CardBody,
  CardHeader,
  Grid,
  Heading,
  Spinner,
  Text,
} from "@chakra-ui/react";
import { NodesPanel } from "components/NodesModal";
import { useNodesQuery } from "contexts/NodesContext";
import { FC, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "react-query";
import { fetch } from "service/http";
import { formatBytes } from "utils/formatByte";

type NodesUsageResponse = {
  usages?: Array<{
    node_id?: number | null;
    node_name: string;
    uplink: number;
    downlink: number;
  }>;
};

const NodeStatCard: FC<{
  label: string;
  value: string | number;
  subLabel: string;
  subValue: string | number;
}> = ({ label, value, subLabel, subValue }) => (
  <Box className="statistics-card statistics-card--split xpanel-stat-card">
    <Box className="statistics-card__main">
      <Text className="statistics-card__title">{label}</Text>
      <Text className="statistics-card__value">{value}</Text>
    </Box>
    <Box className="statistics-card__side">
      <Text className="statistics-card__label">{subLabel}</Text>
      <Text className="statistics-card__subvalue">{subValue}</Text>
    </Box>
  </Box>
);

export const NodesPage: FC = () => {
  const { t } = useTranslation();
  const { data: nodes, isLoading: nodesLoading } = useNodesQuery();
  const { data: usageData, isLoading: usageLoading } = useQuery<NodesUsageResponse>({
    queryKey: ["nodes-usage-summary"],
    queryFn: () => fetch("/nodes/usage"),
    refetchInterval: 15000,
    refetchOnWindowFocus: false,
  });

  const stats = useMemo(() => {
    const items = nodes || [];
    const usages = usageData?.usages || [];
    const totalNodes = items.length;
    const connected = items.filter((item) => item.status === "connected").length;
    const disabled = items.filter((item) => item.status === "disabled").length;
    const errors = items.filter((item) => item.status === "error").length;
    const upload = usages.reduce(
      (sum, item) => sum + Number(item?.uplink || 0),
      0
    );
    const download = usages.reduce(
      (sum, item) => sum + Number(item?.downlink || 0),
      0
    );

    return {
      totalNodes,
      connected,
      disabled,
      errors,
      upload,
      download,
      totalTraffic: upload + download,
    };
  }, [nodes, usageData]);

  return (
    <Box minW={0}>
      <Card className="glass-card nodes-page-card">
        <CardHeader pb={0}>
          <Heading size="md">{t("header.nodes")}</Heading>
          <Text mt={1} fontSize="sm" color="var(--muted)">
            {t("nodes.title")}
          </Text>
        </CardHeader>
        <CardBody className="nodes-page-body" pt={5}>
          {nodesLoading || usageLoading ? (
            <Box py={8} display="flex" justifyContent="center">
              <Spinner color="primary.300" />
            </Box>
          ) : (
            <Grid className="statistics-grid xpanel-stats-grid nodes-stats-grid" mb={5}>
              <NodeStatCard
                label={t("nodes.statsTotalNodes")}
                value={stats.totalNodes}
                subLabel={t("nodes.statsConnected")}
                subValue={stats.connected}
              />
              <NodeStatCard
                label={t("nodes.statsTotalTraffic")}
                value={String(formatBytes(stats.totalTraffic))}
                subLabel={t("nodes.statsDownload")}
                subValue={String(formatBytes(stats.download))}
              />
              <NodeStatCard
                label={t("nodes.statsUpload")}
                value={String(formatBytes(stats.upload))}
                subLabel={t("nodes.statsDisabled")}
                subValue={stats.disabled}
              />
              <NodeStatCard
                label={t("nodes.statsErrors")}
                value={stats.errors}
                subLabel={t("nodes.statsPeriod")}
                subValue={stats.totalNodes ? "30d" : "-"}
              />
            </Grid>
          )}
          <NodesPanel />
        </CardBody>
      </Card>
    </Box>
  );
};

export default NodesPage;
