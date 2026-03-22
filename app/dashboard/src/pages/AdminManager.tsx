import {
  Badge,
  Box,
  Button,
  chakra,
  Flex,
  HStack,
  IconButton,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Spinner,
  Stack,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  VStack,
  useToast,
} from "@chakra-ui/react";
import { ArrowLeftIcon, BellIcon } from "@heroicons/react/24/outline";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate } from "react-router-dom";
import { Header } from "components/Header";
import { Footer } from "components/Footer";
import { fetch } from "../service/http";
import { useFeatures } from "hooks/useFeatures";

const BackIcon = chakra(ArrowLeftIcon);
const Bell = chakra(BellIcon);

type AdminSummaryItem = {
  username: string;
  is_sudo: boolean;
  total_users: number;
  actions_24h: number;
};

type AdminActionLogItem = {
  id: number;
  created_at: string;
  admin_username: string;
  action: string;
  target_type?: string | null;
  target_username?: string | null;
  meta?: any;
};

type ImportantNotification = {
  id: number;
  created_at: string;
  target_username: string;
  admin_username: string;
  message: string;
};

type AdminLifetimeUserItem = {
  username: string;
  count: number;
  last_at: string;
};

type AdminLifetimeStats = {
  created_count: number;
  extended_count: number;
  deleted_count: number;
  created_users: AdminLifetimeUserItem[];
  extended_users: AdminLifetimeUserItem[];
  deleted_users: AdminLifetimeUserItem[];
};

export const AdminManager = () => {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const { hasFeature, isLoading } = useFeatures();

  if (!isLoading && !hasFeature("admin_manager")) {
    return <Navigate to="/" replace />;
  }

  const actionLabel = (action: string): string => {
    const keyMap: Record<string, string> = {
      "user.create": "adminManager.action.userCreate",
      "user.modify": "adminManager.action.userModify",
      "user.disabled": "adminManager.action.userDisabled",
      "user.delete": "adminManager.action.userDelete",
      "user.reset_usage": "adminManager.action.userResetUsage",
      "user.revoke_sub": "adminManager.action.userRevokeSub",
      "crypto.encrypt": "adminManager.action.cryptoEncrypt",
      "hwid.reset": "adminManager.action.hwidReset",
      "user.ip_limit_set": "adminManager.action.userIpLimitSet",
      "user.traffic_limit_set": "adminManager.action.userTrafficLimitSet",
      "admin.traffic_limit_set": "adminManager.action.adminTrafficLimitSet",
      "admin.users_limit_set": "adminManager.action.adminUsersLimitSet",
      "admin.user_traffic_limit_set": "adminManager.action.adminUserTrafficLimitSet",
    };
    const key = keyMap[action];
    if (key) return t(key);
    return action;
  };

  const formatStatus = (raw: unknown): string => {
    if (typeof raw !== "string") return "-";
    const s = raw.replace(/^UserStatus\./, "");
    const key = `adminManager.status.${s}`;
    const translated = t(key);
    return translated === key ? s : translated;
  };

  const safeJson = (v: unknown): string => {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  };

  const formatBytes = (v: unknown): string => {
    if (v === null || v === undefined) return "-";
    const n = Number(v);
    if (Number.isNaN(n) || n < 0) return "-";
    if (n >= 1024 ** 4) return `${(n / 1024 ** 4).toFixed(2)} TB`;
    if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
    if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(2)} MB`;
    if (n >= 1024) return `${(n / 1024).toFixed(2)} KB`;
    return `${n} B`;
  };

  const metaSummary = (action: string, meta: any): string => {
    if (!meta) return "-";

    if (action === "user.ip_limit_set") {
      const limit = meta?.limit;
      if (typeof limit === "number") return t("adminManager.meta.ipLimitSet", { limit });
      return t("adminManager.meta.ipLimitSetUnknown");
    }

    if (action === "admin.traffic_limit_set") {
      const newGb = meta?.new_gb;
      const newBytes = meta?.new;
      if (typeof newGb === "number") return t("adminManager.meta.adminTrafficLimitSetGb", { limit: newGb });
      if (typeof newBytes === "number") return t("adminManager.meta.adminTrafficLimitSetBytes", { limit: newBytes });
      return t("adminManager.meta.adminTrafficLimitSetUnknown");
    }

    if (action === "admin.users_limit_set") {
      const limit = meta?.new;
      if (typeof limit === "number") return t("adminManager.meta.adminUsersLimitSet", { limit });
      return t("adminManager.meta.adminUsersLimitSetUnknown");
    }

    if (action === "admin.user_traffic_limit_set") {
      const limitGb = meta?.limit_gb;
      const limitBytes = meta?.limit_bytes;
      const updatedUsers = meta?.updated_users;
      const setBy = meta?.set_by;
      if (typeof limitGb === "number") {
        return t("adminManager.meta.adminUserTrafficLimitSetGb", {
          limit: limitGb,
          count: typeof updatedUsers === "number" ? updatedUsers : 0,
          setBy: typeof setBy === "string" ? setBy : "-",
        });
      }
      if (typeof limitBytes === "number") {
        return t("adminManager.meta.adminUserTrafficLimitSetBytes", {
          limit: limitBytes,
          count: typeof updatedUsers === "number" ? updatedUsers : 0,
          setBy: typeof setBy === "string" ? setBy : "-",
        });
      }
      return t("adminManager.meta.adminUserTrafficLimitSetUnknown");
    }

    if (action === "user.create") {
      const status = formatStatus(meta?.status);
      const expireTs = meta?.expire;
      const expire =
        typeof expireTs === "number" ? new Date(expireTs * 1000).toLocaleString() : "-";
      const dataLimit = formatBytes(meta?.data_limit);
      return t("adminManager.meta.userCreate", { status, expire, dataLimit });
    }

    if (action === "user.modify") {
      const statusFrom = meta?.changes?.status?.from;
      const statusTo = meta?.changes?.status?.to;
      if (statusFrom !== undefined || statusTo !== undefined) {
        return t("adminManager.meta.userStatusChanged", {
          from: formatStatus(statusFrom),
          to: formatStatus(statusTo),
        });
      }
      return t("adminManager.meta.userModify");
    }
    if (action === "user.disabled") {
      return t("adminManager.meta.userDisabled", {
        from: formatStatus(meta?.from),
        to: formatStatus(meta?.to),
      });
    }
    if (action === "user.delete") return t("adminManager.meta.userDelete");
    if (action === "user.reset_usage") {
      const before = formatBytes(meta?.used_traffic_before);
      const hasBefore = meta?.used_traffic_before !== undefined && meta?.used_traffic_before !== null;
      if (hasBefore) return t("adminManager.meta.userResetUsageValue", { from: before, to: formatBytes(0) });
      return t("adminManager.meta.userResetUsage");
    }
    if (action === "user.revoke_sub") return t("adminManager.meta.userRevokeSub");
    if (action === "crypto.encrypt") return t("adminManager.meta.cryptoEncrypt");
    if (action === "hwid.reset") return t("adminManager.meta.hwidReset");

    if (action === "user.traffic_limit_set") {
      const oldLimit = formatBytes(meta?.old);
      const newLimit = formatBytes(meta?.new);
      return t("adminManager.meta.userTrafficLimitSet", { oldLimit, newLimit });
    }

    return safeJson(meta);
  };

  const [loadingAdmins, setLoadingAdmins] = useState(false);
  const [admins, setAdmins] = useState<AdminSummaryItem[]>([]);
  const [selected, setSelected] = useState<string>("");

  const [loadingActions, setLoadingActions] = useState(false);
  const [actionsTotal, setActionsTotal] = useState(0);
  const [actions, setActions] = useState<AdminActionLogItem[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<ImportantNotification[]>([]);
  const [lastSeenNotificationId, setLastSeenNotificationId] = useState(0);
  const [lifetime, setLifetime] = useState<AdminLifetimeStats | null>(null);
  const [loadingLifetime, setLoadingLifetime] = useState(false);
  const [lifetimeType, setLifetimeType] = useState<"created" | "extended" | "deleted">("created");
  const [lifetimeOpen, setLifetimeOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const limit = 100;

  const selectedAdmin = useMemo(
    () => admins.find((a) => a.username === selected) || null,
    [admins, selected]
  );

  const notificationStorageKey = (adminUsername: string) =>
    `adminManager.notifications.lastSeen.${adminUsername}`;

  const formatDateTime = (ts: number | undefined): string => {
    if (!ts || Number.isNaN(ts)) return "-";
    return new Date(ts * 1000).toLocaleString();
  };

  const isImportantAction = (a: AdminActionLogItem): boolean => {
    if (a.action === "user.ip_limit_set") return true;
    if (a.action === "user.traffic_limit_set") return true;
    if (a.action === "user.create") return true;
    if (a.action === "user.disabled") return true;
    if (a.action === "user.reset_usage") return true;
    if (a.action === "user.modify") {
      const ch = a.meta?.changes || {};
      const from = String(ch?.status?.from ?? "").toLowerCase();
      const to = String(ch?.status?.to ?? "").toLowerCase();
      const hasDisabledChange = from.includes("disabled") || to.includes("disabled");
      return !!(ch?.expire || ch?.data_limit || hasDisabledChange);
    }
    return false;
  };

  const buildNotifications = (items: AdminActionLogItem[]): ImportantNotification[] => {
    const important = (items || []).filter(isImportantAction);
    const grouped: {
      id: number;
      created_at: string;
      ts: number;
      target: string;
      admin: string;
      statusFrom?: unknown;
      statusTo?: unknown;
      ipLimit?: number;
      trafficOld?: unknown;
      trafficNew?: unknown;
      expireFrom?: unknown;
      expireTo?: unknown;
    }[] = [];

    for (const a of important) {
      const ts = Date.parse(a.created_at || "") || 0;
      const target = a.target_username || "-";
      const prev = grouped[grouped.length - 1];
      const canMerge =
        !!prev && prev.target === target && Math.abs(prev.ts - ts) <= 8000;

      const current = canMerge
        ? prev
        : (() => {
            const g = {
              id: a.id,
              created_at: a.created_at,
              ts,
              target,
              admin: a.admin_username || "-",
            } as any;
            grouped.push(g);
            return g;
          })();

      if (a.id > current.id) {
        current.id = a.id;
      }
      if (ts > current.ts) {
        current.ts = ts;
        current.created_at = a.created_at;
        current.admin = a.admin_username || current.admin || "-";
      }

      if (a.action === "user.ip_limit_set") {
        if (typeof a.meta?.limit === "number") current.ipLimit = a.meta.limit;
      }

      if (a.action === "user.traffic_limit_set") {
        current.trafficOld = a.meta?.old;
        current.trafficNew = a.meta?.new;
      }

      if (a.action === "user.modify") {
        const changes = a.meta?.changes || {};
        if (changes?.status) {
          current.statusFrom = changes.status.from;
          current.statusTo = changes.status.to;
        }
        if (changes?.expire) {
          current.expireFrom = changes.expire.from;
          current.expireTo = changes.expire.to;
        }
        if (changes?.data_limit) {
          current.trafficOld = changes.data_limit.from;
          current.trafficNew = changes.data_limit.to;
        }
      }

      if (a.action === "user.create") {
        if (a.meta?.expire !== undefined && a.meta?.expire !== null) {
          current.expireTo = a.meta.expire;
        }
        if (a.meta?.data_limit !== undefined && a.meta?.data_limit !== null) {
          current.trafficNew = a.meta.data_limit;
        }
      }

      if (a.action === "user.disabled") {
        current.statusFrom = a.meta?.from;
        current.statusTo = a.meta?.to;
      }
      if (a.action === "user.reset_usage") {
        current.trafficOld = a.meta?.used_traffic_before;
        current.trafficNew = 0;
      }
    }

    return grouped.map((g) => {
      const parts: string[] = [];
      if (g.statusFrom !== undefined || g.statusTo !== undefined) {
        parts.push(
          t("adminManager.notifications.statusChanged", {
            from: formatStatus(g.statusFrom),
            to: formatStatus(g.statusTo),
          })
        );
      }
      if (g.expireFrom !== undefined || g.expireTo !== undefined) {
        parts.push(
          t("adminManager.notifications.expireChanged", {
            from: formatDateTime(Number(g.expireFrom || 0)),
            to: formatDateTime(Number(g.expireTo || 0)),
          })
        );
      }
      if (g.trafficOld !== undefined || g.trafficNew !== undefined) {
        parts.push(
          t("adminManager.notifications.trafficChanged", {
            from: formatBytes(g.trafficOld),
            to: formatBytes(g.trafficNew),
          })
        );
      }
      if (g.ipLimit !== undefined) {
        parts.push(
          t("adminManager.notifications.ipChanged", {
            limit: g.ipLimit,
          })
        );
      }
      if (!parts.length) parts.push(t("adminManager.notifications.updated"));

      return {
        id: g.id,
        created_at: g.created_at,
        target_username: g.target,
        admin_username: g.admin || "-",
        message: parts.join("; "),
      };
    });
  };

  const loadAdmins = async (silent = false) => {
    try {
      if (!silent) setLoadingAdmins(true);
      const resp = await fetch("/flew/admin-manager/admins");
      setAdmins(resp || []);
      if (!selected && resp?.length) setSelected(resp[0].username);
    } catch (e: any) {
      toast({
        title: t("adminManager.failed"),
        description: String(e?.message ?? e),
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    } finally {
      if (!silent) setLoadingAdmins(false);
    }
  };

  const loadActions = async (adminUsername: string, nextOffset: number, silent = false) => {
    try {
      if (!silent) setLoadingActions(true);
      const [resp, notifResp] = await Promise.all([
        fetch(`/flew/admin-manager/actions/${encodeURIComponent(adminUsername)}`, {
          query: { offset: nextOffset, limit },
        } as any),
        fetch(`/flew/admin-manager/actions/${encodeURIComponent(adminUsername)}`, {
          query: { offset: 0, limit: 200 },
        } as any),
      ]);

      setActionsTotal(resp?.total ?? 0);
      setActions(resp?.items ?? []);

      const built = buildNotifications(notifResp?.items ?? []);
      setNotifications(built);
    } catch (e: any) {
      toast({
        title: t("adminManager.failed"),
        description: String(e?.message ?? e),
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    } finally {
      if (!silent) setLoadingActions(false);
    }
  };

  const loadLifetime = async (adminUsername: string, silent = false) => {
    try {
      if (!silent) setLoadingLifetime(true);
      const resp = await fetch(`/flew/admin-manager/lifetime/${encodeURIComponent(adminUsername)}`);
      setLifetime(resp || null);
    } catch (e: any) {
      if (!silent) {
        toast({
          title: t("adminManager.failed"),
          description: String(e?.message ?? e),
          status: "error",
          duration: 3000,
          isClosable: true,
        });
      }
    } finally {
      if (!silent) setLoadingLifetime(false);
    }
  };

  useEffect(() => {
    loadAdmins();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selected) return;
    setOffset(0);
    const seen = Number(localStorage.getItem(notificationStorageKey(selected)) || "0");
    setLastSeenNotificationId(Number.isNaN(seen) ? 0 : seen);
    loadActions(selected, 0);
    loadLifetime(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  useEffect(() => {
    if (!selected) return;
    const timer = window.setInterval(() => {
      loadAdmins(true);
      loadActions(selected, offset, true);
      loadLifetime(selected, true);
    }, 15000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, offset]);

  const canPrev = offset > 0;
  const canNext = offset + limit < actionsTotal;

  const unreadNotifications = useMemo(
    () => notifications.filter((n) => n.id > lastSeenNotificationId),
    [notifications, lastSeenNotificationId]
  );

  const openNotifications = () => {
    setNotificationsOpen(true);
    const newest = notifications.length ? notifications[0].id : 0;
    if (selected && newest > lastSeenNotificationId) {
      localStorage.setItem(notificationStorageKey(selected), String(newest));
      setLastSeenNotificationId(newest);
    }
  };

  const openLifetimeModal = (type: "created" | "extended" | "deleted") => {
    setLifetimeType(type);
    setLifetimeOpen(true);
  };

  const lifetimeTitleByType = (type: "created" | "extended" | "deleted") => {
    if (type === "created") return t("adminManager.lifetime.createdUsers");
    if (type === "extended") return t("adminManager.lifetime.extendedUsers");
    return t("adminManager.lifetime.deletedUsers");
  };

  const lifetimeUsersByType = (): AdminLifetimeUserItem[] => {
    if (!lifetime) return [];
    if (lifetimeType === "created") return lifetime.created_users || [];
    if (lifetimeType === "extended") return lifetime.extended_users || [];
    return lifetime.deleted_users || [];
  };

  return (
    <Box className="flew-page-shift" w="full" minW={0}>
      <Header />
      <Box p={{ base: 3, md: 5 }}>
        <Stack
          direction={{ base: "column", sm: "row" }}
          justify="space-between"
          align={{ base: "stretch", sm: "center" }}
          spacing={2}
        >
          <HStack>
            <IconButton
              aria-label={t("adminManager.back")}
              icon={<BackIcon />}
              size="sm"
              variant="ghost"
              onClick={() => navigate("/")}
            />
            <Text fontSize="2xl" fontWeight="semibold">
              {t("adminManager.title")}
            </Text>
          </HStack>
        </Stack>

        <Flex mt={4} gap={3} align="stretch" direction={{ base: "column", md: "row" }}>
        <Flex w={{ base: "full", md: "320px" }} gap={3} align="stretch" direction="column">
        <Box w="full" borderWidth="1px" borderRadius="lg" p={3}>
          <HStack justify="space-between" mb={2}>
            <Text fontWeight="semibold">{t("adminManager.admins")}</Text>
            <Button size="xs" variant="outline" onClick={() => loadAdmins()} isDisabled={loadingAdmins}>
              {t("adminManager.refresh")}
            </Button>
          </HStack>
          {loadingAdmins ? (
            <HStack py={6} justify="center">
              <Spinner size="sm" />
            </HStack>
          ) : (
            <VStack align="stretch" spacing={2} maxH={{ base: "180px", md: "240px" }} overflowY="auto">
              {admins.map((a) => (
                <Button
                  key={a.username}
                  variant={selected === a.username ? "solid" : "outline"}
                  colorScheme={selected === a.username ? "blue" : "gray"}
                  size="sm"
                  justifyContent="space-between"
                  w="full"
                  minW={0}
                  onClick={() => setSelected(a.username)}
                >
                  <HStack w="full" justify="space-between" minW={0}>
                    <HStack minW={0}>
                      <Text noOfLines={1}>{a.username}</Text>
                      {a.is_sudo ? <Badge colorScheme="purple">sudo</Badge> : null}
                    </HStack>
                    <Badge colorScheme="blue">{a.actions_24h}</Badge>
                  </HStack>
                </Button>
              ))}
            </VStack>
          )}
        </Box>
        <Box w="full" borderWidth="1px" borderRadius="lg" p={3}>
          <Text fontSize="sm" fontWeight="semibold" mb={2}>
            {t("adminManager.lifetime.title")}
          </Text>
          {loadingLifetime ? (
            <HStack py={2} justify="center">
              <Spinner size="xs" />
            </HStack>
          ) : (
            <VStack align="stretch" spacing={2}>
              <Stack direction={{ base: "column", sm: "row" }} align={{ base: "stretch", sm: "center" }} justify="space-between" spacing={2}>
                <Text fontSize="sm">{t("adminManager.lifetime.created")}</Text>
                <HStack spacing={2} justify={{ base: "flex-start", sm: "flex-end" }}>
                  <Badge colorScheme="green">{lifetime?.created_count ?? 0}</Badge>
                  <Button size="xs" variant="outline" onClick={() => openLifetimeModal("created")} isDisabled={!selected}>
                    {t("adminManager.lifetime.viewList")}
                  </Button>
                </HStack>
              </Stack>
              <Stack direction={{ base: "column", sm: "row" }} align={{ base: "stretch", sm: "center" }} justify="space-between" spacing={2}>
                <Text fontSize="sm">{t("adminManager.lifetime.extended")}</Text>
                <HStack spacing={2} justify={{ base: "flex-start", sm: "flex-end" }}>
                  <Badge colorScheme="blue">{lifetime?.extended_count ?? 0}</Badge>
                  <Button size="xs" variant="outline" onClick={() => openLifetimeModal("extended")} isDisabled={!selected}>
                    {t("adminManager.lifetime.viewList")}
                  </Button>
                </HStack>
              </Stack>
              <Stack direction={{ base: "column", sm: "row" }} align={{ base: "stretch", sm: "center" }} justify="space-between" spacing={2}>
                <Text fontSize="sm">{t("adminManager.lifetime.deleted")}</Text>
                <HStack spacing={2} justify={{ base: "flex-start", sm: "flex-end" }}>
                  <Badge colorScheme="red">{lifetime?.deleted_count ?? 0}</Badge>
                  <Button size="xs" variant="outline" onClick={() => openLifetimeModal("deleted")} isDisabled={!selected}>
                    {t("adminManager.lifetime.viewList")}
                  </Button>
                </HStack>
              </Stack>
            </VStack>
          )}
        </Box>
        </Flex>

        <Box flex="1" borderWidth="1px" borderRadius="lg" p={3} overflow="hidden">
          <Stack
            direction={{ base: "column", md: "row" }}
            align={{ base: "stretch", md: "center" }}
            justify="space-between"
            spacing={2}
            mb={3}
          >
            <Stack direction={{ base: "column", sm: "row" }} align={{ base: "flex-start", sm: "center" }} spacing={2} minW={0}>
              <Text fontWeight="semibold">
                {t("adminManager.details")}: {selected || "-"}
              </Text>
              {selectedAdmin ? (
                <Flex wrap="wrap" gap={2}>
                  <Badge colorScheme="gray">{t("adminManager.users", { count: selectedAdmin.total_users })}</Badge>
                  <Badge colorScheme="blue">{t("adminManager.actions24h", { count: selectedAdmin.actions_24h })}</Badge>
                </Flex>
              ) : null}
            </Stack>
            <Flex wrap="wrap" gap={2} justify={{ base: "flex-start", md: "flex-end" }}>
              <Box position="relative">
                <IconButton
                  aria-label={t("adminManager.notifications.title")}
                  size="xs"
                  variant="outline"
                  icon={<Bell w={4} h={4} />}
                  onClick={openNotifications}
                />
                {unreadNotifications.length > 0 ? (
                  <Badge
                    position="absolute"
                    top="-2"
                    right="-2"
                    colorScheme="yellow"
                    borderRadius="full"
                    fontSize="10px"
                  >
                    {unreadNotifications.length}
                  </Badge>
                ) : null}
              </Box>
              <Button
                size="xs"
                variant="outline"
                onClick={() => {
                  loadAdmins();
                  loadActions(selected, offset);
                  loadLifetime(selected);
                }}
                isDisabled={!selected || loadingActions || loadingAdmins}
              >
                {t("adminManager.refresh")}
              </Button>
              <Button
                size="xs"
                variant="outline"
                onClick={() => {
                  const next = Math.max(0, offset - limit);
                  setOffset(next);
                  loadActions(selected, next);
                }}
                isDisabled={!selected || loadingActions || !canPrev}
              >
                {t("adminManager.prev")}
              </Button>
              <Button
                size="xs"
                variant="outline"
                onClick={() => {
                  const next = offset + limit;
                  setOffset(next);
                  loadActions(selected, next);
                }}
                isDisabled={!selected || loadingActions || !canNext}
              >
                {t("adminManager.next")}
              </Button>
            </Flex>
          </Stack>

          {loadingActions ? (
            <HStack py={10} justify="center">
              <Spinner size="sm" />
            </HStack>
          ) : (
            <Box overflowX="auto">
              <Table size="sm">
                <Thead>
                  <Tr>
                    <Th>{t("adminManager.time")}</Th>
                    <Th>{t("adminManager.action")}</Th>
                    <Th>{t("adminManager.target")}</Th>
                    <Th>{t("adminManager.meta")}</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {actions.map((a) => (
                    <Tr key={a.id}>
                      <Td whiteSpace="nowrap">{a.created_at?.replace("T", " ").slice(0, 19)}</Td>
                      <Td whiteSpace="nowrap">{actionLabel(a.action)}</Td>
                      <Td whiteSpace="nowrap">{a.target_username || "-"}</Td>
                      <Td maxW="520px" overflow="hidden" textOverflow="ellipsis">
                        <Text title={a.meta ? safeJson(a.meta) : ""} fontSize="xs" color="gray.600">
                          {metaSummary(a.action, a.meta)}
                        </Text>
                      </Td>
                    </Tr>
                  ))}
                  {!actions.length ? (
                    <Tr>
                      <Td colSpan={4}>
                        <Text color="gray.500">{t("adminManager.empty")}</Text>
                      </Td>
                    </Tr>
                  ) : null}
                </Tbody>
              </Table>
            </Box>
          )}
        </Box>
      </Flex>
      </Box>

      <Modal isOpen={notificationsOpen} onClose={() => setNotificationsOpen(false)} size="lg" isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{t("adminManager.notifications.title")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={4}>
            <VStack align="stretch" spacing={3} maxH="60vh" overflowY="auto">
              {notifications.map((n) => {
                const isUnread = n.id > lastSeenNotificationId;
                return (
                  <Box
                    key={n.id}
                    borderWidth="1px"
                    borderRadius="md"
                    p={3}
                    bg={isUnread ? "yellow.50" : "transparent"}
                    borderColor={isUnread ? "yellow.200" : undefined}
                    _dark={{
                      bg: isUnread ? "rgba(245, 158, 11, 0.12)" : "rgba(148, 163, 184, 0.06)",
                      borderColor: isUnread
                        ? "rgba(251, 191, 36, 0.46)"
                        : "rgba(148, 163, 184, 0.24)",
                    }}
                  >
                    <Text fontSize="xs" color="gray.500" _dark={{ color: "gray.400" }}>
                      {n.created_at?.replace("T", " ").slice(0, 19)}
                    </Text>
                    <Text fontSize="sm" fontWeight="semibold">
                      {n.target_username}
                    </Text>
                    <Text fontSize="xs" color="gray.600" _dark={{ color: "gray.300" }}>
                      {t("adminManager.notifications.byAdmin", { admin: n.admin_username || "-" })}
                    </Text>
                    <Text fontSize="sm">{n.message}</Text>
                  </Box>
                );
              })}
              {!notifications.length ? (
                <Text color="gray.500">{t("adminManager.notifications.empty")}</Text>
              ) : null}
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>

      <Modal isOpen={lifetimeOpen} onClose={() => setLifetimeOpen(false)} size="lg" isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{lifetimeTitleByType(lifetimeType)}</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={4}>
            <VStack align="stretch" spacing={2} maxH="60vh" overflowY="auto">
              {lifetimeUsersByType().map((u) => (
                <Stack
                  key={u.username}
                  direction={{ base: "column", sm: "row" }}
                  align={{ base: "stretch", sm: "center" }}
                  justify="space-between"
                  spacing={2}
                  borderWidth="1px"
                  borderRadius="md"
                  p={2}
                >
                  <Text fontSize="sm" fontWeight="semibold">{u.username}</Text>
                  <HStack spacing={3} justify={{ base: "flex-start", sm: "flex-end" }}>
                    <Badge colorScheme="purple">{t("adminManager.lifetime.countBadge", { count: u.count })}</Badge>
                    <Text fontSize="xs" color="gray.500">
                      {u.last_at ? u.last_at.replace("T", " ").slice(0, 19) : "-"}
                    </Text>
                  </HStack>
                </Stack>
              ))}
              {!lifetimeUsersByType().length ? (
                <Text color="gray.500">{t("adminManager.empty")}</Text>
              ) : null}
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>

      <Footer />
    </Box>
  );
};
