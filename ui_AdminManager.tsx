import {
  Badge,
  Box,
  Button,
  Flex,
  HStack,
  Spinner,
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
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetch } from "../service/http";

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

export const AdminManager = () => {
  const { t } = useTranslation();
  const toast = useToast();

  const [loadingAdmins, setLoadingAdmins] = useState(false);
  const [admins, setAdmins] = useState<AdminSummaryItem[]>([]);
  const [selected, setSelected] = useState<string>("");

  const [loadingActions, setLoadingActions] = useState(false);
  const [actionsTotal, setActionsTotal] = useState(0);
  const [actions, setActions] = useState<AdminActionLogItem[]>([]);
  const [offset, setOffset] = useState(0);
  const limit = 100;

  const selectedAdmin = useMemo(
    () => admins.find((a) => a.username === selected) || null,
    [admins, selected]
  );

  const loadAdmins = async () => {
    try {
      setLoadingAdmins(true);
      const resp = await fetch("/xpert/admin-manager/admins");
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
      setLoadingAdmins(false);
    }
  };

  const loadActions = async (adminUsername: string, nextOffset: number) => {
    try {
      setLoadingActions(true);
      const resp = await fetch(`/xpert/admin-manager/actions/${encodeURIComponent(adminUsername)}`, {
        query: { offset: nextOffset, limit },
      } as any);
      setActionsTotal(resp?.total ?? 0);
      setActions(resp?.items ?? []);
    } catch (e: any) {
      toast({
        title: t("adminManager.failed"),
        description: String(e?.message ?? e),
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setLoadingActions(false);
    }
  };

  useEffect(() => {
    loadAdmins();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selected) return;
    setOffset(0);
    loadActions(selected, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const canPrev = offset > 0;
  const canNext = offset + limit < actionsTotal;

  return (
    <Box p={5}>
      <Text fontSize="2xl" fontWeight="semibold">
        {t("adminManager.title")}
      </Text>

      <Flex mt={4} gap={4} align="stretch" direction={{ base: "column", md: "row" }}>
        <Box w={{ base: "full", md: "320px" }} borderWidth="1px" borderRadius="lg" p={3}>
          <HStack justify="space-between" mb={2}>
            <Text fontWeight="semibold">{t("adminManager.admins")}</Text>
            <Button size="xs" variant="outline" onClick={loadAdmins} isDisabled={loadingAdmins}>
              {t("adminManager.refresh")}
            </Button>
          </HStack>
          {loadingAdmins ? (
            <HStack py={6} justify="center">
              <Spinner size="sm" />
            </HStack>
          ) : (
            <VStack align="stretch" spacing={2}>
              {admins.map((a) => (
                <Button
                  key={a.username}
                  variant={selected === a.username ? "solid" : "outline"}
                  colorScheme={selected === a.username ? "blue" : "gray"}
                  size="sm"
                  justifyContent="space-between"
                  onClick={() => setSelected(a.username)}
                >
                  <HStack w="full" justify="space-between">
                    <HStack>
                      <Text>{a.username}</Text>
                      {a.is_sudo ? <Badge colorScheme="purple">sudo</Badge> : null}
                    </HStack>
                    <Badge colorScheme="blue">{a.actions_24h}</Badge>
                  </HStack>
                </Button>
              ))}
            </VStack>
          )}
        </Box>

        <Box flex="1" borderWidth="1px" borderRadius="lg" p={3} overflow="hidden">
          <HStack justify="space-between" mb={3}>
            <HStack>
              <Text fontWeight="semibold">
                {t("adminManager.details")}: {selected || "-"}
              </Text>
              {selectedAdmin ? (
                <>
                  <Badge colorScheme="gray">{t("adminManager.users", { count: selectedAdmin.total_users })}</Badge>
                  <Badge colorScheme="blue">{t("adminManager.actions24h", { count: selectedAdmin.actions_24h })}</Badge>
                </>
              ) : null}
            </HStack>
            <HStack>
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
            </HStack>
          </HStack>

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
                      <Td whiteSpace="nowrap">{a.action}</Td>
                      <Td whiteSpace="nowrap">{a.target_username || "-"}</Td>
                      <Td maxW="520px" overflow="hidden" textOverflow="ellipsis">
                        {a.meta ? JSON.stringify(a.meta) : "-"}
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
  );
};

