import {
  Badge,
  Box,
  Button,
  Flex,
  FormControl,
  FormHelperText,
  FormLabel,
  HStack,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  SimpleGrid,
  Spinner,
  Switch,
  Text,
  Textarea,
  VStack,
  useToast,
} from "@chakra-ui/react";
import { useTranslation } from "react-i18next";
import { fetch } from "service/http";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDashboard } from "../contexts/DashboardContext";
import useGetUser from "hooks/useGetUser";
import { useFeatures } from "hooks/useFeatures";
import { copyToClipboard } from "utils/clipboard";

type HeaderRow = {
  id: string;
  key: string;
  value: string;
};

type SettingsState = {
  profile_title: string;
  support_link: string;
  profile_update_interval: string;
  is_profile_web_page_url_enabled: boolean;
  serve_json_for_happ: boolean;
  is_show_custom_remarks: boolean;
  randomize_text_links: boolean;
  happ_announce: string;
  happ_routing: string;
  hwid_settings: {
    enabled: boolean;
    fallback_device_limit: string;
    max_devices_announce: string;
  };
};

type RemarkTextState = {
  expired_users: string;
  limited_users: string;
  disabled_users: string;
  empty_hosts: string;
  hwid_max_devices_exceeded: string;
  hwid_not_supported: string;
};

const createHeaderRow = (key = "", value = ""): HeaderRow => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  key,
  value,
});

const createDefaultSettings = (): SettingsState => ({
  profile_title: "Flew",
  support_link: "",
  profile_update_interval: "12",
  is_profile_web_page_url_enabled: true,
  serve_json_for_happ: false,
  is_show_custom_remarks: true,
  randomize_text_links: false,
  happ_announce: "",
  happ_routing: "",
  hwid_settings: {
    enabled: false,
    fallback_device_limit: "1",
    max_devices_announce: "",
  },
});

const createDefaultRemarks = (): RemarkTextState => ({
  expired_users: "Subscription expired\nContact support",
  limited_users: "Subscription limited\nContact support",
  disabled_users: "Subscription disabled\nContact support",
  empty_hosts: "No active hosts available\nCheck Hosts page",
  hwid_max_devices_exceeded: "Device limit reached",
  hwid_not_supported: "App not supported",
});

const linesToText = (value?: string[]) => (Array.isArray(value) ? value.join("\n") : "");

const textToLines = (value: string) =>
  value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);

const headersToRows = (headers?: Record<string, string>) => {
  const entries = Object.entries(headers || {});
  if (!entries.length) {
    return [createHeaderRow()];
  }
  return entries.map(([key, value]) => createHeaderRow(key, value));
};

const rowsToHeaders = (rows: HeaderRow[]) =>
  rows.reduce<Record<string, string>>((acc, row) => {
    const key = row.key.trim();
    const value = row.value.trim();
    if (!key) return acc;
    acc[key] = value;
    return acc;
  }, {});

const SectionCard = ({
  title,
  description,
  right,
  children,
}: {
  title: string;
  description?: string;
  right?: ReactNode;
  children: ReactNode;
}) => (
  <Box className="glass-card" borderRadius="2xl" p={{ base: 4, md: 5 }}>
    <Flex
      justify="space-between"
      align={{ base: "flex-start", md: "center" }}
      gap={3}
      mb={4}
      flexDirection={{ base: "column", md: "row" }}
    >
      <Box minW={0}>
        <Text fontSize="lg" fontWeight="700" color="var(--text)">
          {title}
        </Text>
        {description ? (
          <Text fontSize="sm" color="var(--muted)" mt={1}>
            {description}
          </Text>
        ) : null}
      </Box>
      {right}
    </Flex>
    {children}
  </Box>
);

export function CryptoLinkModal({
  mode = "modal",
  view = "generator",
}: {
  mode?: "modal" | "page";
  view?: "generator" | "settings";
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const { isEditingCrypto, onEditingCrypto } = useDashboard();
  const navigate = useNavigate();
  const { userData } = useGetUser();
  const { hasFeature } = useFeatures();
  const isPageMode = mode === "page";
  const isSettingsView = view === "settings";
  const isActive = isPageMode || isEditingCrypto;
  const isSudo = !!userData?.is_sudo;
  const canUseHappCryptoModule = hasFeature("happ_crypto");
  const canUseHappCryptoSettings = isSettingsView || canUseHappCryptoModule;

  const [raw, setRaw] = useState("");
  const [hwid, setHwid] = useState("");
  const [hwidLimit, setHwidLimit] = useState("");
  const [cryptoVersion, setCryptoVersion] = useState("v5");
  const [hideSettings, setHideSettings] = useState(true);
  const [resetUsername, setResetUsername] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [encrypted, setEncrypted] = useState("");
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settings, setSettings] = useState<SettingsState>(createDefaultSettings);
  const [remarks, setRemarks] = useState<RemarkTextState>(createDefaultRemarks);
  const [headerRows, setHeaderRows] = useState<HeaderRow[]>([createHeaderRow()]);

  const onClose = () => {
    onEditingCrypto(false);
    if (isPageMode) {
      navigate("/", { replace: true });
    }
  };

  const loadSettings = async () => {
    setLoadingSettings(true);
    try {
      const response: any = await fetch("/flew/subscription-settings");
      setSettings({
        profile_title: response?.profile_title || "Flew",
        support_link: response?.support_link || "",
        profile_update_interval: String(
          response?.profile_update_interval ?? 12
        ),
        is_profile_web_page_url_enabled:
          response?.is_profile_web_page_url_enabled !== false,
        serve_json_for_happ: !!response?.serve_json_for_happ,
        is_show_custom_remarks: response?.is_show_custom_remarks !== false,
        randomize_text_links: !!response?.randomize_text_links,
        happ_announce: response?.happ_announce || "",
        happ_routing: response?.happ_routing || "",
        hwid_settings: {
          enabled: !!response?.hwid_settings?.enabled,
          fallback_device_limit: String(
            response?.hwid_settings?.fallback_device_limit ?? 1
          ),
          max_devices_announce:
            response?.hwid_settings?.max_devices_announce || "",
        },
      });
      setRemarks({
        expired_users: linesToText(response?.custom_remarks?.expired_users),
        limited_users: linesToText(response?.custom_remarks?.limited_users),
        disabled_users: linesToText(response?.custom_remarks?.disabled_users),
        empty_hosts: linesToText(response?.custom_remarks?.empty_hosts),
        hwid_max_devices_exceeded: canUseHappCryptoSettings
          ? linesToText(response?.custom_remarks?.hwid_max_devices_exceeded)
          : "",
        hwid_not_supported: canUseHappCryptoSettings
          ? linesToText(response?.custom_remarks?.hwid_not_supported)
          : "",
      });
      setHeaderRows(headersToRows(response?.custom_response_headers));
    } catch (error: any) {
      toast({
        title: t("cryptoLink.settingsLoadFailed"),
        description: String(error?.message ?? error ?? ""),
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setLoadingSettings(false);
    }
  };

  useEffect(() => {
    if (!isActive) return;
    loadSettings();
  }, [isActive]);

  const onResetHwid = async () => {
    try {
      const username = resetUsername.trim();
      if (!username) {
        toast({
          title: t("cryptoLink.hwidResetEmpty"),
          status: "warning",
          duration: 2000,
          isClosable: true,
        });
        return;
      }
      setIsResetting(true);
      const resp: any = await fetch("/flew/hwid/reset", {
        method: "POST",
        body: { username },
      });
      if (resp && resp.cleared) {
        toast({
          title: t("cryptoLink.hwidResetDone"),
          status: "success",
          duration: 1500,
          isClosable: true,
        });
      } else {
        toast({
          title: t("cryptoLink.hwidResetNoData"),
          status: "info",
          duration: 2500,
          isClosable: true,
        });
      }
    } catch (err: any) {
      toast({
        title: t("cryptoLink.hwidResetFailed"),
        description: String(err?.message ?? err),
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setIsResetting(false);
    }
  };

  const onEncrypt = async () => {
    try {
      if (!raw.trim()) {
        toast({
          title: t("cryptoLink.empty"),
          status: "warning",
          duration: 2000,
          isClosable: true,
        });
        return;
      }
      setIsEncrypting(true);
      const body: Record<string, string | number | boolean> = {
        url: raw.trim(),
        version: cryptoVersion,
        hide_settings: hideSettings,
      };
      if (hwid.trim()) {
        body.hwid = hwid.trim();
      }
      if (hwidLimit.trim()) {
        body.hwid_limit = Number(hwidLimit);
      }
      const resp: any = await fetch("/flew/crypto-link", {
        method: "POST",
        body,
      });
      const link =
        (resp &&
          (resp.encrypted_link ||
            resp.link ||
            resp.url ||
            resp.result ||
            resp.data ||
            resp.encrypted)) ||
        resp;
      if (!link || typeof link !== "string") {
        throw new Error("Invalid response");
      }
      setEncrypted(link);
      toast({
        title: t("cryptoLink.done"),
        status: "success",
        duration: 1500,
        isClosable: true,
      });
    } catch (err: any) {
      toast({
        title: t("cryptoLink.failed"),
        description: String(err?.message ?? err),
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setIsEncrypting(false);
    }
  };

  const onCopy = async (value: string) => {
    if (!value.trim()) return;
    const success = await copyToClipboard(value);
    toast({
      title: success ? t("cryptoLink.copied") : t("cryptoLink.copyFailed"),
      status: success ? "success" : "warning",
      duration: 1800,
      isClosable: true,
    });
  };

  const onSaveSettings = async () => {
    if (!isSudo) {
      toast({
        title: t("cryptoLink.settingsReadOnly"),
        status: "info",
        duration: 2400,
        isClosable: true,
      });
      return;
    }
    try {
      setSavingSettings(true);
      const payload: Record<string, any> = {
        ...settings,
        profile_update_interval: Number(settings.profile_update_interval || 12),
        custom_response_headers: rowsToHeaders(headerRows),
        custom_remarks: {
          expired_users: textToLines(remarks.expired_users),
          limited_users: textToLines(remarks.limited_users),
          disabled_users: textToLines(remarks.disabled_users),
          empty_hosts: textToLines(remarks.empty_hosts),
        },
      };
      if (canUseHappCryptoSettings) {
        payload.custom_remarks.hwid_max_devices_exceeded = textToLines(
          remarks.hwid_max_devices_exceeded
        );
        payload.custom_remarks.hwid_not_supported = textToLines(
          remarks.hwid_not_supported
        );
        payload.hwid_settings = {
          enabled: settings.hwid_settings.enabled,
          fallback_device_limit: Number(
            settings.hwid_settings.fallback_device_limit || 0
          ),
          max_devices_announce:
            settings.hwid_settings.max_devices_announce.trim() || null,
        };
      }
      const response: any = await fetch("/flew/subscription-settings", {
        method: "PUT",
        body: payload,
      });
      setHeaderRows(headersToRows(response?.custom_response_headers));
      toast({
        title: t("cryptoLink.settingsSaved"),
        status: "success",
        duration: 1800,
        isClosable: true,
      });
    } catch (error: any) {
      toast({
        title: t("cryptoLink.settingsSaveFailed"),
        description: String(error?.message ?? error ?? ""),
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setSavingSettings(false);
    }
  };

  const hasHeaders = useMemo(
    () => headerRows.some((row) => row.key.trim() || row.value.trim()),
    [headerRows]
  );

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
      maxW={isPageMode ? "100%" : { base: "100vw", xl: "1320px" }}
      minH={isPageMode ? undefined : { base: "100vh", lg: "calc(100vh - 24px)" }}
      alignSelf={isPageMode ? undefined : "center"}
    >
      <HeaderComponent className={isPageMode ? "chakra-modal__header" : undefined}>
        <Flex
          justify="space-between"
          gap={3}
          flexDirection={{ base: "column", md: "row" }}
          align={{ base: "flex-start", md: "center" }}
        >
          <Box>
            <Text fontSize="lg" fontWeight="700">
              {isSettingsView
                ? t("cryptoLink.settingsTitle")
                : t("cryptoLink.title")}
            </Text>
            <Text fontSize="sm" color="var(--muted)" mt={1}>
              {isSettingsView
                ? t("cryptoLink.settingsSubtitle")
                : t("cryptoLink.pageSubtitle")}
            </Text>
          </Box>
          <HStack spacing={2} align="center">
            {!isSettingsView ? (
              <Badge borderRadius="full" px={3} py={1} colorScheme="blue">
                {cryptoVersion.toUpperCase()}
              </Badge>
            ) : null}
            {isSettingsView ? (
              <Badge
                borderRadius="full"
                px={3}
                py={1}
                colorScheme={isSudo ? "green" : "gray"}
              >
                {isSudo
                  ? t("cryptoLink.globalSettingsEditable")
                  : t("cryptoLink.globalSettingsReadOnly")}
              </Badge>
            ) : null}
          </HStack>
        </Flex>
      </HeaderComponent>
      {!isPageMode && <ModalCloseButton />}
      <BodyComponent className={isPageMode ? "chakra-modal__body" : undefined}>
        {loadingSettings ? (
          <Flex justify="center" py={12}>
            <Spinner color="primary.300" />
          </Flex>
        ) : (
          <VStack spacing={5} align="stretch">
            {!isSettingsView ? (
              <SectionCard
                title={t("cryptoLink.generatorTitle")}
                description={t("cryptoLink.generatorDescription")}
                right={
                  encrypted ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onCopy(encrypted)}
                    >
                      {t("cryptoLink.copy")}
                    </Button>
                  ) : undefined
                }
              >
                <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={4}>
                  <VStack align="stretch" spacing={4}>
                    <FormControl>
                      <FormLabel>{t("cryptoLink.input")}</FormLabel>
                      <Textarea
                        value={raw}
                        onChange={(e) => setRaw(e.target.value)}
                        placeholder={t("cryptoLink.inputPlaceholder")}
                        minH="132px"
                      />
                    </FormControl>

                    <SimpleGrid
                      columns={{ base: 1, md: canUseHappCryptoModule ? 3 : 1 }}
                      spacing={3}
                    >
                      <FormControl>
                        <FormLabel>{t("cryptoLink.version")}</FormLabel>
                        <Select
                          value={cryptoVersion}
                          onChange={(e) => setCryptoVersion(e.target.value)}
                        >
                          <option value="v5">Happ v5</option>
                          <option value="v4">Happ v4</option>
                          <option value="v3">Happ v3</option>
                          <option value="v2">Happ v2</option>
                        </Select>
                      </FormControl>
                      {canUseHappCryptoModule ? (
                        <>
                          <FormControl>
                            <FormLabel>{t("cryptoLink.hwid")}</FormLabel>
                            <Input
                              value={hwid}
                              onChange={(e) => setHwid(e.target.value)}
                              placeholder={t("cryptoLink.hwidPlaceholder")}
                            />
                          </FormControl>
                          <FormControl>
                            <FormLabel>{t("cryptoLink.hwidLimit")}</FormLabel>
                            <Input
                              type="number"
                              inputMode="numeric"
                              min={1}
                              value={hwidLimit}
                              onChange={(e) =>
                                setHwidLimit(
                                  e.target.value.replace(/[^\d]/g, "")
                                )
                              }
                              placeholder={t("cryptoLink.hwidLimitPlaceholder")}
                            />
                          </FormControl>
                        </>
                      ) : null}
                    </SimpleGrid>

                    <Flex
                      justify="space-between"
                      align="center"
                      px={4}
                      py={3}
                      border="1px solid var(--border)"
                      borderRadius="18px"
                      bg="var(--surface-soft)"
                    >
                      <Box>
                        <Text fontWeight="600" fontSize="sm">
                          {t("cryptoLink.hideSettings")}
                        </Text>
                        <Text fontSize="xs" color="var(--muted)">
                          {t("cryptoLink.hideSettingsHint")}
                        </Text>
                      </Box>
                      <Switch
                        colorScheme="primary"
                        isChecked={hideSettings}
                        onChange={(event) =>
                          setHideSettings(event.target.checked)
                        }
                      />
                    </Flex>

                    <Button
                      onClick={onEncrypt}
                      colorScheme="blue"
                      className="dashboard-accent-btn"
                      isLoading={isEncrypting}
                      w={{ base: "full", md: "fit-content" }}
                    >
                      {t("cryptoLink.encrypt")}
                    </Button>
                  </VStack>

                  <VStack align="stretch" spacing={4}>
                    <Box
                      border="1px solid var(--border)"
                      borderRadius="22px"
                      bg="var(--surface-soft)"
                      p={4}
                      minH="100%"
                    >
                      <Text fontSize="sm" fontWeight="700" color="var(--text)">
                        {t("cryptoLink.output")}
                      </Text>
                      <Text fontSize="xs" color="var(--muted)" mt={1} mb={3}>
                        {t("cryptoLink.outputPlaceholder")}
                      </Text>
                      <Textarea
                        value={encrypted}
                        isReadOnly
                        placeholder={t("cryptoLink.outputPlaceholder")}
                        minH="220px"
                      />
                      <HStack
                        mt={3}
                        spacing={3}
                        flexDirection={{ base: "column", md: "row" }}
                        align="stretch"
                      >
                        <Button
                          variant="outline"
                          onClick={() => onCopy(encrypted)}
                          isDisabled={!encrypted}
                          w="full"
                        >
                          {t("cryptoLink.copy")}
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => setEncrypted("")}
                          isDisabled={!encrypted}
                          w="full"
                        >
                          {t("cryptoLink.clearOutput")}
                        </Button>
                      </HStack>
                    </Box>

                    {canUseHappCryptoModule ? (
                      <Box
                        border="1px solid var(--border)"
                        borderRadius="22px"
                        bg="var(--surface-soft)"
                        p={4}
                      >
                        <Text fontSize="sm" fontWeight="700">
                          {t("cryptoLink.hwidResetTitle")}
                        </Text>
                        <Text fontSize="xs" color="var(--muted)" mt={1} mb={3}>
                          {t("cryptoLink.hwidResetHint")}
                        </Text>
                        <HStack
                          spacing={3}
                          align="stretch"
                          flexDirection={{ base: "column", sm: "row" }}
                        >
                          <Input
                            value={resetUsername}
                            onChange={(e) => setResetUsername(e.target.value)}
                            placeholder={t("cryptoLink.hwidResetPlaceholder")}
                          />
                          <Button
                            onClick={onResetHwid}
                            isLoading={isResetting}
                            variant="outline"
                            w={{ base: "full", sm: "auto" }}
                          >
                            {t("cryptoLink.hwidResetButton")}
                          </Button>
                        </HStack>
                      </Box>
                    ) : null}
                  </VStack>
                </SimpleGrid>
              </SectionCard>
            ) : null}

            {isSettingsView ? (
              <>
                <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={5}>
                  <SectionCard
                    title={t("cryptoLink.subscriptionInfoTitle")}
                    description={t("cryptoLink.subscriptionInfoDescription")}
                  >
                    <VStack spacing={4} align="stretch">
                      <FormControl>
                        <FormLabel>{t("cryptoLink.profileTitle")}</FormLabel>
                        <Input
                          value={settings.profile_title}
                          onChange={(e) =>
                            setSettings((prev) => ({
                              ...prev,
                              profile_title: e.target.value,
                            }))
                          }
                          isDisabled={!isSudo}
                        />
                      </FormControl>
                      <FormControl>
                        <FormLabel>{t("cryptoLink.supportLink")}</FormLabel>
                        <Input
                          value={settings.support_link}
                          onChange={(e) =>
                            setSettings((prev) => ({
                              ...prev,
                              support_link: e.target.value,
                            }))
                          }
                          isDisabled={!isSudo}
                        />
                      </FormControl>
                      <FormControl>
                        <FormLabel>{t("cryptoLink.profileUpdateInterval")}</FormLabel>
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          value={settings.profile_update_interval}
                          onChange={(e) =>
                            setSettings((prev) => ({
                              ...prev,
                              profile_update_interval: e.target.value.replace(
                                /[^\d]/g,
                                ""
                              ),
                            }))
                          }
                          isDisabled={!isSudo}
                        />
                        <FormHelperText>
                          {t("cryptoLink.profileUpdateIntervalHint")}
                        </FormHelperText>
                      </FormControl>
                    </VStack>
                  </SectionCard>

                  <SectionCard
                    title={t("cryptoLink.extraOptionsTitle")}
                    description={t("cryptoLink.extraOptionsDescription")}
                  >
                    <VStack spacing={3} align="stretch">
                      {[
                        {
                          key: "is_profile_web_page_url_enabled" as const,
                          title: t("cryptoLink.optionProfilePage"),
                          hint: t("cryptoLink.optionProfilePageHint"),
                        },
                        {
                          key: "serve_json_for_happ" as const,
                          title: t("cryptoLink.optionJsonForHapp"),
                          hint: t("cryptoLink.optionJsonForHappHint"),
                        },
                        {
                          key: "is_show_custom_remarks" as const,
                          title: t("cryptoLink.optionCustomRemarks"),
                          hint: t("cryptoLink.optionCustomRemarksHint"),
                        },
                        {
                          key: "randomize_text_links" as const,
                          title: t("cryptoLink.optionRandomizeLinks"),
                          hint: t("cryptoLink.optionRandomizeLinksHint"),
                        },
                      ].map((option) => (
                        <Flex
                          key={option.key}
                          justify="space-between"
                          align="center"
                          px={4}
                          py={3}
                          border="1px solid var(--border)"
                          borderRadius="18px"
                          bg="var(--surface-soft)"
                        >
                          <Box pr={3}>
                            <Text fontSize="sm" fontWeight="600">
                              {option.title}
                            </Text>
                            <Text fontSize="xs" color="var(--muted)" mt={1}>
                              {option.hint}
                            </Text>
                          </Box>
                          <Switch
                            colorScheme="primary"
                            isChecked={settings[option.key]}
                            isDisabled={!isSudo}
                            onChange={(event) =>
                              setSettings((prev) => ({
                                ...prev,
                                [option.key]: event.target.checked,
                              }))
                            }
                          />
                        </Flex>
                      ))}
                    </VStack>
                  </SectionCard>
                </SimpleGrid>

                <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={5}>
                  {canUseHappCryptoSettings ? (
                    <SectionCard
                      title={t("cryptoLink.hwidSettingsTitle")}
                      description={t("cryptoLink.hwidSettingsDescription")}
                    >
                      <VStack spacing={4} align="stretch">
                        <Flex
                          justify="space-between"
                          align="center"
                          px={4}
                          py={3}
                          border="1px solid var(--border)"
                          borderRadius="18px"
                          bg="var(--surface-soft)"
                        >
                          <Box pr={3}>
                            <Text fontSize="sm" fontWeight="600">
                              {t("cryptoLink.hwidProtectionEnabled")}
                            </Text>
                            <Text fontSize="xs" color="var(--muted)" mt={1}>
                              {t("cryptoLink.hwidProtectionEnabledHint")}
                            </Text>
                          </Box>
                          <Switch
                            colorScheme="primary"
                            isChecked={settings.hwid_settings.enabled}
                            isDisabled={!isSudo}
                            onChange={(event) =>
                              setSettings((prev) => ({
                                ...prev,
                                hwid_settings: {
                                  ...prev.hwid_settings,
                                  enabled: event.target.checked,
                                },
                              }))
                            }
                          />
                        </Flex>

                        <FormControl>
                          <FormLabel>{t("cryptoLink.fallbackDeviceLimit")}</FormLabel>
                          <Input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            value={settings.hwid_settings.fallback_device_limit}
                            onChange={(e) =>
                              setSettings((prev) => ({
                                ...prev,
                                hwid_settings: {
                                  ...prev.hwid_settings,
                                  fallback_device_limit: e.target.value.replace(
                                    /[^\d]/g,
                                    ""
                                  ),
                                },
                              }))
                            }
                            isDisabled={!isSudo}
                          />
                        </FormControl>

                        <FormControl>
                          <FormLabel>{t("cryptoLink.maxDevicesAnnounce")}</FormLabel>
                          <Textarea
                            value={settings.hwid_settings.max_devices_announce}
                            onChange={(e) =>
                              setSettings((prev) => ({
                                ...prev,
                                hwid_settings: {
                                  ...prev.hwid_settings,
                                  max_devices_announce: e.target.value,
                                },
                              }))
                            }
                            placeholder={t("cryptoLink.maxDevicesAnnouncePlaceholder")}
                            minH="120px"
                            isDisabled={!isSudo}
                          />
                        </FormControl>
                      </VStack>
                    </SectionCard>
                  ) : null}
                  <SectionCard
                    title={t("cryptoLink.announceRoutingTitle")}
                    description={t("cryptoLink.announceRoutingDescription")}
                  >
                    <VStack spacing={4} align="stretch">
                      <FormControl>
                        <FormLabel>{t("cryptoLink.happAnnounce")}</FormLabel>
                        <Textarea
                          value={settings.happ_announce}
                          onChange={(e) =>
                            setSettings((prev) => ({
                              ...prev,
                              happ_announce: e.target.value,
                            }))
                          }
                          minH="132px"
                          isDisabled={!isSudo}
                        />
                      </FormControl>
                      <FormControl>
                        <FormLabel>{t("cryptoLink.happRouting")}</FormLabel>
                        <Textarea
                          value={settings.happ_routing}
                          onChange={(e) =>
                            setSettings((prev) => ({
                              ...prev,
                              happ_routing: e.target.value,
                            }))
                          }
                          placeholder="happ://routing/add/..."
                          minH="132px"
                          isDisabled={!isSudo}
                        />
                      </FormControl>
                    </VStack>
                  </SectionCard>
                </SimpleGrid>

                <SectionCard
                  title={t("cryptoLink.customRemarksTitle")}
                  description={t("cryptoLink.customRemarksDescription")}
                >
                  <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={4}>
                    {[
                      ["expired_users", t("cryptoLink.remarksExpired")],
                      ["limited_users", t("cryptoLink.remarksLimited")],
                      ["disabled_users", t("cryptoLink.remarksDisabled")],
                      ["empty_hosts", t("cryptoLink.remarksEmptyHosts")],
                      ...(canUseHappCryptoSettings
                        ? [
                            [
                              "hwid_max_devices_exceeded",
                              t("cryptoLink.remarksHwidMaxDevices"),
                            ],
                            [
                              "hwid_not_supported",
                              t("cryptoLink.remarksHwidUnsupported"),
                            ],
                          ]
                        : []),
                    ].map(([key, label]) => (
                      <FormControl key={key}>
                        <FormLabel>{label}</FormLabel>
                        <Textarea
                          value={remarks[key as keyof RemarkTextState]}
                          onChange={(e) =>
                            setRemarks((prev) => ({
                              ...prev,
                              [key]: e.target.value,
                            }))
                          }
                          minH="128px"
                          isDisabled={!isSudo}
                        />
                        <FormHelperText>
                          {t("cryptoLink.remarksHint")}
                        </FormHelperText>
                      </FormControl>
                    ))}
                  </SimpleGrid>
                </SectionCard>

                <SectionCard
                  title={t("cryptoLink.additionalHeadersTitle")}
                  description={t("cryptoLink.additionalHeadersDescription")}
                  right={
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setHeaderRows((prev) => [...prev, createHeaderRow()])
                      }
                      isDisabled={!isSudo}
                    >
                      {t("cryptoLink.addHeader")}
                    </Button>
                  }
                >
                  <VStack spacing={3} align="stretch">
                    {headerRows.map((row) => (
                      <SimpleGrid
                        key={row.id}
                        columns={{ base: 1, md: 12 }}
                        spacing={3}
                        alignItems="center"
                      >
                        <Box gridColumn={{ base: "span 1", md: "span 4" }}>
                          <Input
                            value={row.key}
                            onChange={(e) =>
                              setHeaderRows((prev) =>
                                prev.map((item) =>
                                  item.id === row.id
                                    ? { ...item, key: e.target.value }
                                    : item
                                )
                              )
                            }
                            placeholder={t("cryptoLink.headerKeyPlaceholder")}
                            isDisabled={!isSudo}
                          />
                        </Box>
                        <Box gridColumn={{ base: "span 1", md: "span 7" }}>
                          <Input
                            value={row.value}
                            onChange={(e) =>
                              setHeaderRows((prev) =>
                                prev.map((item) =>
                                  item.id === row.id
                                    ? { ...item, value: e.target.value }
                                    : item
                                )
                              )
                            }
                            placeholder={t("cryptoLink.headerValuePlaceholder")}
                            isDisabled={!isSudo}
                          />
                        </Box>
                        <Box gridColumn={{ base: "span 1", md: "span 1" }}>
                          <Button
                            variant="ghost"
                            colorScheme="red"
                            onClick={() =>
                              setHeaderRows((prev) =>
                                prev.length > 1
                                  ? prev.filter((item) => item.id !== row.id)
                                  : [createHeaderRow()]
                              )
                            }
                            isDisabled={!isSudo}
                            w="full"
                          >
                            {t("cryptoLink.removeHeader")}
                          </Button>
                        </Box>
                      </SimpleGrid>
                    ))}
                    {!hasHeaders ? (
                      <Text fontSize="sm" color="var(--muted)">
                        {t("cryptoLink.noHeadersYet")}
                      </Text>
                    ) : null}
                  </VStack>
                </SectionCard>
              </>
            ) : null}
          </VStack>
        )}
      </BodyComponent>
      <FooterComponent
        className={isPageMode ? "chakra-modal__footer" : undefined}
        display="flex"
        flexDirection={{ base: "column", md: "row" }}
        justifyContent="space-between"
        gap={3}
      >
        {isSettingsView ? (
          <>
            <Text fontSize="sm" color="var(--muted)">
              {isSudo
                ? t("cryptoLink.footerHint")
                : t("cryptoLink.settingsReadOnlyHint")}
            </Text>
            <HStack
              spacing={3}
              flexDirection={{ base: "column", md: "row" }}
              align="stretch"
              w={{ base: "full", md: "auto" }}
            >
              <Button
                onClick={onSaveSettings}
                colorScheme="blue"
                className="dashboard-accent-btn"
                isLoading={savingSettings}
                isDisabled={!isSudo}
                w={{ base: "full", md: "auto" }}
              >
                {t("core.save")}
              </Button>
              <Button
                onClick={onClose}
                variant="ghost"
                w={{ base: "full", md: "auto" }}
              >
                {t("general.cancel")}
              </Button>
            </HStack>
          </>
        ) : (
          <HStack
            spacing={3}
            flexDirection={{ base: "column", md: "row" }}
            align="stretch"
            w={{ base: "full", md: "auto" }}
            ml={{ md: "auto" }}
          >
            <Button
              onClick={onClose}
              variant="ghost"
              w={{ base: "full", md: "auto" }}
            >
              {t("general.cancel")}
            </Button>
          </HStack>
        )}
      </FooterComponent>
    </FrameComponent>
  );

  if (isPageMode) {
    return content;
  }

  return (
    <Modal
      isOpen={isEditingCrypto}
      onClose={onClose}
      size="full"
      scrollBehavior="inside"
      motionPreset="slideInBottom"
    >
      <ModalOverlay bg="blackAlpha.300" backdropFilter="blur(10px)" />
      {content}
    </Modal>
  );
}
