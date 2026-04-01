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
import { useNavigate } from "react-router-dom";
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

export const AdminLimitsModal: FC<{ mode?: "modal" | "page" }> = ({
  mode = "modal",
}) => {
  const { isEditingAdminLimits, onEditingAdminLimits } = useDashboard();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { userData, getUserIsSuccess, getUserIsPending } = useGetUser();
  const toast = useToast();
  const isPageMode = mode === "page";
  const isActive = isPageMode || isEditingAdminLimits;
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [usersLimit, setUsersLimit] = useState<string>("");
  const [trafficLimit, setTrafficLimit] = useState<string>("");
  const [trafficUnit, setTrafficUnit] = useState<string>("GB");
  const [userTrafficLimit, setUserTrafficLimit] = useState<string>("");
  const [userTrafficUnit, setUserTrafficUnit] = useState<string>("GB");
  const [uniqueIpLimit, setUniqueIpLimit] = useState<string>("");
  const [deviceLimit, setDeviceLimit] = useState<string>("");
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
    if (isPageMode) {
      navigate("/", { replace: true });
    }
  };

  useEffect(() => {
    if (!isActive) return;
    if (!getUserIsPending && getUserIsSuccess && !userData.is_sudo) {
      if (isPageMode) {
        navigate("/", { replace: true });
      } else {
        onEditingAdminLimits(false);
      }
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
  }, [
    getUserIsPending,
    getUserIsSuccess,
    isActive,
    isPageMode,
    navigate,
    onEditingAdminLimits,
    t,
    toast,
    userData?.is_sudo,
  ]);

  useEffect(() => {
    if (!selectedAdmin) {
      setUsersLimit("");
      setTrafficLimit("");
      setTrafficUnit("GB");
      setUserTrafficLimit("");
      setUserTrafficUnit("GB");
      setUniqueIpLimit("");
      setDeviceLimit("");
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
    setUniqueIpLimit(
      selectedAdmin.unique_ip_limit !== null && selectedAdmin.unique_ip_limit !== undefined
        ? String(selectedAdmin.unique_ip_limit)
        : ""
    );
    setDeviceLimit(
      selectedAdmin.device_limit !== null && selectedAdmin.device_limit !== undefined
        ? String(selectedAdmin.device_limit)
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

  const parsePositiveLimit = (value: string) => {
    const parsed = parseLimit(value);
    if (parsed === null || parsed < 1) return null;
    return parsed;
  };

  const renderAdminOverviewCard = (admin: Admin) => (
    <Box
      key={admin.username}
      border="1px solid"
      borderColor="gray.200"
      _dark={{
        borderColor: "rgba(191, 219, 254, 0.24)",
        bg: "rgba(12, 16, 32, 0.5)",
      }}
      borderRadius="md"
      p={3}
      bg="rgba(255, 255, 255, 0.56)"
    >
      <HStack justify="space-between" mb={2} align="flex-start" spacing={3}>
        <Text fontWeight="semibold" fontSize="sm" noOfLines={1}>
          {admin.username}
        </Text>
        <Button
          size="xs"
          variant="outline"
          onClick={() => onResetAdminUsage(admin.username)}
          isDisabled={saving}
          flexShrink={0}
        >
          {t("adminLimits.resetUsage")}
        </Button>
      </HStack>
      <VStack spacing={1.5} align="stretch">
        <HStack justify="space-between" gap={3}>
          <Text fontSize="xs">{t("adminLimits.tableUsers")}</Text>
          <Text fontSize="xs" fontWeight="medium">
            {admin.username === selected ? usersCount : "-"}
          </Text>
        </HStack>
        <HStack justify="space-between" gap={3}>
          <Text fontSize="xs">{t("adminLimits.tableUsersLimit")}</Text>
          <Text fontSize="xs" fontWeight="medium">
            {admin.users_limit ?? "-"}
          </Text>
        </HStack>
        <HStack justify="space-between" gap={3}>
          <Text fontSize="xs">{t("adminLimits.tableUniqueIpLimit")}</Text>
          <Text fontSize="xs" fontWeight="medium">
            {admin.unique_ip_limit ?? "-"}
          </Text>
        </HStack>
        <HStack justify="space-between" gap={3}>
          <Text fontSize="xs">{t("adminLimits.tableDeviceLimit")}</Text>
          <Text fontSize="xs" fontWeight="medium">
            {admin.device_limit ?? "-"}
          </Text>
        </HStack>
        <HStack justify="space-between" gap={3}>
          <Text fontSize="xs">{t("adminLimits.tableTrafficUsed")}</Text>
          <Text fontSize="xs" fontWeight="medium">
            {formatBytes(admin.users_usage)}
          </Text>
        </HStack>
        <HStack justify="space-between" gap={3}>
          <Text fontSize="xs">{t("adminLimits.tableTrafficLimit")}</Text>
          <Text fontSize="xs" fontWeight="medium">
            {admin.traffic_limit ? formatBytes(admin.traffic_limit) : "-"}
          </Text>
        </HStack>
      </VStack>
    </Box>
  );

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
      unique_ip_limit: parsePositiveLimit(uniqueIpLimit),
      device_limit: parsePositiveLimit(deviceLimit),
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

  const FrameComponent: any = isPageMode ? Box : ModalContent;
  const HeaderComponent: any = isPageMode ? Box : ModalHeader;
  const BodyComponent: any = isPageMode ? Box : ModalBody;
  const FooterComponent: any = isPageMode ? Box : ModalFooter;

  const content = (
      <FrameComponent
        className={`workspace-page-modal${isPageMode ? " workspace-route-page" : ""}`}
        mx={isPageMode ? 0 : { base: 0, lg: 3 }}
        my={isPageMode ? 0 : { base: 0, lg: 3 }}
        w={isPageMode ? "100%" : { base: "100vw", lg: "calc(100vw - 24px)" }}
        maxW={isPageMode ? "100%" : { base: "100vw", xl: "1160px" }}
        minH={isPageMode ? undefined : { base: "100vh", lg: "calc(100vh - 24px)" }}
        alignSelf={isPageMode ? undefined : "center"}
      >
        <HeaderComponent
          pt={isPageMode ? undefined : 6}
          className={isPageMode ? "chakra-modal__header" : undefined}
        >
          <HStack gap={2}>
            <Icon color="primary">
              <LimitsIcon />
            </Icon>
            <Text fontWeight="semibold" fontSize="lg">
              {t("adminLimits.title")}
            </Text>
          </HStack>
        </HeaderComponent>
        {!isPageMode && <ModalCloseButton mt={3} />}
        <BodyComponent className={isPageMode ? "chakra-modal__body" : undefined}>
          <Text
            mt={0}
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

            <FormControl
              maxW={{ base: "100%", md: "280px", lg: "240px" }}
              w="100%"
              alignSelf="flex-start"
            >
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

            <Box
              display="grid"
              gridTemplateColumns={{
                base: "1fr",
                md: "repeat(2, minmax(0, 1fr))",
                lg: "minmax(120px, 0.9fr) minmax(180px, 1.2fr) minmax(190px, 1.25fr) minmax(120px, 0.85fr) minmax(120px, 0.85fr)",
              }}
              gap={{ base: 3, lg: 2 }}
              alignItems="start"
            >
              <FormControl minW={0}>
                <FormLabel fontSize={{ base: "sm", lg: "xs" }} mb={{ base: 2, lg: 1 }}>
                  {t("adminLimits.usersLimit")}
                </FormLabel>
                <NumberInput
                  size="sm"
                  min={0}
                  value={usersLimit}
                  onChange={(valueString) => setUsersLimit(valueString)}
                >
                  <NumberInputField
                    placeholder={t("adminLimits.usersLimitPlaceholder")}
                    px={{ lg: 2.5 }}
                  />
                  <NumberInputStepper>
                    <NumberIncrementStepper />
                    <NumberDecrementStepper />
                  </NumberInputStepper>
                </NumberInput>
              </FormControl>

              <FormControl minW={0}>
                <FormLabel fontSize={{ base: "sm", lg: "xs" }} mb={{ base: 2, lg: 1 }}>
                  {t("adminLimits.trafficLimit")}
                </FormLabel>
                <HStack spacing={{ base: 2, lg: 1.5 }} align="stretch">
                  <NumberInput
                    size="sm"
                    min={0}
                    value={trafficLimit}
                    onChange={(valueString) => setTrafficLimit(valueString)}
                    flex={1}
                  >
                    <NumberInputField
                      placeholder={t("adminLimits.trafficLimitPlaceholder")}
                      px={{ lg: 2.5 }}
                    />
                    <NumberInputStepper>
                      <NumberIncrementStepper />
                      <NumberDecrementStepper />
                    </NumberInputStepper>
                  </NumberInput>
                  <Select
                    size="sm"
                    value={trafficUnit}
                    onChange={(e) => setTrafficUnit(e.target.value)}
                    width={{ base: "88px", lg: "72px" }}
                    flexShrink={0}
                  >
                    <option value="GB">GB</option>
                    <option value="TB">TB</option>
                  </Select>
                </HStack>
              </FormControl>

              <FormControl minW={0}>
                <FormLabel fontSize={{ base: "sm", lg: "xs" }} mb={{ base: 2, lg: 1 }}>
                  {t("adminLimits.userTrafficLimit")}
                </FormLabel>
                <HStack spacing={{ base: 2, lg: 1.5 }} align="stretch">
                  <NumberInput
                    size="sm"
                    min={0}
                    value={userTrafficLimit}
                    onChange={(valueString) => setUserTrafficLimit(valueString)}
                    flex={1}
                  >
                    <NumberInputField
                      placeholder={t("adminLimits.userTrafficLimitPlaceholder")}
                      px={{ lg: 2.5 }}
                    />
                    <NumberInputStepper>
                      <NumberIncrementStepper />
                      <NumberDecrementStepper />
                    </NumberInputStepper>
                  </NumberInput>
                  <Select
                    size="sm"
                    value={userTrafficUnit}
                    onChange={(e) => setUserTrafficUnit(e.target.value)}
                    width={{ base: "88px", lg: "72px" }}
                    flexShrink={0}
                  >
                    <option value="GB">GB</option>
                    <option value="TB">TB</option>
                  </Select>
                </HStack>
              </FormControl>

              <FormControl minW={0}>
                <FormLabel fontSize={{ base: "sm", lg: "xs" }} mb={{ base: 2, lg: 1 }}>
                  {t("adminLimits.uniqueIpLimit")}
                </FormLabel>
                <NumberInput
                  size="sm"
                  min={0}
                  value={uniqueIpLimit}
                  onChange={(valueString) => setUniqueIpLimit(valueString)}
                >
                  <NumberInputField
                    placeholder={t("adminLimits.uniqueIpLimitPlaceholder")}
                    px={{ lg: 2.5 }}
                  />
                  <NumberInputStepper>
                    <NumberIncrementStepper />
                    <NumberDecrementStepper />
                  </NumberInputStepper>
                </NumberInput>
              </FormControl>

              <FormControl minW={0}>
                <FormLabel fontSize={{ base: "sm", lg: "xs" }} mb={{ base: 2, lg: 1 }}>
                  {t("adminLimits.deviceLimit")}
                </FormLabel>
                <NumberInput
                  size="sm"
                  min={0}
                  value={deviceLimit}
                  onChange={(valueString) => setDeviceLimit(valueString)}
                >
                  <NumberInputField
                    placeholder={t("adminLimits.deviceLimitPlaceholder")}
                    px={{ lg: 2.5 }}
                  />
                  <NumberInputStepper>
                    <NumberIncrementStepper />
                    <NumberDecrementStepper />
                  </NumberInputStepper>
                </NumberInput>
              </FormControl>
            </Box>

            <VStack spacing={2} align="stretch">
              <Text
                fontWeight="semibold"
                fontSize="sm"
                display={{ base: "none", md: "block" }}
              >
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
                      <Th isNumeric>{t("adminLimits.tableUniqueIpLimit")}</Th>
                      <Th isNumeric>{t("adminLimits.tableDeviceLimit")}</Th>
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
                        <Td isNumeric>{admin.unique_ip_limit ?? "-"}</Td>
                        <Td isNumeric>{admin.device_limit ?? "-"}</Td>
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
            </VStack>

            <VStack
              display={{ base: "flex", md: "none" }}
              spacing={3}
              align="stretch"
              w="full"
            >
              <Text fontWeight="semibold" fontSize="sm">
                {t("adminLimits.tableTitle")}
              </Text>
              {nonSudoAdmins.length ? (
                nonSudoAdmins.map(renderAdminOverviewCard)
              ) : (
                <Box
                  border="1px solid"
                  borderColor="gray.200"
                  _dark={{
                    borderColor: "rgba(191, 219, 254, 0.24)",
                    bg: "rgba(12, 16, 32, 0.5)",
                  }}
                  borderRadius="md"
                  p={3}
                  bg="rgba(255, 255, 255, 0.56)"
                >
                  <Text fontSize="sm">{t("adminLimits.noAdmins")}</Text>
                </Box>
              )}
            </VStack>

          </VStack>
        </BodyComponent>
        <FooterComponent
          display="flex"
          flexDirection={{ base: "column", md: "row" }}
          gap={2}
          className={isPageMode ? "chakra-modal__footer" : undefined}
        >
          <Button size="sm" onClick={onClose} mr={{ base: 0, md: 3 }} w="full" variant="outline">
            {t("cancel")}
          </Button>
          <Button
            size="sm"
            w="full"
            colorScheme="primary"
            className="dashboard-accent-btn"
            onClick={onSave}
            leftIcon={saving ? <Spinner size="xs" /> : undefined}
            isDisabled={loading || !selectedAdmin}
          >
            {t("save")}
          </Button>
        </FooterComponent>
      </FrameComponent>
  );

  if (isPageMode) {
    return content;
  }

  return (
    <Modal
      isOpen={isEditingAdminLimits}
      onClose={onClose}
      size="full"
      scrollBehavior="inside"
      motionPreset="slideInBottom"
    >
      <ModalOverlay bg="blackAlpha.300" backdropFilter="blur(10px)" />
      {content}
    </Modal>
  );
};
