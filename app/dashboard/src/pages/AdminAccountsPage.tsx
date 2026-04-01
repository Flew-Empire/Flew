import {
  Badge,
  Box,
  Button,
  Card,
  CardBody,
  CardHeader,
  Divider,
  FormControl,
  FormLabel,
  HStack,
  Select,
  SimpleGrid,
  Spinner,
  Stack,
  Switch,
  Text,
  VStack,
  useToast,
} from "@chakra-ui/react";
import {
  ShieldCheckIcon,
  UserCircleIcon,
  UserPlusIcon,
} from "@heroicons/react/24/outline";
import { Input } from "components/Input";
import useGetUser from "hooks/useGetUser";
import { useFeatures } from "hooks/useFeatures";
import { FC, useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { fetch } from "service/http";
import { Admin } from "types/Admin";
import { AdminChatPermissionsResponse } from "types/AdminChat";

type TrafficUnit = "GB" | "TB";

type AdminFormState = {
  username: string;
  password: string;
  confirmPassword: string;
  is_sudo: boolean;
  is_disabled: boolean;
  telegram_id: string;
  discord_webhook: string;
  subscription_url_prefix: string;
  users_limit: string;
  traffic_limit: string;
  traffic_unit: TrafficUnit;
  unique_ip_limit: string;
  device_limit: string;
};

const formatBytes = (value?: number | null) => {
  if (value === null || value === undefined) return "-";
  const abs = Math.abs(value);
  if (abs >= 1024 ** 4) return `${(value / 1024 ** 4).toFixed(2)} TB`;
  if (abs >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`;
  if (abs >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(2)} MB`;
  if (abs >= 1024) return `${(value / 1024).toFixed(2)} KB`;
  return `${value} B`;
};

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
};

const parseNullableInteger = (value: string, min = 0) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  const normalized = Math.floor(parsed);
  if (normalized < min) return null;
  return normalized;
};

const toTrafficInput = (bytes?: number | null) => {
  if (bytes === null || bytes === undefined) {
    return { value: "", unit: "GB" as TrafficUnit };
  }
  if (bytes >= 1024 ** 4) {
    return {
      value: String(Math.floor(bytes / 1024 ** 4)),
      unit: "TB" as TrafficUnit,
    };
  }
  return {
    value: String(Math.floor(bytes / 1024 ** 3)),
    unit: "GB" as TrafficUnit,
  };
};

const toTrafficBytes = (value: string, unit: TrafficUnit) => {
  const parsed = parseNullableInteger(value, 0);
  if (parsed === null) return null;
  return unit === "TB" ? parsed * 1024 ** 4 : parsed * 1024 ** 3;
};

const createEmptyForm = (): AdminFormState => ({
  username: "",
  password: "",
  confirmPassword: "",
  is_sudo: false,
  is_disabled: false,
  telegram_id: "",
  discord_webhook: "",
  subscription_url_prefix: "",
  users_limit: "",
  traffic_limit: "",
  traffic_unit: "GB",
  unique_ip_limit: "",
  device_limit: "",
});

const mapAdminToForm = (admin: Admin | null): AdminFormState => {
  if (!admin) return createEmptyForm();
  const traffic = toTrafficInput(admin.traffic_limit);
  return {
    username: admin.username || "",
    password: "",
    confirmPassword: "",
    is_sudo: !!admin.is_sudo,
    is_disabled: !!admin.is_disabled,
    telegram_id:
      admin.telegram_id !== null && admin.telegram_id !== undefined
        ? String(admin.telegram_id)
        : "",
    discord_webhook: admin.discord_webhook || "",
    subscription_url_prefix: admin.subscription_url_prefix || "",
    users_limit:
      admin.users_limit !== null && admin.users_limit !== undefined
        ? String(admin.users_limit)
        : "",
    traffic_limit: traffic.value,
    traffic_unit: traffic.unit,
    unique_ip_limit:
      admin.unique_ip_limit !== null && admin.unique_ip_limit !== undefined
        ? String(admin.unique_ip_limit)
        : "",
    device_limit:
      admin.device_limit !== null && admin.device_limit !== undefined
        ? String(admin.device_limit)
        : "",
  };
};

const AdminSwitchRow: FC<{
  label: string;
  hint: string;
  isChecked: boolean;
  onChange: (checked: boolean) => void;
}> = ({ label, hint, isChecked, onChange }) => (
  <HStack
    justify="space-between"
    align="center"
    px={3}
    py={3}
    border="1px solid var(--border)"
    borderRadius="14px"
    bg="var(--surface-soft)"
  >
    <Box minW={0}>
      <Text fontWeight="semibold" fontSize="sm">
        {label}
      </Text>
      <Text fontSize="xs" color="var(--muted)">
        {hint}
      </Text>
    </Box>
    <Switch
      colorScheme="primary"
      isChecked={isChecked}
      onChange={(event) => onChange(event.target.checked)}
    />
  </HStack>
);

export const AdminAccountsPage: FC = () => {
  const { t } = useTranslation();
  const toast = useToast();
  const { hasFeature } = useFeatures();
  const { userData, getUserIsPending, getUserIsSuccess } = useGetUser();
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [selectedUsername, setSelectedUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [createForm, setCreateForm] = useState<AdminFormState>(createEmptyForm);
  const [editForm, setEditForm] = useState<AdminFormState>(createEmptyForm);
  const [chatPermissionsLoading, setChatPermissionsLoading] = useState(false);
  const [chatPermissionsSaving, setChatPermissionsSaving] = useState(false);
  const [chatAssignableAdmins, setChatAssignableAdmins] = useState<
    { username: string; is_sudo: boolean }[]
  >([]);
  const [chatAllowedUsernames, setChatAllowedUsernames] = useState<string[]>([]);
  const [chatLockedReason, setChatLockedReason] = useState<string>("");

  const isSudo = !!userData?.is_sudo;
  const currentAdminUsername = userData?.username || "";
  const chatPermissionsEnabled = hasFeature("admin_chat");

  const loadAdmins = useCallback(
    async (preferredUsername?: string) => {
      setLoading(true);
      try {
        const data = await fetch<Admin[]>("/admins");
        setAdmins(data || []);
        setSelectedUsername((current) => {
          if (
            preferredUsername &&
            data.some((item) => item.username === preferredUsername)
          ) {
            return preferredUsername;
          }
          if (current && data.some((item) => item.username === current)) {
            return current;
          }
          return data[0]?.username || "";
        });
      } catch (error: any) {
        toast({
          title: t("adminAccounts.loadError"),
          description: String(error?.message ?? error ?? ""),
          status: "error",
          duration: 3000,
          isClosable: true,
        });
      } finally {
        setLoading(false);
      }
    },
    [t, toast]
  );

  useEffect(() => {
    if (!getUserIsPending && getUserIsSuccess && isSudo) {
      loadAdmins();
    }
  }, [getUserIsPending, getUserIsSuccess, isSudo, loadAdmins]);

  const selectedAdmin = useMemo(
    () => admins.find((admin) => admin.username === selectedUsername) || null,
    [admins, selectedUsername]
  );

  useEffect(() => {
    setEditForm(mapAdminToForm(selectedAdmin));
  }, [selectedAdmin]);

  const loadChatPermissions = useCallback(
    async (username: string) => {
      if (!chatPermissionsEnabled || !isSudo || !username) {
        setChatAssignableAdmins([]);
        setChatAllowedUsernames([]);
        setChatLockedReason("");
        return;
      }

      setChatPermissionsLoading(true);
      try {
        const data = await fetch<AdminChatPermissionsResponse>(
          `/admin-chat/permissions/${encodeURIComponent(username)}`
        );
        setChatAssignableAdmins(data.assignable_admins || []);
        setChatAllowedUsernames(data.allowed_usernames || []);
        setChatLockedReason(String(data.locked_reason || ""));
      } catch (error: any) {
        setChatAssignableAdmins([]);
        setChatAllowedUsernames([]);
        setChatLockedReason("");
        toast({
          title: t("adminAccounts.chatPermissionsLoadError"),
          description: String(
            error?.response?._data?.detail || error?.message || error
          ),
          status: "error",
          duration: 3000,
          isClosable: true,
        });
      } finally {
        setChatPermissionsLoading(false);
      }
    },
    [chatPermissionsEnabled, isSudo, t, toast]
  );

  useEffect(() => {
    if (selectedAdmin?.username) {
      loadChatPermissions(selectedAdmin.username);
      return;
    }
    setChatAssignableAdmins([]);
    setChatAllowedUsernames([]);
    setChatLockedReason("");
  }, [selectedAdmin?.username, loadChatPermissions]);

  if (!getUserIsPending && getUserIsSuccess && !isSudo) {
    return <Navigate to="/" replace />;
  }

  const updateCreateField = <K extends keyof AdminFormState>(
    key: K,
    value: AdminFormState[K]
  ) => {
    setCreateForm((current) => ({ ...current, [key]: value }));
  };

  const updateEditField = <K extends keyof AdminFormState>(
    key: K,
    value: AdminFormState[K]
  ) => {
    setEditForm((current) => ({ ...current, [key]: value }));
  };

  const validatePasswordPair = (
    password: string,
    confirmPassword: string
  ) => {
    if (!password && !confirmPassword) return true;
    return password === confirmPassword;
  };

  const buildPayload = (form: AdminFormState, isCreate: boolean) => {
    const payload: Record<string, any> = {
      is_sudo: !!form.is_sudo,
      is_disabled: !!form.is_disabled,
      telegram_id: parseNullableInteger(form.telegram_id, 0),
      discord_webhook: form.discord_webhook.trim() || null,
      subscription_url_prefix: form.subscription_url_prefix.trim() || null,
      users_limit: parseNullableInteger(form.users_limit, 0),
      traffic_limit: toTrafficBytes(form.traffic_limit, form.traffic_unit),
      unique_ip_limit: parseNullableInteger(form.unique_ip_limit, 1),
      device_limit: parseNullableInteger(form.device_limit, 1),
    };

    if (isCreate) {
      payload.username = form.username.trim();
      payload.password = form.password;
    } else if (form.password.trim()) {
      payload.password = form.password;
    }

    return payload;
  };

  const handleCreateAdmin = async () => {
    if (!createForm.username.trim()) {
      toast({
        title: t("adminAccounts.usernameRequired"),
        status: "warning",
        duration: 2500,
        isClosable: true,
      });
      return;
    }
    if (!createForm.password.trim()) {
      toast({
        title: t("adminAccounts.passwordRequired"),
        status: "warning",
        duration: 2500,
        isClosable: true,
      });
      return;
    }
    if (
      !validatePasswordPair(createForm.password, createForm.confirmPassword)
    ) {
      toast({
        title: t("adminAccounts.passwordMismatch"),
        status: "warning",
        duration: 2500,
        isClosable: true,
      });
      return;
    }

    setCreateLoading(true);
    try {
      const created = await fetch<Admin>("/admin", {
        method: "POST",
        body: buildPayload(createForm, true),
      });
      toast({
        title: t("adminAccounts.createSuccess", {
          username: created.username,
        }),
        status: "success",
        duration: 3000,
        isClosable: true,
      });
      setCreateForm(createEmptyForm());
      await loadAdmins(created.username);
    } catch (error: any) {
      toast({
        title: t("adminAccounts.createError"),
        description: String(
          error?.response?._data?.detail || error?.message || error
        ),
        status: "error",
        duration: 3500,
        isClosable: true,
      });
    } finally {
      setCreateLoading(false);
    }
  };

  const handleSaveAdmin = async () => {
    if (!selectedAdmin) return;
    if (!validatePasswordPair(editForm.password, editForm.confirmPassword)) {
      toast({
        title: t("adminAccounts.passwordMismatch"),
        status: "warning",
        duration: 2500,
        isClosable: true,
      });
      return;
    }

    setUpdateLoading(true);
    try {
      const updated = await fetch<Admin>(
        `/admin/${encodeURIComponent(selectedAdmin.username)}`,
        {
          method: "PUT",
          body: buildPayload(editForm, false),
        }
      );
      toast({
        title: t("adminAccounts.updateSuccess", {
          username: updated.username,
        }),
        status: "success",
        duration: 3000,
        isClosable: true,
      });
      await loadAdmins(updated.username);
    } catch (error: any) {
      toast({
        title: t("adminAccounts.updateError"),
        description: String(
          error?.response?._data?.detail || error?.message || error
        ),
        status: "error",
        duration: 3500,
        isClosable: true,
      });
    } finally {
      setUpdateLoading(false);
    }
  };

  const handleDeleteAdmin = async () => {
    if (!selectedAdmin) return;
    if (selectedAdmin.username === currentAdminUsername) {
      toast({
        title: t("adminAccounts.cannotDeleteSelf"),
        status: "warning",
        duration: 2500,
        isClosable: true,
      });
      return;
    }

    const confirmed = window.confirm(
      t("adminAccounts.confirmDelete", {
        username: selectedAdmin.username,
      })
    );
    if (!confirmed) return;

    setDeleteLoading(true);
    try {
      await fetch(`/admin/${encodeURIComponent(selectedAdmin.username)}`, {
        method: "DELETE",
      });
      toast({
        title: t("adminAccounts.deleteSuccess", {
          username: selectedAdmin.username,
        }),
        status: "success",
        duration: 3000,
        isClosable: true,
      });
      await loadAdmins();
    } catch (error: any) {
      toast({
        title: t("adminAccounts.deleteError"),
        description: String(
          error?.response?._data?.detail || error?.message || error
        ),
        status: "error",
        duration: 3500,
        isClosable: true,
      });
    } finally {
      setDeleteLoading(false);
    }
  };

  const toggleChatPermission = (username: string, checked: boolean) => {
    setChatAllowedUsernames((current) => {
      const next = new Set(current);
      if (checked) next.add(username);
      else next.delete(username);
      return Array.from(next).sort((left, right) => left.localeCompare(right));
    });
  };

  const handleSaveChatPermissions = async () => {
    if (!selectedAdmin) return;

    setChatPermissionsSaving(true);
    try {
      const response = await fetch<AdminChatPermissionsResponse>(
        `/admin-chat/permissions/${encodeURIComponent(selectedAdmin.username)}`,
        {
          method: "PUT",
          body: {
            allowed_usernames: chatAllowedUsernames,
          },
        }
      );
      setChatAssignableAdmins(response.assignable_admins || []);
      setChatAllowedUsernames(response.allowed_usernames || []);
      setChatLockedReason(String(response.locked_reason || ""));
      toast({
        title: t("adminAccounts.chatPermissionsSaveSuccess"),
        status: "success",
        duration: 2500,
        isClosable: true,
      });
    } catch (error: any) {
      toast({
        title: t("adminAccounts.chatPermissionsSaveError"),
        description: String(
          error?.response?._data?.detail || error?.message || error
        ),
        status: "error",
        duration: 3500,
        isClosable: true,
      });
    } finally {
      setChatPermissionsSaving(false);
    }
  };

  return (
    <Box minW={0}>
      <Card className="glass-card">
        <CardHeader pb={0}>
          <HStack spacing={3} align="center">
            <Box
              display="inline-flex"
              alignItems="center"
              justifyContent="center"
              w="42px"
              h="42px"
              borderRadius="14px"
              bg="var(--blue-soft)"
              border="1px solid var(--blue-border)"
            >
              <UserPlusIcon width="20px" height="20px" />
            </Box>
            <Box>
              <Text fontSize={{ base: "xl", md: "2xl" }} fontWeight="700">
                {t("adminAccounts.title")}
              </Text>
              <Text fontSize="sm" color="var(--muted)">
                {t("adminAccounts.subtitle")}
              </Text>
            </Box>
          </HStack>
        </CardHeader>
        <CardBody pt={5}>
          <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={5}>
            <Card className="glass-list-card" border="1px solid var(--border)">
              <CardHeader pb={0}>
                <Text fontWeight="700">{t("adminAccounts.createTitle")}</Text>
                <Text fontSize="sm" color="var(--muted)">
                  {t("adminAccounts.createDescription")}
                </Text>
              </CardHeader>
              <CardBody>
                <VStack spacing={4} align="stretch">
                  <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                    <Input
                      label={t("adminAccounts.username")}
                      value={createForm.username}
                      onChange={(event) =>
                        updateCreateField("username", event.target.value)
                      }
                    />
                    <Input
                      label={t("adminAccounts.password")}
                      type="password"
                      value={createForm.password}
                      onChange={(event) =>
                        updateCreateField("password", event.target.value)
                      }
                    />
                  </SimpleGrid>

                  <Input
                    label={t("adminAccounts.confirmPassword")}
                    type="password"
                    value={createForm.confirmPassword}
                    onChange={(event) =>
                      updateCreateField("confirmPassword", event.target.value)
                    }
                  />

                  <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                    <AdminSwitchRow
                      label={t("adminAccounts.sudo")}
                      hint={t("adminAccounts.sudoHint")}
                      isChecked={createForm.is_sudo}
                      onChange={(checked) =>
                        updateCreateField("is_sudo", checked)
                      }
                    />
                    <AdminSwitchRow
                      label={t("adminAccounts.frozen")}
                      hint={t("adminAccounts.frozenHint")}
                      isChecked={createForm.is_disabled}
                      onChange={(checked) =>
                        updateCreateField("is_disabled", checked)
                      }
                    />
                  </SimpleGrid>

                  <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                    <Input
                      label={t("adminAccounts.telegramId")}
                      type="number"
                      value={createForm.telegram_id}
                      onChange={(event) =>
                        updateCreateField("telegram_id", event.target.value)
                      }
                    />
                    <Input
                      label={t("adminAccounts.usersLimit")}
                      type="number"
                      value={createForm.users_limit}
                      onChange={(event) =>
                        updateCreateField("users_limit", event.target.value)
                      }
                    />
                  </SimpleGrid>

                  <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                    <FormControl>
                      <FormLabel>{t("adminAccounts.trafficLimit")}</FormLabel>
                      <HStack align="stretch">
                        <Input
                          type="number"
                          value={createForm.traffic_limit}
                          onChange={(event) =>
                            updateCreateField("traffic_limit", event.target.value)
                          }
                        />
                        <Select
                          value={createForm.traffic_unit}
                          onChange={(event) =>
                            updateCreateField(
                              "traffic_unit",
                              event.target.value as TrafficUnit
                            )
                          }
                          maxW="100px"
                        >
                          <option value="GB">GB</option>
                          <option value="TB">TB</option>
                        </Select>
                      </HStack>
                    </FormControl>
                    <Input
                      label={t("adminAccounts.uniqueIpLimit")}
                      type="number"
                      value={createForm.unique_ip_limit}
                      onChange={(event) =>
                        updateCreateField(
                          "unique_ip_limit",
                          event.target.value
                        )
                      }
                    />
                  </SimpleGrid>

                  <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                    <Input
                      label={t("adminAccounts.deviceLimit")}
                      type="number"
                      value={createForm.device_limit}
                      onChange={(event) =>
                        updateCreateField("device_limit", event.target.value)
                      }
                    />
                    <Input
                      label={t("adminAccounts.subscriptionPrefix")}
                      value={createForm.subscription_url_prefix}
                      onChange={(event) =>
                        updateCreateField(
                          "subscription_url_prefix",
                          event.target.value
                        )
                      }
                    />
                  </SimpleGrid>

                  <Input
                    label={t("adminAccounts.discordWebhook")}
                    value={createForm.discord_webhook}
                    onChange={(event) =>
                      updateCreateField("discord_webhook", event.target.value)
                    }
                  />

                  <Button
                    className="dashboard-accent-btn"
                    onClick={handleCreateAdmin}
                    isLoading={createLoading}
                    leftIcon={<UserPlusIcon width="18px" height="18px" />}
                  >
                    {t("adminAccounts.createButton")}
                  </Button>
                </VStack>
              </CardBody>
            </Card>

            <Card className="glass-list-card" border="1px solid var(--border)">
              <CardHeader pb={0}>
                <HStack justify="space-between" align="center" spacing={3}>
                  <Box>
                    <Text fontWeight="700">{t("adminAccounts.manageTitle")}</Text>
                    <Text fontSize="sm" color="var(--muted)">
                      {t("adminAccounts.manageDescription")}
                    </Text>
                  </Box>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => loadAdmins(selectedUsername || undefined)}
                    isLoading={loading}
                  >
                    {t("adminAccounts.refresh")}
                  </Button>
                </HStack>
              </CardHeader>
              <CardBody>
                {loading ? (
                  <HStack justify="center" py={8}>
                    <Spinner size="sm" />
                  </HStack>
                ) : (
                  <Stack spacing={4}>
                    <Box
                      border="1px solid var(--border)"
                      borderRadius="18px"
                      bg="var(--surface-soft)"
                      p={3}
                      maxH={{ base: "220px", md: "260px" }}
                      overflowY="auto"
                    >
                      <VStack spacing={2} align="stretch">
                        {admins.length ? (
                          admins.map((admin) => (
                            <Button
                              key={admin.username}
                              variant={
                                admin.username === selectedUsername
                                  ? "solid"
                                  : "outline"
                              }
                              colorScheme={
                                admin.username === selectedUsername
                                  ? "blue"
                                  : "gray"
                              }
                              justifyContent="space-between"
                              h="auto"
                              minH="54px"
                              py={3}
                              onClick={() => setSelectedUsername(admin.username)}
                            >
                              <HStack justify="space-between" w="full" minW={0}>
                                <VStack align="flex-start" spacing={0} minW={0}>
                                  <Text noOfLines={1}>{admin.username}</Text>
                                  <Text fontSize="xs" opacity={0.72}>
                                    {admin.is_disabled
                                      ? t("adminAccounts.statusFrozen")
                                      : t("adminAccounts.statusActive")}
                                  </Text>
                                </VStack>
                                <HStack spacing={2} flexShrink={0}>
                                  {admin.username === currentAdminUsername ? (
                                    <Badge colorScheme="cyan">
                                      {t("adminAccounts.current")}
                                    </Badge>
                                  ) : null}
                                  {admin.is_sudo ? (
                                    <Badge colorScheme="purple">sudo</Badge>
                                  ) : (
                                    <Badge>{t("adminAccounts.regular")}</Badge>
                                  )}
                                  {admin.is_disabled ? (
                                    <Badge colorScheme="red">
                                      {t("adminAccounts.frozen")}
                                    </Badge>
                                  ) : null}
                                </HStack>
                              </HStack>
                            </Button>
                          ))
                        ) : (
                          <Text fontSize="sm" color="var(--muted)">
                            {t("adminAccounts.noAdmins")}
                          </Text>
                        )}
                      </VStack>
                    </Box>

                    {selectedAdmin ? (
                      <VStack
                        spacing={4}
                        align="stretch"
                        border="1px solid var(--border)"
                        borderRadius="18px"
                        bg="var(--surface-soft)"
                        p={{ base: 3, md: 4 }}
                      >
                        <HStack
                          justify="space-between"
                          align="flex-start"
                          wrap="wrap"
                        >
                          <Box>
                            <HStack spacing={2} wrap="wrap">
                              <Text fontWeight="700" fontSize="lg">
                                {selectedAdmin.username}
                              </Text>
                              {selectedAdmin.is_sudo ? (
                                <Badge colorScheme="purple">sudo</Badge>
                              ) : (
                                <Badge>{t("adminAccounts.regular")}</Badge>
                              )}
                              {selectedAdmin.is_disabled ? (
                                <Badge colorScheme="red">
                                  {t("adminAccounts.frozen")}
                                </Badge>
                              ) : (
                                <Badge colorScheme="green">
                                  {t("adminAccounts.active")}
                                </Badge>
                              )}
                            </HStack>
                            <Text fontSize="sm" color="var(--muted)" mt={1}>
                              {t("adminAccounts.createdAt")}:{" "}
                              {formatDate(selectedAdmin.created_at)}
                            </Text>
                            <Text fontSize="sm" color="var(--muted)" mt={1}>
                              {t("adminAccounts.usedTraffic")}:{" "}
                              {formatBytes(selectedAdmin.users_usage)}
                            </Text>
                          </Box>
                          <HStack spacing={2} wrap="wrap" justify="flex-end">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setEditForm(mapAdminToForm(selectedAdmin))
                              }
                            >
                              {t("adminAccounts.resetChanges")}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              colorScheme="red"
                              onClick={handleDeleteAdmin}
                              isDisabled={
                                deleteLoading ||
                                selectedAdmin.username === currentAdminUsername
                              }
                              isLoading={deleteLoading}
                            >
                              {t("adminAccounts.delete")}
                            </Button>
                          </HStack>
                        </HStack>

                        <Divider />

                        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                          <Input
                            label={t("adminAccounts.username")}
                            value={editForm.username}
                            disabled
                          />
                          <Input
                            label={t("adminAccounts.newPassword")}
                            type="password"
                            value={editForm.password}
                            onChange={(event) =>
                              updateEditField("password", event.target.value)
                            }
                          />
                        </SimpleGrid>

                        <Input
                          label={t("adminAccounts.confirmPassword")}
                          type="password"
                          value={editForm.confirmPassword}
                          onChange={(event) =>
                            updateEditField(
                              "confirmPassword",
                              event.target.value
                            )
                          }
                        />

                        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                          <AdminSwitchRow
                            label={t("adminAccounts.sudo")}
                            hint={t("adminAccounts.sudoHint")}
                            isChecked={editForm.is_sudo}
                            onChange={(checked) =>
                              updateEditField("is_sudo", checked)
                            }
                          />
                          <AdminSwitchRow
                            label={t("adminAccounts.frozen")}
                            hint={
                              selectedAdmin.username === currentAdminUsername
                                ? t("adminAccounts.frozenSelfHint")
                                : t("adminAccounts.frozenHint")
                            }
                            isChecked={editForm.is_disabled}
                            onChange={(checked) =>
                              updateEditField("is_disabled", checked)
                            }
                          />
                        </SimpleGrid>

                        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                          <Input
                            label={t("adminAccounts.telegramId")}
                            type="number"
                            value={editForm.telegram_id}
                            onChange={(event) =>
                              updateEditField("telegram_id", event.target.value)
                            }
                          />
                          <Input
                            label={t("adminAccounts.usersLimit")}
                            type="number"
                            value={editForm.users_limit}
                            onChange={(event) =>
                              updateEditField("users_limit", event.target.value)
                            }
                          />
                        </SimpleGrid>

                        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                          <FormControl>
                            <FormLabel>{t("adminAccounts.trafficLimit")}</FormLabel>
                            <HStack align="stretch">
                              <Input
                                type="number"
                                value={editForm.traffic_limit}
                                onChange={(event) =>
                                  updateEditField(
                                    "traffic_limit",
                                    event.target.value
                                  )
                                }
                              />
                              <Select
                                value={editForm.traffic_unit}
                                onChange={(event) =>
                                  updateEditField(
                                    "traffic_unit",
                                    event.target.value as TrafficUnit
                                  )
                                }
                                maxW="100px"
                              >
                                <option value="GB">GB</option>
                                <option value="TB">TB</option>
                              </Select>
                            </HStack>
                          </FormControl>
                          <Input
                            label={t("adminAccounts.uniqueIpLimit")}
                            type="number"
                            value={editForm.unique_ip_limit}
                            onChange={(event) =>
                              updateEditField(
                                "unique_ip_limit",
                                event.target.value
                              )
                            }
                          />
                        </SimpleGrid>

                        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                          <Input
                            label={t("adminAccounts.deviceLimit")}
                            type="number"
                            value={editForm.device_limit}
                            onChange={(event) =>
                              updateEditField(
                                "device_limit",
                                event.target.value
                              )
                            }
                          />
                          <Input
                            label={t("adminAccounts.subscriptionPrefix")}
                            value={editForm.subscription_url_prefix}
                            onChange={(event) =>
                              updateEditField(
                                "subscription_url_prefix",
                                event.target.value
                              )
                            }
                          />
                        </SimpleGrid>

                        <Input
                          label={t("adminAccounts.discordWebhook")}
                          value={editForm.discord_webhook}
                          onChange={(event) =>
                            updateEditField(
                              "discord_webhook",
                              event.target.value
                            )
                          }
                        />

                        <Button
                          className="dashboard-accent-btn"
                          onClick={handleSaveAdmin}
                          isLoading={updateLoading}
                          leftIcon={<ShieldCheckIcon width="18px" height="18px" />}
                        >
                          {t("adminAccounts.saveChanges")}
                        </Button>

                        {chatPermissionsEnabled ? (
                          <>
                            <Divider />

                            <VStack
                              spacing={4}
                              align="stretch"
                              border="1px solid var(--border)"
                              borderRadius="18px"
                              bg="rgba(255,255,255,0.02)"
                              p={{ base: 3, md: 4 }}
                            >
                              <HStack
                                justify="space-between"
                                align={{ base: "flex-start", md: "center" }}
                                flexDir={{ base: "column", md: "row" }}
                                spacing={3}
                              >
                                <Box>
                                  <Text fontWeight="700">
                                    {t("adminAccounts.chatPermissionsTitle")}
                                  </Text>
                                  <Text fontSize="sm" color="var(--muted)">
                                    {t("adminAccounts.chatPermissionsDescription")}
                                  </Text>
                                </Box>
                                <HStack spacing={2}>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      selectedAdmin
                                        ? loadChatPermissions(selectedAdmin.username)
                                        : undefined
                                    }
                                    isLoading={chatPermissionsLoading}
                                  >
                                    {t("adminAccounts.refresh")}
                                  </Button>
                                  {!chatLockedReason &&
                                  chatAssignableAdmins.length ? (
                                    <Button
                                      size="sm"
                                      className="dashboard-accent-btn"
                                      onClick={handleSaveChatPermissions}
                                      isLoading={chatPermissionsSaving}
                                    >
                                      {t("adminAccounts.saveChanges")}
                                    </Button>
                                  ) : null}
                                </HStack>
                              </HStack>

                              {chatPermissionsLoading ? (
                                <HStack justify="center" py={5}>
                                  <Spinner size="sm" />
                                </HStack>
                              ) : chatLockedReason ? (
                                <Box
                                  border="1px solid var(--border)"
                                  borderRadius="16px"
                                  bg="var(--surface-soft)"
                                  p={4}
                                >
                                  <Text fontSize="sm" color="var(--muted)">
                                    {chatLockedReason}
                                  </Text>
                                </Box>
                              ) : chatAssignableAdmins.length ? (
                                <VStack align="stretch" spacing={3}>
                                  {chatAssignableAdmins.map((adminItem) => (
                                    <AdminSwitchRow
                                      key={adminItem.username}
                                      label={adminItem.username}
                                      hint={t("adminAccounts.chatPermissionsAllow")}
                                      isChecked={chatAllowedUsernames.includes(
                                        adminItem.username
                                      )}
                                      onChange={(checked) =>
                                        toggleChatPermission(
                                          adminItem.username,
                                          checked
                                        )
                                      }
                                    />
                                  ))}
                                </VStack>
                              ) : (
                                <Text fontSize="sm" color="var(--muted)">
                                  {t("adminAccounts.chatPermissionsNone")}
                                </Text>
                              )}
                            </VStack>
                          </>
                        ) : null}
                      </VStack>
                    ) : (
                      <Box
                        border="1px dashed var(--border)"
                        borderRadius="18px"
                        p={5}
                        textAlign="center"
                      >
                        <UserCircleIcon
                          width="26px"
                          height="26px"
                          style={{ margin: "0 auto 10px" }}
                        />
                        <Text fontWeight="semibold">
                          {t("adminAccounts.selectAdminTitle")}
                        </Text>
                        <Text fontSize="sm" color="var(--muted)" mt={1}>
                          {t("adminAccounts.selectAdminHint")}
                        </Text>
                      </Box>
                    )}
                  </Stack>
                )}
              </CardBody>
            </Card>
          </SimpleGrid>
        </CardBody>
      </Card>
    </Box>
  );
};

export default AdminAccountsPage;
