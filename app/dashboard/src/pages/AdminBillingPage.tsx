import {
  Badge,
  Box,
  Button,
  Divider,
  HStack,
  Input,
  Spinner,
  Stack,
  Text,
  VStack,
  useToast,
} from "@chakra-ui/react";
import {
  BanknotesIcon,
  CheckCircleIcon,
  ReceiptPercentIcon,
} from "@heroicons/react/24/outline";
import { chakra } from "@chakra-ui/react";
import useGetUser from "hooks/useGetUser";
import { useFeatures } from "hooks/useFeatures";
import { FC, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";
import { fetch } from "service/http";

const BillingIcon = chakra(BanknotesIcon, { baseStyle: { w: 5, h: 5 } });
const ReceiptIcon = chakra(ReceiptPercentIcon, { baseStyle: { w: 5, h: 5 } });
const PaidIcon = chakra(CheckCircleIcon, { baseStyle: { w: 4, h: 4 } });

type AdminBillingEntry = {
  id: number;
  created_at: string;
  event_type: string;
  event_label: string;
  action: string;
  target_username?: string | null;
  amount_cents: number;
  amount_display: string;
};

type AdminBillingInvoice = {
  id?: number | null;
  status: string;
  opened_at?: string | null;
  closed_at?: string | null;
  closed_by_username?: string | null;
  total_cents: number;
  total_display: string;
  item_count: number;
  items: AdminBillingEntry[];
};

type AdminBillingDetail = {
  admin_username: string;
  can_manage: boolean;
  unit_price_cents?: number | null;
  unit_price_display?: string | null;
  current_invoice: AdminBillingInvoice;
  history: AdminBillingInvoice[];
};

type AdminBillingAdminSummary = {
  username: string;
  is_sudo: boolean;
  is_disabled: boolean;
  unit_price_cents?: number | null;
  unit_price_display?: string | null;
  current_total_cents: number;
  current_total_display: string;
  current_item_count: number;
};

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
};

export const AdminBillingPage: FC = () => {
  const { t } = useTranslation();
  const toast = useToast();
  const { hasFeature, isLoading: featuresLoading } = useFeatures();
  const { userData, getUserIsPending, getUserIsSuccess } = useGetUser();
  const hasBillingFeature = hasFeature("admin_billing");

  const [admins, setAdmins] = useState<AdminBillingAdminSummary[]>([]);
  const [selectedUsername, setSelectedUsername] = useState("");
  const [detail, setDetail] = useState<AdminBillingDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [adminsLoading, setAdminsLoading] = useState(false);
  const [savingRate, setSavingRate] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [rateInput, setRateInput] = useState("");
  const initializedRef = useRef(false);
  const lastLoadedDetailRef = useRef("");

  const username = String(userData?.username || "").trim();
  const isManager = username.toLowerCase() === "moor";

  const syncRateInput = useCallback((payload: AdminBillingDetail | null) => {
    setRateInput(payload?.unit_price_display || "");
  }, []);

  const selectBestAdmin = useCallback(
    (items: AdminBillingAdminSummary[], current?: string) => {
      if (!items.length) return "";
      if (current && items.some((item) => item.username === current)) {
        return current;
      }
      const withDue = items.find((item) => item.current_total_cents > 0);
      if (withDue) return withDue.username;
      const firstNonMain = items.find((item) => item.username.toLowerCase() !== "moor");
      return firstNonMain?.username || items[0].username;
    },
    []
  );

  const loadAdmins = useCallback(async () => {
    if (!isManager) return [];
    setAdminsLoading(true);
    try {
      const data = await fetch<AdminBillingAdminSummary[]>("/admin-billing/admins");
      setAdmins(data || []);
      const nextSelected = selectBestAdmin(data || [], selectedUsername);
      setSelectedUsername((current) => (current === nextSelected ? current : nextSelected));
      return data || [];
    } catch (error: any) {
      toast({
        title: t("adminBilling.loadAdminsError"),
        description: String(error?.response?._data?.detail || error?.message || error || ""),
        status: "error",
        duration: 3000,
        isClosable: true,
      });
      return [];
    } finally {
      setAdminsLoading(false);
    }
  }, [isManager, selectedUsername, selectBestAdmin, t, toast]);

  const loadDetail = useCallback(
    async (targetUsername?: string) => {
      setLoading(true);
      try {
        const endpoint =
          isManager && targetUsername
            ? `/admin-billing/${encodeURIComponent(targetUsername)}`
            : "/admin-billing/me";
        const data = await fetch<AdminBillingDetail>(endpoint);
        setDetail(data);
        syncRateInput(data);
      } catch (error: any) {
        toast({
          title: t("adminBilling.loadDetailError"),
          description: String(error?.response?._data?.detail || error?.message || error || ""),
          status: "error",
          duration: 3000,
          isClosable: true,
        });
      } finally {
        setLoading(false);
      }
    },
    [isManager, syncRateInput, t, toast]
  );

  const isReady =
    !featuresLoading && !getUserIsPending && getUserIsSuccess && hasBillingFeature;

  useEffect(() => {
    if (!isReady) {
      initializedRef.current = false;
      lastLoadedDetailRef.current = "";
      return;
    }

    if (initializedRef.current) {
      return;
    }
    initializedRef.current = true;

    if (isManager) {
      void loadAdmins();
      return;
    }
    void loadDetail();
  }, [
    isReady,
    isManager,
    loadAdmins,
    loadDetail,
  ]);

  useEffect(() => {
    if (!isReady || !isManager || !selectedUsername) {
      return;
    }
    if (lastLoadedDetailRef.current === selectedUsername) {
      return;
    }
    lastLoadedDetailRef.current = selectedUsername;
    void loadDetail(selectedUsername);
  }, [isReady, isManager, selectedUsername, loadDetail]);

  const refreshAll = useCallback(async () => {
    lastLoadedDetailRef.current = "";
    if (isManager) {
      const data = await loadAdmins();
      const nextTarget = selectBestAdmin(data || admins, selectedUsername);
      if (nextTarget) {
        await loadDetail(nextTarget);
      }
      return;
    }
    await loadDetail();
  }, [admins, isManager, loadAdmins, loadDetail, selectBestAdmin, selectedUsername]);

  const saveRate = async (nextValue?: string) => {
    const targetUsername = detail?.admin_username;
    if (!isManager || !targetUsername) return;

    const raw = String(nextValue ?? rateInput).trim();
    const payload =
      raw === ""
        ? { unit_price: null }
        : { unit_price: Number(raw) };
    if (raw !== "" && !Number.isFinite(payload.unit_price as number)) {
      toast({
        title: t("adminBilling.invalidPrice"),
        status: "warning",
        duration: 2500,
        isClosable: true,
      });
      return;
    }

    setSavingRate(true);
    try {
      const data = await fetch<AdminBillingDetail>(
        `/admin-billing/${encodeURIComponent(targetUsername)}/rate`,
        {
          method: "PUT",
          body: payload,
        }
      );
      setDetail(data);
      syncRateInput(data);
      await loadAdmins();
      toast({
        title: t("adminBilling.priceSaved"),
        status: "success",
        duration: 2200,
        isClosable: true,
      });
    } catch (error: any) {
      toast({
        title: t("adminBilling.savePriceError"),
        description: String(error?.response?._data?.detail || error?.message || error || ""),
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setSavingRate(false);
    }
  };

  const markPaid = async () => {
    const targetUsername = detail?.admin_username;
    if (!isManager || !targetUsername || !detail?.current_invoice?.total_cents) return;

    setMarkingPaid(true);
    try {
      const data = await fetch<AdminBillingDetail>(
        `/admin-billing/${encodeURIComponent(targetUsername)}/mark-paid`,
        {
          method: "POST",
        }
      );
      setDetail(data);
      syncRateInput(data);
      await loadAdmins();
      toast({
        title: t("adminBilling.markPaidSuccess"),
        status: "success",
        duration: 2200,
        isClosable: true,
      });
    } catch (error: any) {
      toast({
        title: t("adminBilling.markPaidError"),
        description: String(error?.response?._data?.detail || error?.message || error || ""),
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setMarkingPaid(false);
    }
  };

  const currentInvoice = detail?.current_invoice;
  const history = detail?.history || [];
  const hasPrice = detail?.unit_price_cents !== null && detail?.unit_price_cents !== undefined;

  const receiptTitle = useMemo(
    () =>
      detail?.admin_username
        ? t("adminBilling.receiptTitle", { admin: detail.admin_username })
        : t("adminBilling.receiptTitleEmpty"),
    [detail?.admin_username, t]
  );

  if (!featuresLoading && !hasBillingFeature) {
    return <Navigate to="/" replace />;
  }

  if (!getUserIsPending && !getUserIsSuccess) {
    return <Navigate to="/login/" replace />;
  }

  return (
    <Box className="glass-card" p={{ base: 4, lg: 5 }} borderRadius="22px">
      <Stack
        direction={{ base: "column", lg: "row" }}
        align={{ base: "flex-start", lg: "center" }}
        justify="space-between"
        gap={3}
        mb={5}
      >
        <Box>
          <HStack spacing={3} mb={1}>
            <Box
              display="inline-flex"
              alignItems="center"
              justifyContent="center"
              w="42px"
              h="42px"
              borderRadius="14px"
              bg="var(--surface-soft)"
              border="1px solid var(--border)"
            >
              <BillingIcon />
            </Box>
            <Box>
              <Text fontSize="xl" fontWeight="700">
                {t("adminBilling.title")}
              </Text>
              <Text color="var(--muted)" fontSize="sm">
                {isManager
                  ? t("adminBilling.managerSubtitle")
                  : t("adminBilling.adminSubtitle")}
              </Text>
            </Box>
          </HStack>
        </Box>

        <HStack spacing={2}>
          <Badge
            px={3}
            py={1.5}
            borderRadius="full"
            bg="var(--surface-soft)"
            color="var(--text)"
            border="1px solid var(--border)"
          >
            {t("adminBilling.currentDueBadge", {
              amount: currentInvoice?.total_display || "0.00",
            })}
          </Badge>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void refreshAll()}
            isLoading={loading || adminsLoading}
          >
            {t("adminBilling.refresh")}
          </Button>
        </HStack>
      </Stack>

      <Box
        display="grid"
        gridTemplateColumns={{
          base: "1fr",
          xl: isManager ? "320px minmax(0, 1fr)" : "1fr",
        }}
        gap={4}
        alignItems="start"
      >
        {isManager ? (
          <Box
            border="1px solid var(--border)"
            borderRadius="18px"
            bg="var(--surface-soft)"
            p={3}
            maxH={{ base: "none", xl: "calc(100vh - 260px)" }}
            overflowY="auto"
          >
            <Text fontSize="sm" fontWeight="700" mb={3}>
              {t("adminBilling.adminsList")}
            </Text>

            {adminsLoading ? (
              <HStack py={8} justify="center">
                <Spinner size="sm" />
              </HStack>
            ) : !admins.length ? (
              <Text fontSize="sm" color="var(--muted)">
                -
              </Text>
            ) : (
              <VStack align="stretch" spacing={2}>
                {admins.map((item) => {
                  const active = item.username === selectedUsername;
                  return (
                    <Button
                      key={item.username}
                      variant="ghost"
                      justifyContent="space-between"
                      alignItems="flex-start"
                      h="auto"
                      px={3}
                      py={3}
                      borderRadius="16px"
                      border="1px solid"
                      borderColor={active ? "primary.300" : "var(--border)"}
                      bg={active ? "rgba(59, 130, 246, 0.14)" : "transparent"}
                      onClick={() => setSelectedUsername(item.username)}
                    >
                      <Box minW={0} textAlign="left">
                        <HStack spacing={2} mb={1}>
                          <Text fontWeight="700" noOfLines={1}>
                            {item.username}
                          </Text>
                          {item.is_sudo ? (
                            <Badge colorScheme="purple">sudo</Badge>
                          ) : (
                            <Badge>{t("adminBilling.adminBadge")}</Badge>
                          )}
                          {item.is_disabled ? (
                            <Badge colorScheme="red">
                              {t("adminBilling.disabledBadge")}
                            </Badge>
                          ) : null}
                        </HStack>
                        <Text fontSize="xs" color="var(--muted)" noOfLines={1}>
                          {t("adminBilling.priceLabelShort")}:{" "}
                          {item.unit_price_display || t("adminBilling.notSet")}
                        </Text>
                      </Box>
                      <VStack spacing={1} align="flex-end" pl={2}>
                        <Badge colorScheme={item.current_total_cents > 0 ? "orange" : "gray"}>
                          {item.current_total_display}
                        </Badge>
                        <Text fontSize="10px" color="var(--muted)">
                          {t("adminBilling.itemsCountShort", {
                            count: item.current_item_count,
                          })}
                        </Text>
                      </VStack>
                    </Button>
                  );
                })}
              </VStack>
            )}
          </Box>
        ) : null}

        <VStack align="stretch" spacing={4} minW={0}>
          {detail?.can_manage ? (
            <Box
              border="1px solid var(--border)"
              borderRadius="18px"
              bg="var(--surface-soft)"
              p={4}
            >
              <Text fontWeight="700" mb={1}>
                {t("adminBilling.priceTitle")}
              </Text>
              <Text fontSize="sm" color="var(--muted)" mb={4}>
                {t("adminBilling.priceSubtitle")}
              </Text>
              <Stack direction={{ base: "column", md: "row" }} gap={3}>
                <Input
                  value={rateInput}
                  onChange={(event) => setRateInput(event.target.value)}
                  placeholder={t("adminBilling.pricePlaceholder")}
                  maxW={{ base: "100%", md: "220px" }}
                />
                <Button
                  className="dashboard-accent-btn"
                  onClick={() => void saveRate()}
                  isLoading={savingRate}
                >
                  {t("adminBilling.savePrice")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void saveRate("")}
                  isLoading={savingRate}
                >
                  {t("adminBilling.clearPrice")}
                </Button>
                <Button
                  colorScheme="green"
                  variant="outline"
                  leftIcon={<PaidIcon />}
                  onClick={() => void markPaid()}
                  isLoading={markingPaid}
                  isDisabled={!currentInvoice?.total_cents}
                >
                  {t("adminBilling.markPaid")}
                </Button>
              </Stack>
            </Box>
          ) : null}

          <Box
            border="1px solid var(--border)"
            borderRadius="18px"
            bg="var(--surface-soft)"
            p={4}
            maxH={{ base: "320px", lg: "360px" }}
            overflowY="auto"
          >
            <HStack justify="space-between" align="center" mb={3}>
              <Text fontWeight="700">{t("adminBilling.historyTitle")}</Text>
              <Badge>{t("adminBilling.historyCount", { count: history.length })}</Badge>
            </HStack>

            {loading ? (
              <HStack py={8} justify="center">
                <Spinner size="sm" />
              </HStack>
            ) : history.length ? (
              <VStack align="stretch" spacing={3}>
                {history.map((invoice) => (
                  <Box
                    key={`history-${invoice.id}`}
                    border="1px dashed var(--border)"
                    borderRadius="16px"
                    bg="rgba(255,255,255,0.02)"
                    p={3}
                  >
                    <HStack justify="space-between" align="flex-start" mb={2}>
                      <Box>
                        <Text fontWeight="700" fontSize="sm">
                          {t("adminBilling.invoiceNumber", {
                            id: invoice.id || "-",
                          })}
                        </Text>
                        <Text fontSize="xs" color="var(--muted)">
                          {formatDate(invoice.opened_at)} - {formatDate(invoice.closed_at)}
                        </Text>
                      </Box>
                      <Badge colorScheme="green">{invoice.total_display}</Badge>
                    </HStack>
                    <VStack align="stretch" spacing={2}>
                      {invoice.items.map((item) => (
                        <HStack key={item.id} justify="space-between" align="flex-start">
                          <Box minW={0}>
                            <Text fontSize="sm" fontWeight="600" noOfLines={1}>
                              {item.event_label}
                            </Text>
                            <Text fontSize="xs" color="var(--muted)" noOfLines={1}>
                              {item.target_username || "-"} · {formatDate(item.created_at)}
                            </Text>
                          </Box>
                          <Text fontSize="sm" fontWeight="700" pl={3}>
                            {item.amount_display}
                          </Text>
                        </HStack>
                      ))}
                    </VStack>
                  </Box>
                ))}
              </VStack>
            ) : (
              <Text color="var(--muted)" fontSize="sm">
                {t("adminBilling.noHistory")}
              </Text>
            )}
          </Box>

          <Box
            border="1px dashed var(--border)"
            borderRadius="20px"
            bg="rgba(255,255,255,0.02)"
            p={{ base: 4, lg: 5 }}
            maxH={{ base: "420px", lg: "500px" }}
            overflowY="auto"
          >
            <HStack justify="space-between" align="center" mb={4}>
              <HStack spacing={3}>
                <Box
                  display="inline-flex"
                  alignItems="center"
                  justifyContent="center"
                  w="40px"
                  h="40px"
                  borderRadius="14px"
                  bg="var(--surface-soft)"
                  border="1px solid var(--border)"
                >
                  <ReceiptIcon />
                </Box>
                <Box>
                  <Text fontWeight="800">{receiptTitle}</Text>
                  <Text fontSize="sm" color="var(--muted)">
                    {hasPrice
                      ? t("adminBilling.priceConfigured", {
                          amount: detail?.unit_price_display || "0.00",
                        })
                      : t("adminBilling.priceMissing")}
                  </Text>
                </Box>
              </HStack>
              <Badge colorScheme={currentInvoice?.total_cents ? "orange" : "gray"}>
                {currentInvoice?.total_display || "0.00"}
              </Badge>
            </HStack>

            <VStack align="stretch" spacing={3} fontFamily="mono" fontSize="sm">
              <HStack justify="space-between">
                <Text color="var(--muted)">{t("adminBilling.receiptAdmin")}</Text>
                <Text>{detail?.admin_username || "-"}</Text>
              </HStack>
              <HStack justify="space-between">
                <Text color="var(--muted)">{t("adminBilling.receiptStatus")}</Text>
                <Text>{currentInvoice?.status || "open"}</Text>
              </HStack>
              <HStack justify="space-between">
                <Text color="var(--muted)">{t("adminBilling.receiptOpened")}</Text>
                <Text>{formatDate(currentInvoice?.opened_at)}</Text>
              </HStack>
              <HStack justify="space-between">
                <Text color="var(--muted)">{t("adminBilling.receiptItems")}</Text>
                <Text>{currentInvoice?.item_count || 0}</Text>
              </HStack>
              <Divider borderColor="var(--border)" />

              {currentInvoice?.items?.length ? (
                <VStack align="stretch" spacing={3}>
                  {currentInvoice.items.map((item) => (
                    <Box key={item.id}>
                      <HStack justify="space-between" align="flex-start">
                        <Box minW={0}>
                          <Text fontWeight="700">{item.event_label}</Text>
                          <Text color="var(--muted)" fontSize="xs">
                            {item.target_username || "-"} · {formatDate(item.created_at)}
                          </Text>
                        </Box>
                        <Text fontWeight="700">{item.amount_display}</Text>
                      </HStack>
                    </Box>
                  ))}
                </VStack>
              ) : (
                <Text color="var(--muted)">{t("adminBilling.noCurrentItems")}</Text>
              )}

              <Divider borderColor="var(--border)" />
              <HStack justify="space-between" fontWeight="800">
                <Text>{t("adminBilling.receiptTotal")}</Text>
                <Text>{currentInvoice?.total_display || "0.00"}</Text>
              </HStack>
            </VStack>
          </Box>
        </VStack>
      </Box>
    </Box>
  );
};

export default AdminBillingPage;
