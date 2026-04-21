import { Box, Text } from "@chakra-ui/react";
import { useDashboard } from "contexts/DashboardContext";
import { FC, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "react-query";
import dayjs from "dayjs";
import useGetUser from "hooks/useGetUser";
import { fetch } from "service/http";
import { formatBytes, numberWithCommas } from "utils/formatByte";

type StatCardProps = {
  title: string;
  value: ReactNode;
  subLabel: string;
  subValue: ReactNode;
  className?: string;
};

const formatRate = (value?: number | null) => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return "-";
  }
  return `${formatBytes(Number(value))}/s`;
};

const StatCard: FC<StatCardProps> = ({
  title,
  value,
  subLabel,
  subValue,
  className,
}) => (
  <Box
    as="article"
    className={`statistics-card statistics-card--split${className ? ` ${className}` : ""}`}
  >
    <Box className="statistics-card__main">
      <Text className="statistics-card__title">{title}</Text>
      <Box className="statistics-card__value">{value}</Box>
    </Box>
    <Box className="statistics-card__side">
      <Text className="statistics-card__label">{subLabel}</Text>
      <Box className="statistics-card__subvalue">{subValue}</Box>
    </Box>
  </Box>
);

export const StatisticsQueryKey = "statistics-query-key";

export const Statistics: FC<{ mt?: string | number }> = ({ mt }) => {
  const { userData, getUserIsSuccess } = useGetUser();
  const { version, filters } = useDashboard();
  const isSudo = getUserIsSuccess ? !!userData?.is_sudo : false;
  const selectedAdmin = isSudo ? filters?.admin : "";
  const hasSelectedAdminScope = !!selectedAdmin && selectedAdmin !== "__all__";

  const fetchScopedStats = async (query: Record<string, any>) => {
    const stats = await fetch("/users/stats", { query });
    return {
      users_active: Number(stats?.users_active || 0),
      total_user: Number(stats?.total_user || 0),
      users_expired: Number(stats?.users_expired || 0),
      users_limited: Number(stats?.users_limited || 0),
      users_online: Number(stats?.users_online || 0),
      usage: Number(stats?.usage || 0),
    };
  };

  const { data: systemData } = useQuery({
    queryKey: StatisticsQueryKey,
    queryFn: () => fetch("/system"),
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    staleTime: 20000,
    retry: 3,
    retryDelay: 1000,
    onSuccess: ({ version: currentVersion }: any) => {
      if (version !== currentVersion) useDashboard.setState({ version: currentVersion });
    },
  });

  const { data: allScopeStats } = useQuery({
    queryKey: ["statistics-admin-scope-all", isSudo ? "__all__" : "__self__", userData?.username || ""],
    enabled: !isSudo || !hasSelectedAdminScope,
    staleTime: 60000,
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    keepPreviousData: true,
    queryFn: () => fetchScopedStats({}),
  });

  const { data: selectedScopeStats } = useQuery({
    queryKey: ["statistics-admin-scope-selected", selectedAdmin || "__none__", userData?.username || ""],
    enabled: isSudo && hasSelectedAdminScope,
    staleTime: 60000,
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    keepPreviousData: true,
    queryFn: () => fetchScopedStats({ admin: selectedAdmin }),
  });

  const { data: adminLimits } = useQuery({
    queryKey: ["statistics-admin-limits", selectedAdmin || "__all__"],
    enabled: isSudo && hasSelectedAdminScope,
    staleTime: 60000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const list: any[] = await fetch("/admins");
      return (list || []).find((a: any) => a?.username === selectedAdmin) || null;
    },
  });

  const { data: todayUsage } = useQuery({
    queryKey: ["statistics-today-traffic", isSudo ? (selectedAdmin || "__all__") : "__self__"],
    staleTime: 60000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const start = dayjs().utc().startOf("day").format("YYYY-MM-DDTHH:00:00");
      const query: Record<string, any> = { start };
      if (isSudo && hasSelectedAdminScope) query.admin = selectedAdmin;
      const data: any = await fetch("/users/usage", { query });
      return Array.isArray(data?.usages)
        ? data.usages.reduce((sum: number, v: any) => sum + Number(v?.used_traffic || 0), 0)
        : 0;
    },
  });

  const scopedStatsSource = isSudo && hasSelectedAdminScope ? selectedScopeStats : allScopeStats;
  const scopedData = scopedStatsSource
    ? {
        users_active: Number(scopedStatsSource?.users_active || 0),
        total_user: Number(scopedStatsSource?.total_user || 0),
        users_expired: Number(scopedStatsSource?.users_expired || 0),
        users_limited: Number((scopedStatsSource as any)?.users_limited || 0),
        users_online: Number(scopedStatsSource?.users_online || 0),
        data_usage: Number(scopedStatsSource?.usage || 0),
      }
    : null;

  const activeUsersValue = scopedData?.users_active ?? systemData?.users_active ?? 0;
  const totalUsersValue = scopedData?.total_user ?? systemData?.total_user ?? 0;

  const systemOnlineValue = [
    Number(systemData?.users_online),
    Number(systemData?.online_users),
    Number(systemData?.users_connected),
  ].filter((v) => Number.isFinite(v) && v >= 0).reduce((a, b) => Math.max(a, b), 0);

  const onlineUsersValue = !isSudo
    ? Number(scopedData?.users_online ?? 0)
    : hasSelectedAdminScope
    ? Number(scopedData?.users_online ?? 0)
    : systemOnlineValue ?? 0;

  const systemExpiredValue = [
    Number(systemData?.users_expired),
    Number((systemData as any)?.expired_users),
  ].filter((v) => Number.isFinite(v) && v >= 0).reduce((a, b) => Math.max(a, b), 0);

  const expiredUsersValue = !isSudo
    ? Number(scopedData?.users_expired ?? 0)
    : hasSelectedAdminScope
    ? Number(scopedData?.users_expired ?? 0)
    : systemExpiredValue ?? 0;
  const limitedUsersValue = Number((scopedData as any)?.users_limited ?? 0);

  const scopedUsageValue = Number(scopedData?.data_usage ?? 0);
  const scopedLimitValue = Number(adminLimits?.traffic_limit ?? 0);
  const selfUsageValue = Number(scopedData?.data_usage ?? (userData as any)?.users_usage ?? 0);
  const systemUsageValue =
    Number(systemData?.incoming_bandwidth || 0) +
    Number(systemData?.outgoing_bandwidth || 0);
  const dataUsageValue = !isSudo
    ? selfUsageValue
    : hasSelectedAdminScope
    ? scopedUsageValue
    : systemUsageValue;
  const todayUsageValue = Number(todayUsage || 0);
  const incomingSpeedValue = Number(systemData?.incoming_bandwidth_speed || 0);
  const outgoingSpeedValue = Number(systemData?.outgoing_bandwidth_speed || 0);

  const { t } = useTranslation();

  return (
    <Box
      mt={mt}
      className="statistics-grid"
    >
      {/* Row 1 */}
      <StatCard
        title={t("activeUsers")}
        value={
          (systemData || scopedData) ? (
            <>
              {numberWithCommas(activeUsersValue)}
              <Text as="span" className="statistics-card__muted">
                {" "}/ {numberWithCommas(totalUsersValue)}
              </Text>
            </>
          ) : "-"
        }
        subLabel={t("onlineNow")}
        subValue={
          (systemData || scopedData) ? (
            <Text as="span" sx={{ color: "var(--green)", fontWeight: 700 }}>
              {numberWithCommas(onlineUsersValue)}
            </Text>
          ) : "-"
        }
        className="statistics-card--users"
      />

      <StatCard
        title={t("dataUsage")}
        value={(systemData || scopedData) ? formatBytes(dataUsageValue) : "-"}
        subLabel={t("todayUsage")}
        subValue={(systemData || todayUsage !== undefined) ? formatBytes(todayUsageValue) : "-"}
        className="statistics-card--data"
      />

      <StatCard
        title={t("memoryUsage")}
        value={
          systemData ? (
            <>{formatBytes(systemData.mem_used, 1, true)[0]} {formatBytes(systemData.mem_used, 1, true)[1]}</>
          ) : "-"
        }
        subLabel={t("usersTable.total")}
        subValue={systemData ? formatBytes(systemData.mem_total, 1) : "-"}
        className="statistics-card--memory"
      />

      {/* Row 2 */}
      <StatCard
        title={t("statistics.limited")}
        value={(systemData || scopedData) ? numberWithCommas(limitedUsersValue) : "-"}
        subLabel={t("statistics.expired")}
        subValue={
          (systemData || scopedData) ? (
            <Text as="span" sx={{ color: "var(--red)", fontWeight: 700 }}>
              {numberWithCommas(expiredUsersValue)}
            </Text>
          ) : "-"
        }
        className="statistics-card--limited"
      />

      <StatCard
        title={t("statistics.download")}
        value={systemData ? formatRate(incomingSpeedValue) : "-"}
        subLabel={t("statistics.upload")}
        subValue={systemData ? formatRate(outgoingSpeedValue) : "-"}
        className="statistics-card--download"
      />

      <StatCard
        title={t("cpuUsage")}
        value={systemData ? `${Math.round(Number(systemData.cpu_usage || 0))}%` : "-"}
        subLabel="Cores"
        subValue={systemData?.cpu_cores ? String(systemData.cpu_cores) : "-"}
        className="statistics-card--cpu"
      />
    </Box>
  );
};

export default Statistics;
