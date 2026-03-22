import {
  Badge,
  Box,
  Button,
  chakra,
  FormControl,
  FormLabel,
  HStack,
  Stack,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  NumberDecrementStepper,
  NumberIncrementStepper,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  Select,
  Spinner,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Text,
  useToast,
  VStack,
} from "@chakra-ui/react";
import { AdjustmentsHorizontalIcon } from "@heroicons/react/24/outline";
import { FC, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import useGetUser from "hooks/useGetUser";
import { fetch } from "service/http";
import { Admin } from "types/Admin";
import { useDashboard } from "contexts/DashboardContext";
import { Input } from "./Input";
import { Icon } from "./Icon";

const LimitsIcon = chakra(AdjustmentsHorizontalIcon, {
  baseStyle: {
    w: 5,
    h: 5,
  },
});

type AdminResponse = Admin[];

type UsersResponse = {
  users: unknown[];
  total: number;
};

export const AdminLimitsModal: FC = () => {
  const { isEditingAdminLimits, onEditingAdminLimits } = useDashboard();
  const { t } = useTranslation();
  const { userData, getUserIsSuccess, getUserIsPending } = useGetUser();
  const toast = useToast();
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [usersLimit, setUsersLimit] = useState<string>("");
  const [trafficLimit, setTrafficLimit] = useState<string>("");
  const [trafficUnit, setTrafficUnit] = useState<string>("GB");
  const [userTrafficLimit, setUserTrafficLimit] = useState<string>("");
  const [userTrafficUnit, setUserTrafficUnit] = useState<string>("GB");
  const [usersCount, setUsersCount] = useState<number>(0);

  const nonSudoAdmins = useMemo(
    () => admins.filter((admin) => !admin.is_sudo),
    [admins]
  );

  const selectedAdmin = useMemo(
    () => nonSudoAdmins.find((admin) => admin.username === selected) || null,
    [nonSudoAdmins, selected]
  );

  const formatBytes = (value?: number | null) => {
    if (value === null || value === undefined) return "-";
    const abs = Math.abs(value);
    if (abs >= 1024 ** 4) return (value / 1024 ** 4).toFixed(2) + " TB";
    if (abs >= 1024 ** 3) return (value / 1024 ** 3).toFixed(2) + " GB";
    if (abs >= 1024 ** 2) return (value / 1024 ** 2).toFixed(2) + " MB";
    if (abs >= 1024) return (value / 1024).toFixed(2) + " KB";
    return value + " B";
  };

  const unitToBytes = (value: number, unit: string) => {
    if (unit === "TB") return Math.floor(value * 1024 ** 4);
    return Math.floor(value * 1024 ** 3);
  };

  const bytesToUnit = (bytes: number | null | undefined) => {
    if (bytes === null || bytes === undefined)
      return { value: "", unit: "GB" };
    if (bytes >= 1024 ** 4)
      return { value: String(Math.floor(bytes / 1024 ** 4)), unit: "TB" };
    return { value: String(Math.floor(bytes / 1024 ** 3)), unit: "GB" };
  };

  const onClose = () => {
    onEditingAdminLimits(false);
  };

  useEffect(() => {
    if (!isEditingAdminLimits) return;
    if (!getUserIsPending && getUserIsSuccess && !userData.is_sudo) {
      onEditingAdminLimits(false);
      return;
    }
    setLoading(true);
    fetch<AdminResponse>("/admins")
      .then((data) => {
        setAdmins(data || []);
        const first = (data || []).find((a) => !a.is_sudo);
        if (first) setSelected(first.username);
      })
      .catch(() => {
        toast({
          title: t("adminLimits.loadError"),
          status: "error",
          isClosable: true,
          position: "top",
          duration: 3000,
        });
      })
      .finally(() => setLoading(false));
  }, [isEditingAdminLimits]);

  useEffect(() => {
    if (!selectedAdmin) {
      setUsersLimit("");
      setTrafficLimit("");
      setTrafficUnit("GB");
      setUserTrafficLimit("");
      setUserTrafficUnit("GB");
      setUsersCount(0);
      return;
    }
    const converted = bytesToUnit(selectedAdmin.traffic_limit ?? null);
    setTrafficLimit(converted.value);
    setTrafficUnit(converted.unit);
    setUsersLimit(
      selectedAdmin.users_limit !== null && selectedAdmin.users_limit !== undefined
        ? String(selectedAdmin.users_limit)
        : ""
    );
    fetch<{ limit_bytes: number | null }>(`/flew/admin-user-traffic-limit/${encodeURIComponent(selectedAdmin.username)}`)
      .then((res) => {
        const convertedUser = bytesToUnit(res?.limit_bytes ?? null);
        setUserTrafficLimit(convertedUser.value);
        setUserTrafficUnit(convertedUser.unit);
      })
      .catch(() => {
        setUserTrafficLimit("");
        setUserTrafficUnit("GB");
      });
    fetch<UsersResponse>(`/users`, {
      query: { admin: [selectedAdmin.username], limit: 1 },
    })
      .then((res) => setUsersCount(res?.total || 0))
      .catch(() => setUsersCount(0));
  }, [selectedAdmin]);

  const parseLimit = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const num = Number(trimmed);
    if (Number.isNaN(num) || num < 0) return null;
    return Math.floor(num);
  };

  const onResetAdminUsage = (username: string) => {
    if (!username) return;
    setSaving(true);
    fetch(`/admin/usage/reset/${username}`, { method: "POST" })
      .then((updated: Admin) => {
        setAdmins((prev) =>
          prev.map((a) => (a.username === updated.username ? updated : a))
        );
        toast({
          title: t("adminLimits.resetSuccess"),
          status: "success",
          isClosable: true,
          position: "top",
          duration: 3000,
        });
      })
      .catch(() => {
        toast({
          title: t("adminLimits.resetError"),
          status: "error",
          isClosable: true,
          position: "top",
          duration: 3000,
        });
      })
      .finally(() => setSaving(false));
  };

  const isOverLimit = (admin: Admin) => {
    if (!admin.traffic_limit || admin.users_usage === undefined || admin.users_usage === null) return false;
    return admin.users_usage >= admin.traffic_limit;
  };

  const onSave = () => {
    if (!selectedAdmin) return;
    const trafficValue = parseLimit(trafficLimit);
    const userTrafficValue = parseLimit(userTrafficLimit);
    const payload = {
      is_sudo: selectedAdmin.is_sudo,
      traffic_limit:
        trafficValue === null ? null : unitToBytes(trafficValue, trafficUnit),
      users_limit: parseLimit(usersLimit),
    };
    const userTrafficPayload = {
      admin_username: selectedAdmin.username,
      limit_bytes:
        userTrafficValue === null ? null : unitToBytes(userTrafficValue, userTrafficUnit),
    };

    setSaving(true);
    Promise.all([
      fetch(`/admin/${selectedAdmin.username}`, {
        method: "PUT",
        body: payload,
      }),
      fetch(`/flew/admin-user-traffic-limit`, {
        method: "POST",
        body: userTrafficPayload,
      }),
    ])
      .then(([updated, userTrafficResp]: [Admin, any]) => {
        setAdmins((prev) =>
          prev.map((a) => (a.username === updated.username ? updated : a))
        );
        if (typeof userTrafficResp?.updated_users === "number") {
          toast({
            title: t("adminLimits.userTrafficApplied", { count: userTrafficResp.updated_users }),
            status: "info",
            isClosable: true,
            position: "top",
            duration: 2500,
          });
        }
        toast({
          title: t("adminLimits.saveSuccess"),
          status: "success",
          isClosable: true,
          position: "top",
          duration: 3000,
        });
      })
      .catch(() => {
        toast({
          title: t("adminLimits.saveError"),
          status: "error",
          isClosable: true,
          position: "top",
          duration: 3000,
        });
      })
      .finally(() => setSaving(false));
  };

  return (
    <Modal isCentered isOpen={isEditingAdminLimits} onClose={onClose} size="xl" scrollBehavior="inside">
      <ModalOverlay bg="blackAlpha.300" backdropFilter="blur(10px)" />
      <ModalContent mx="3" w={{ base: "calc(100vw - 24px)", md: "auto" }} maxW={{ base: "calc(100vw - 24px)", md: "3xl" }}>
        <ModalHeader pt={6}>
          <Icon color="primary">
            <LimitsIcon />
          </Icon>
        </ModalHeader>
        <ModalCloseButton mt={3} />
        <ModalBody>
          <Text fontWeight="semibold" fontSize="lg">
            {t("adminLimits.title")}
          </Text>
          <Text
            mt={1}
            fontSize="sm"
            _dark={{ color: "gray.400" }}
            color="gray.600"
          >
            {t("adminLimits.subtitle")}
          </Text>

          <VStack spacing={4} mt={4} align="stretch">
            {selectedAdmin && (
              <HStack spacing={3} wrap="wrap">
                <Badge colorScheme="blue">
                  {t("adminLimits.usersCount")}: {usersCount}
                </Badge>
                <Badge colorScheme="purple">
                  {t("adminLimits.usedTraffic")}: {formatBytes(selectedAdmin.users_usage)}
                </Badge>
              </HStack>
            )}

            <FormControl>
              <FormLabel fontSize="sm">{t("adminLimits.selectAdmin")}</FormLabel>
              <Select
                size="sm"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                isDisabled={loading}
              >
                {nonSudoAdmins.map((admin) => (
                  <option key={admin.username} value={admin.username}>
                    {admin.username}
                  </option>
                ))}
              </Select>
            </FormControl>

            <Stack spacing={3} align="flex-start" direction={{ base: "column", md: "row" }}>
              <FormControl>
                <FormLabel fontSize="sm">{t("adminLimits.usersLimit")}</FormLabel>
                <NumberInput
                  size="sm"
                  min={0}
                  value={usersLimit}
                  onChange={(valueString) => setUsersLimit(valueString)}
                >
                  <NumberInputField placeholder={t("adminLimits.usersLimitPlaceholder")} />
                  <NumberInputStepper>
                    <NumberIncrementStepper />
                    <NumberDecrementStepper />
                  </NumberInputStepper>
                </NumberInput>
              </FormControl>
              <FormControl>
                <FormLabel fontSize="sm">{t("adminLimits.trafficLimit")}</FormLabel>
                <HStack>
                  <NumberInput
                    size="sm"
                    min={0}
                    value={trafficLimit}
                    onChange={(valueString) => setTrafficLimit(valueString)}
                  >
                    <NumberInputField placeholder={t("adminLimits.trafficLimitPlaceholder")} />
                    <NumberInputStepper>
                      <NumberIncrementStepper />
                      <NumberDecrementStepper />
                    </NumberInputStepper>
                  </NumberInput>
                  <Select
                    size="sm"
                    value={trafficUnit}
                    onChange={(e) => setTrafficUnit(e.target.value)}
                    width="90px"
                  >
                    <option value="GB">GB</option>
                    <option value="TB">TB</option>
                  </Select>
                </HStack>
              </FormControl>
            </Stack>

            <FormControl>
              <FormLabel fontSize="sm">{t("adminLimits.userTrafficLimit")}</FormLabel>
              <HStack>
                <NumberInput
                  size="sm"
                  min={0}
                  value={userTrafficLimit}
                  onChange={(valueString) => setUserTrafficLimit(valueString)}
                >
                  <NumberInputField placeholder={t("adminLimits.userTrafficLimitPlaceholder")} />
                  <NumberInputStepper>
                    <NumberIncrementStepper />
                    <NumberDecrementStepper />
                  </NumberInputStepper>
                </NumberInput>
                <Select
                  size="sm"
                  value={userTrafficUnit}
                  onChange={(e) => setUserTrafficUnit(e.target.value)}
                  width="90px"
                >
                  <option value="GB">GB</option>
                  <option value="TB">TB</option>
                </Select>
              </HStack>
            </FormControl>

            <VStack spacing={2} align="stretch">
              <Text fontWeight="semibold" fontSize="sm">
                {t("adminLimits.tableTitle")}
              </Text>
              <Box
                display={{ base: "none", md: "block" }}
                overflowX="auto"
                border="1px solid"
                borderColor="gray.200"
                _dark={{ borderColor: "rgba(191, 219, 254, 0.24)", bg: "rgba(12, 16, 32, 0.5)" }}
                borderRadius="md"
                p={2}
              >
                <Table size="sm" variant="simple">
                  <Thead bg="gray.50" _dark={{ bg: "rgba(24, 30, 58, 0.62)" }}>
                    <Tr>
                      <Th>{t("adminLimits.tableAdmin")}</Th>
                      <Th isNumeric>{t("adminLimits.tableUsers")}</Th>
                      <Th isNumeric>{t("adminLimits.tableUsersLimit")}</Th>
                      <Th isNumeric>{t("adminLimits.tableTrafficUsed")}</Th>
                      <Th isNumeric>{t("adminLimits.tableTrafficLimit")}</Th>
                      <Th textAlign="right">{t("adminLimits.tableActions")}</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {nonSudoAdmins.map((admin) => (
                      <Tr key={admin.username} bg={isOverLimit(admin) ? "red.50" : undefined} _dark={isOverLimit(admin) ? { bg: "red.900" } : undefined}>
                        <Td whiteSpace="nowrap">{admin.username}</Td>
                        <Td isNumeric>{admin.username === selected ? usersCount : "-"}</Td>
                        <Td isNumeric>{admin.users_limit ?? "-"}</Td>
                        <Td isNumeric whiteSpace="nowrap">{formatBytes(admin.users_usage)}</Td>
                        <Td isNumeric whiteSpace="nowrap">{admin.traffic_limit ? formatBytes(admin.traffic_limit) : "-"}</Td>
                        <Td textAlign="right">
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => onResetAdminUsage(admin.username)}
                            isDisabled={saving}
                          >
                            {t("adminLimits.resetUsage")}
                          </Button>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </Box>

              <VStack display={{ base: "flex", md: "none" }} spacing={2} align="stretch">
                {nonSudoAdmins.map((admin) => (
                  <Box
                    key={admin.username}
                    border="1px solid"
                    borderColor="gray.200"
                    _dark={{ borderColor: "rgba(191, 219, 254, 0.24)", bg: "rgba(12, 16, 32, 0.5)" }}
                    borderRadius="md"
                    p={3}
                  >
                    <HStack justify="space-between" mb={2}>
                      <Text fontWeight="semibold" fontSize="sm">{admin.username}</Text>
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => onResetAdminUsage(admin.username)}
                        isDisabled={saving}
                      >
                        {t("adminLimits.resetUsage")}
                      </Button>
                    </HStack>
                    <HStack justify="space-between"><Text fontSize="xs">{t("adminLimits.tableUsers")}</Text><Text fontSize="xs">{admin.username === selected ? usersCount : "-"}</Text></HStack>
                    <HStack justify="space-between"><Text fontSize="xs">{t("adminLimits.tableUsersLimit")}</Text><Text fontSize="xs">{admin.users_limit ?? "-"}</Text></HStack>
                    <HStack justify="space-between"><Text fontSize="xs">{t("adminLimits.tableTrafficUsed")}</Text><Text fontSize="xs">{formatBytes(admin.users_usage)}</Text></HStack>
                    <HStack justify="space-between"><Text fontSize="xs">{t("adminLimits.tableTrafficLimit")}</Text><Text fontSize="xs">{admin.traffic_limit ? formatBytes(admin.traffic_limit) : "-"}</Text></HStack>
                  </Box>
                ))}
              </VStack>
            </VStack>

          </VStack>
        </ModalBody>
        <ModalFooter display="flex" flexDirection={{ base: "column", md: "row" }} gap={2}>
          <Button size="sm" onClick={onClose} mr={{ base: 0, md: 3 }} w="full" variant="outline">
            {t("cancel")}
          </Button>
          <Button
            size="sm"
            w="full"
            colorScheme="primary"
            onClick={onSave}
            leftIcon={saving ? <Spinner size="xs" /> : undefined}
            isDisabled={loading || !selectedAdmin}
          >
            {t("save")}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
