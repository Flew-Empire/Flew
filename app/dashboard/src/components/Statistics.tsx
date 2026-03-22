import { Box, BoxProps, Card, Text } from "@chakra-ui/react";
import { useDashboard } from "contexts/DashboardContext";
import { FC, PropsWithChildren, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "react-query";
import dayjs from "dayjs";
import useGetUser from "hooks/useGetUser";
import { fetch } from "service/http";
import { formatBytes, numberWithCommas } from "utils/formatByte";

// Backend `/api/system` uses a 24h online window; keep frontend scope calc aligned.
const ONLINE_WINDOW_SECONDS = 24 * 60 * 60;

const parseOnlineAtTs = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    if (value > 1e12) return Math.floor(value / 1000); // ms
    if (value > 1e9) return Math.floor(value); // sec
    return null;
  }
  const raw = String(value).trim();
  if (!raw) return null;
  const asNum = Number(raw);
  if (Number.isFinite(asNum)) {
    if (asNum > 1e12) return Math.floor(asNum / 1000);
    if (asNum > 1e9) return Math.floor(asNum);
  }
  let ms = new Date(raw).getTime();
  if (!Number.isFinite(ms)) ms = new Date(`${raw}Z`).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.floor(ms / 1000);
};

type StatisticCardProps = {
  title: string;
  content: ReactNode;
  subLabel?: string;
  subValue?: ReactNode;
};

const StatisticCard: FC<PropsWithChildren<StatisticCardProps>> = ({
  title,
  content,
  subLabel,
  subValue,
}) => {
  return (
    <Card
      p={{ base: "5px", md: 5 }}
      borderWidth="1px"
      borderColor="light-border"
      bg="rgba(40, 50, 65, 0.85)"
      borderStyle="solid"
      borderRadius={{ base: "15px", md: "18px" }}
      width="full"
      backdropFilter="blur(8px)"
      WebkitBackdropFilter="blur(8px)"
      boxShadow="0 8px 32px rgba(0, 0, 0, 0.25)"
      border="1px solid rgba(255, 255, 255, 0.12)"
      position="relative"
      overflow="hidden"
      minH={{ base: "52px", md: "70px" }}
      aspectRatio={{ base: "1 / 1", md: "auto" }}
      display={{ base: "flex", md: "grid" }}
      flexDirection="column"
      justifyContent="space-between"
      gridTemplateColumns={{ md: "minmax(0, 1fr) auto" }}
      gridTemplateRows={{ md: "auto auto" }}
      columnGap={{ md: 4 }}
      rowGap={{ md: 1.5 }}
      alignItems={{ md: "center" }}
      _dark={{
        bg: "rgba(40, 50, 65, 0.85)",
        borderColor: "rgba(255, 255, 255, 0.12)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
      }}
    >
      <Box display={{ base: "block", md: "contents" }}>
        <Box minW={0}>
          <Text
            gridColumn={{ md: 1 }}
            gridRow={{ md: 1 }}
            color="rgba(255, 255, 255, 0.7)"
            fontWeight="500"
            fontSize={{ base: "6px", md: "13px" }}
            textTransform="capitalize"
            mb={{ base: "2px", md: 0 }}
            lineHeight="1.3"
          >
            {title}
          </Text>
          <Text
            gridColumn={{ md: 1 }}
            gridRow={{ md: 2 }}
            fontSize={{ base: "11px", md: "25px" }}
            fontWeight="700"
            color="white"
            lineHeight="1"
            letterSpacing="-0.5px"
          >
            {content}
          </Text>
        </Box>
      </Box>
      {subLabel && subValue && (
        <Box
          display={{ base: "block", md: "contents" }}
          textAlign="right"
          flexShrink={0}
          alignSelf={{ base: "flex-end", md: "auto" }}
        >
          <Text
            gridColumn={{ md: 2 }}
            gridRow={{ md: 1 }}
            fontSize={{ base: "6px", md: "13px" }}
            color="rgba(255,255,255,0.5)"
            mb={{ base: "2px", md: 0 }}
            lineHeight="1.2"
          >
            {subLabel}
          </Text>
          <Text
            gridColumn={{ md: 2 }}
            gridRow={{ md: 2 }}
            fontSize={{ base: "9px", md: "18px" }}
            fontWeight="600"
            color="white"
            lineHeight="1.1"
          >
            {subValue}
          </Text>
        </Box>
      )}
    </Card>
  );
};
export const StatisticsQueryKey = "statistics-query-key";
export const Statistics: FC<BoxProps> = (props) => {
  const { userData, getUserIsSuccess } = useGetUser();
  const { version, filters } = useDashboard();
  const isSudo = getUserIsSuccess ? !!userData?.is_sudo : false;
  const selectedAdmin = isSudo ? filters?.admin : "";
  const hasSelectedAdminScope = !!selectedAdmin && selectedAdmin !== "__all__";
  const fetchScopedStats = async (query: Record<string, any>) => {
    const [allResp, activeResp, expiredResp, usageResp] = await Promise.all([
      fetch("/users", { query: { ...query, limit: 1 } }),
      fetch("/users", { query: { ...query, status: "active", limit: 1 } }),
      fetch("/users", { query: { ...query, status: "expired", limit: 1 } }),
      fetch("/users", { query: { ...query, limit: 5000, sort: "-created_at" } }),
    ]);

    const usage = Array.isArray(usageResp?.users)
      ? usageResp.users.reduce((sum: number, u: any) => sum + Number(u?.used_traffic || 0), 0)
      : 0;
    const usersOnline = Array.isArray(usageResp?.users)
      ? usageResp.users.filter((u: any) => {
          const status = String(u?.status || "").toLowerCase();
          if (status === "connected") return true;
          const ts = parseOnlineAtTs(u?.online_at);
          if (!ts) return false;
          const diff = Math.floor(Date.now() / 1000) - ts;
          return diff <= ONLINE_WINDOW_SECONDS;
        }).length
      : 0;

    return {
      users_active: Number(activeResp?.total || 0),
      total_user: Number(allResp?.total || 0),
      users_expired: Number(expiredResp?.total || 0),
      users_online: Number(usersOnline || 0),
      usage,
    };
  };
  const { data: systemData, error: systemError } = useQuery({
    queryKey: StatisticsQueryKey,
    queryFn: () => fetch("/system"),
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    staleTime: 20000,
    retry: 3,
    retryDelay: 1000,
    onSuccess: ({ version: currentVersion }) => {
      if (version !== currentVersion)
        useDashboard.setState({ version: currentVersion });
    },
    onError: (error) => {
      console.error("Statistics query failed:", error);
    },
  });
  const { data: allScopeStats } = useQuery({
    queryKey: [
      "statistics-admin-scope-all",
      isSudo ? "__all__" : "__self__",
      userData?.username || "",
    ],
    enabled: !isSudo || !hasSelectedAdminScope,
    staleTime: 60000,
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    keepPreviousData: false,
    queryFn: () => fetchScopedStats({}),
  });
  const { data: selectedScopeStats } = useQuery({
    queryKey: ["statistics-admin-scope-selected", selectedAdmin || "__none__", userData?.username || ""],
    enabled: isSudo && hasSelectedAdminScope,
    staleTime: 60000,
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    keepPreviousData: false,
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
      const total = Array.isArray(data?.usages)
        ? data.usages.reduce((sum: number, v: any) => sum + Number(v?.used_traffic || 0), 0)
        : 0;
      return total;
    },
  });
  const scopedStatsSource =
    isSudo && hasSelectedAdminScope ? selectedScopeStats : allScopeStats;
  const hasScoped = !!scopedStatsSource;
  const scopedData = hasScoped
    ? {
        users_active: Number(scopedStatsSource?.users_active || 0),
        total_user: Number(scopedStatsSource?.total_user || 0),
        users_expired: Number(scopedStatsSource?.users_expired || 0),
        users_online: Number(scopedStatsSource?.users_online || 0),
        data_usage: Number(scopedStatsSource?.usage || 0),
      }
    : null;

  const activeUsersValue = scopedData?.users_active ?? systemData?.users_active ?? 0;
  const totalUsersValue = scopedData?.total_user ?? systemData?.total_user ?? 0;
  const scopedOnlineValue = Number(scopedData?.users_online);
  const hasScopedOnlineValue = Number.isFinite(scopedOnlineValue) && scopedOnlineValue >= 0;
  const systemOnlineCandidates = [
    Number(systemData?.users_online),
    Number(systemData?.online_users),
    Number(systemData?.users_connected),
  ].filter((v) => Number.isFinite(v) && v >= 0);
  const systemOnlineValue = systemOnlineCandidates.length ? Math.max(...systemOnlineCandidates) : null;
  const scopedExpiredValue = Number(scopedData?.users_expired);
  const hasScopedExpiredValue = Number.isFinite(scopedExpiredValue) && scopedExpiredValue >= 0;
  const systemExpiredCandidates = [
    Number(systemData?.users_expired),
    Number((systemData as any)?.expired_users),
  ].filter((v) => Number.isFinite(v) && v >= 0);
  const systemExpiredValue = systemExpiredCandidates.length ? Math.max(...systemExpiredCandidates) : null;
  const onlineUsersValue = !isSudo
    ? hasScopedOnlineValue
      ? scopedOnlineValue
      : 0
    : hasSelectedAdminScope
    ? hasScopedOnlineValue
      ? scopedOnlineValue
      : 0
    : systemOnlineValue ?? (hasScopedOnlineValue ? scopedOnlineValue : 0);
  const expiredUsersValue = !isSudo
    ? hasScopedExpiredValue
      ? scopedExpiredValue
      : 0
    : hasSelectedAdminScope
      ? hasScopedExpiredValue
        ? scopedExpiredValue
        : 0
      : systemExpiredValue ?? (hasScopedExpiredValue ? scopedExpiredValue : 0);
  const scopedUsageValue = Number(scopedData?.data_usage ?? 0);
  const scopedLimitValue = Number(adminLimits?.traffic_limit ?? 0);
  const selfUsageValue = Number(scopedData?.data_usage ?? (userData as any)?.users_usage ?? 0);
  const selfLimitValue = Number((userData as any)?.traffic_limit ?? 0);
  const systemUsageValue =
    Number(systemData?.incoming_bandwidth || 0) +
    Number(systemData?.outgoing_bandwidth || 0);
  const dataUsageValue =
    !isSudo
      ? selfUsageValue
      : hasSelectedAdminScope
      ? scopedUsageValue
      : systemUsageValue;
  const trafficLimitValue = !isSudo ? selfLimitValue : hasSelectedAdminScope ? scopedLimitValue : 0;
  const todayUsageValue = Number(todayUsage || 0);
  const { t } = useTranslation();
  return (
    <Box
      display="grid"
      gridTemplateColumns={{
        base: "repeat(3, minmax(0, 1fr))",
      }}
      gap={{ base: "6px", md: 3 }}
      w="full"
      sx={{ direction: "ltr" }}
      {...props}
    >
      <Box>
        <StatisticCard
          title={t("activeUsers")}
          content={
            (systemData || scopedData) ? (
              <>
                {numberWithCommas(activeUsersValue)}{" "}
                <Text
                  as="span"
                  fontSize={{ base: "8px", md: "lg" }}
                  fontWeight="400"
                  color="rgba(255,255,255,0.6)"
                >
                  / {numberWithCommas(totalUsersValue)}
                </Text>
              </>
            ) : "-"
          }
          subLabel={t("onlineNow")}
          subValue={
            (systemData || scopedData) ? (
              <Text as="span" color="#4ade80">{numberWithCommas(onlineUsersValue)}</Text>
            ) : "-"
          }
        />
      </Box>
      <Box>
        <StatisticCard
          title={t("dataUsage")}
          content={(systemData || scopedData) ? formatBytes(dataUsageValue) : "-"}
          subLabel={t("todayUsage")}
          subValue={(systemData || todayUsage) ? formatBytes(todayUsageValue) : "-"}
        />
      </Box>
      <Box>
        <StatisticCard
          title={t("memoryUsage")}
          content={
            systemData ? (
              <>{formatBytes(systemData.mem_used, 1, true)[0]} {formatBytes(systemData.mem_used, 1, true)[1]}</>
            ) : "-"
          }
          subLabel="Total"
          subValue={systemData ? formatBytes(systemData.mem_total, 1) : "-"}
        />
      </Box>
      <Box>
        <StatisticCard
          title={t("cpuUsage")}
          content={systemData ? `${Math.round(Number(systemData.cpu_usage || 0))}%` : "-"}
          subLabel="Cores"
          subValue={systemData?.cpu_cores ? String(systemData.cpu_cores) : "4"}
        />
      </Box>
      <Box>
        <StatisticCard
          title={t("users")}
          content={(systemData || scopedData) ? numberWithCommas(totalUsersValue) : "-"}
          subLabel={t("status.expired")}
          subValue={
            (systemData || scopedData) ? (
              <Text as="span" color="#f87171">{numberWithCommas(expiredUsersValue)}</Text>
            ) : "-"
          }
        />
      </Box>
      <Box>
        <StatisticCard
          title={t("todayUsage")}
          content={(systemData || todayUsage) ? formatBytes(todayUsageValue) : "-"}
          subLabel="Peak"
          subValue="- Mbps"
        />
      </Box>
    </Box>
  );
};
