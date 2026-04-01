import {
  Alert,
  AlertIcon,
  Box,
  Button,
  Collapse,
  Flex,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  Grid,
  GridItem,
  HStack,
  IconButton,
  Input as ChakraInput,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  Spinner,
  Switch,
  Text,
  Textarea,
  Tooltip,
  VStack,
  chakra,
  useColorMode,
  useToast,
} from "@chakra-ui/react";
import {
  ChartPieIcon,
  PencilIcon,
  UserPlusIcon,
} from "@heroicons/react/24/outline";
import { zodResolver } from "@hookform/resolvers/zod";
import { resetStrategy } from "constants/UserSettings";
import { FilterUsageType, useDashboard } from "contexts/DashboardContext";
import dayjs, { ManipulateType } from "dayjs";
import React, { FC, Suspense, lazy, useEffect, useState, useRef } from "react";
import ReactDatePicker from "react-datepicker";
import { Controller, FormProvider, useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { fetch } from "service/http";
import { useFeatures } from "hooks/useFeatures";
import {
  ProxyKeys,
  ProxyType,
  User,
  UserCreate,
  UserInbounds,
} from "types/User";
import { relativeExpiryDate } from "utils/dateFormatter";
import { registerDatePickerLocales } from "utils/datePickerLocales";
import { z } from "zod";
import { useNavigate } from "react-router-dom";
import { DeleteIcon } from "./DeleteUserModal";
import { Icon } from "./Icon";
import { Input } from "./Input";
import { RadioGroup } from "./RadioGroup";
import { ReloadIcon } from "./Filters";
import classNames from "classnames";
import { createUsageConfig } from "utils/usageChart";

registerDatePickerLocales();

const UserUsageSection = lazy(() =>
  import("./UserUsageSection").then((module) => ({
    default: module.UserUsageSection,
  }))
);

const AddUserIcon = chakra(UserPlusIcon, {
  baseStyle: {
    w: 5,
    h: 5,
  },
});

const EditUserIcon = chakra(PencilIcon, {
  baseStyle: {
    w: 5,
    h: 5,
  },
});

const UserUsageIcon = chakra(ChartPieIcon, {
  baseStyle: {
    w: 5,
    h: 5,
  },
});

export type UserDialogProps = {
  mode?: "modal" | "page";
};

export type FormType = Pick<UserCreate, keyof UserCreate> & {
  selected_proxies: ProxyKeys;
  unique_ip_limit: string;
  device_limit: string;
  v2box_hwid: string;
  happ_hwid: string;
};

type UserDeviceItem = {
  fingerprint: string;
  status: "allowed" | "banned";
  brand?: string;
  model?: string;
  os?: string;
  device_type?: string;
  first_seen_at?: string;
  last_seen_at?: string;
};

type UserDialogCapabilityCache = {
  ipLimitMax: number;
  deviceLimitMax: number;
  deviceAllowUnlimited: boolean;
  expiresAt: number;
};

const USER_DIALOG_CAPABILITY_TTL_MS = 60_000;
let userDialogCapabilityCache: UserDialogCapabilityCache | null = null;

const getUserDialogCapabilityCache = () => {
  if (!userDialogCapabilityCache) return null;
  if (userDialogCapabilityCache.expiresAt < Date.now()) {
    userDialogCapabilityCache = null;
    return null;
  }
  return userDialogCapabilityCache;
};

const setUserDialogCapabilityCache = (
  value: Omit<UserDialogCapabilityCache, "expiresAt">
) => {
  userDialogCapabilityCache = {
    ...value,
    expiresAt: Date.now() + USER_DIALOG_CAPABILITY_TTL_MS,
  };
  return userDialogCapabilityCache;
};

const formatUser = (user: User): FormType => {
  return {
    ...user,
    data_limit: user.data_limit
      ? Number((user.data_limit / 1073741824).toFixed(5))
      : user.data_limit,
    on_hold_expire_duration: user.on_hold_expire_duration
      ? Number(user.on_hold_expire_duration / (24 * 60 * 60))
      : user.on_hold_expire_duration,
    selected_proxies: Object.keys(user.proxies) as ProxyKeys,
    unique_ip_limit: "",
    device_limit: "",
    v2box_hwid: "",
    happ_hwid: "",
  };
};
const getDefaultValues = (): FormType => {
  const defaultInbounds = Object.fromEntries(useDashboard.getState().inbounds);
  const inbounds: UserInbounds = {};
  for (const key in defaultInbounds) {
    inbounds[key] = defaultInbounds[key].map((i) => i.tag);
  }
  return {
    selected_proxies: Object.keys(defaultInbounds) as ProxyKeys,
    data_limit: null,
    expire: null,
    username: "",
    data_limit_reset_strategy: "no_reset",
    status: "active",
    on_hold_expire_duration: null,
    note: "",
    unique_ip_limit: "",
    device_limit: "",
    v2box_hwid: "",
    happ_hwid: "",
    inbounds,
    proxies: {
      vless: { id: "", flow: "" },
      vmess: { id: "" },
      trojan: { password: "" },
      shadowsocks: { password: "", method: "chacha20-ietf-poly1305" },
    },
  };
};

const mergeProxies = (
  proxyKeys: ProxyKeys,
  proxyType: ProxyType | undefined
): ProxyType => {
  const proxies: ProxyType = proxyKeys.reduce(
    (ac, a) => ({ ...ac, [a]: {} }),
    {}
  );
  if (!proxyType) return proxies;
  proxyKeys.forEach((proxy) => {
    if (proxyType[proxy]) {
      proxies[proxy] = proxyType[proxy];
    }
  });
  return proxies;
};

const buildUsageQueryFromFilter = (filter: string): FilterUsageType => {
  const fallback = {
    start: dayjs().utc().subtract(30, "day").format("YYYY-MM-DDTHH:00:00"),
  };

  if (!filter || filter === "custom") {
    return fallback;
  }

  const amount = Number(filter.slice(0, -1));
  const unitCode = filter.slice(-1);
  const units: Record<string, ManipulateType> = {
    h: "hour",
    d: "day",
    w: "week",
    m: "month",
    y: "year",
  };
  const unit = units[unitCode];

  if (!unit || !Number.isFinite(amount) || amount <= 0) {
    return fallback;
  }

  return {
    start: dayjs()
      .utc()
      .subtract(amount, unit)
      .format("YYYY-MM-DDTHH:00:00"),
  };
};

const baseSchema = {
  username: z.string().min(1, { message: "Required" }),
  selected_proxies: z.array(z.string()).refine((value) => value.length > 0, {
    message: "userDialog.selectOneProtocol",
  }),
  note: z.string().nullable(),
  unique_ip_limit: z.string().default(""),
  device_limit: z.string().default(""),
  v2box_hwid: z.string().default(""),
  happ_hwid: z.string().default(""),
  proxies: z
    .record(z.string(), z.record(z.string(), z.any()))
    .transform((ins) => {
      const deleteIfEmpty = (obj: any, key: string) => {
        if (obj && obj[key] === "") {
          delete obj[key];
        }
      };
      deleteIfEmpty(ins.vmess, "id");
      deleteIfEmpty(ins.vless, "id");
      deleteIfEmpty(ins.trojan, "password");
      deleteIfEmpty(ins.shadowsocks, "password");
      deleteIfEmpty(ins.shadowsocks, "method");
      return ins;
    }),
  data_limit: z
    .string()
    .min(0)
    .or(z.number())
    .nullable()
    .transform((str) => {
      if (str) return Number((parseFloat(String(str)) * 1073741824).toFixed(5));
      return 0;
    }),
  expire: z.number().nullable(),
  data_limit_reset_strategy: z.string(),
  inbounds: z.record(z.string(), z.array(z.string())).transform((ins) => {
    Object.keys(ins).forEach((protocol) => {
      if (Array.isArray(ins[protocol]) && !ins[protocol]?.length)
        delete ins[protocol];
    });
    return ins;
  }),
};

const schema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("active"),
    ...baseSchema,
  }),
  z.object({
    status: z.literal("disabled"),
    ...baseSchema,
  }),
  z.object({
    status: z.literal("limited"),
    ...baseSchema,
  }),
  z.object({
    status: z.literal("expired"),
    ...baseSchema,
  }),
  z.object({
    status: z.literal("on_hold"),
    on_hold_expire_duration: z.coerce
      .number()
      .min(0.1, "Required")
      .transform((d) => {
        return d * (24 * 60 * 60);
      }),
    ...baseSchema,
  }),
]);

export const UserDialog: FC<UserDialogProps> = ({ mode = "modal" }) => {
  const {
    editingUser,
    isCreatingNewUser,
    onCreateUser,
    editUser,
    fetchUserUsage,
    onEditingUser,
    createUser,
    onDeletingUser,
    refetchUsers,
  } = useDashboard();
  const navigate = useNavigate();
  const isPageMode = mode === "page";
  const isEditing = !!editingUser;
  const isOpen = isPageMode || isCreatingNewUser || isEditing;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>("");
  const toast = useToast();
  const { t, i18n } = useTranslation();
  const { hasFeature } = useFeatures();
  const canUseIpLimit = hasFeature("ip_limits");
  const canUseDeviceLimit = hasFeature("device_limit");
  const canUseV2box = hasFeature("v2box_id");
  const canUseHapp = hasFeature("happ_crypto");

  const { colorMode } = useColorMode();

  const [usageVisible, setUsageVisible] = useState(false);
  const [ipLimitMax, setIpLimitMax] = useState<number>(3);
  const [deviceLimitMax, setDeviceLimitMax] = useState<number>(1);
  const [deviceAllowUnlimited, setDeviceAllowUnlimited] = useState<boolean>(false);
  const [canEditDeviceLimit, setCanEditDeviceLimit] = useState<boolean>(false);
  const [devices, setDevices] = useState<UserDeviceItem[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [deviceActionFingerprint, setDeviceActionFingerprint] = useState<string | null>(null);
  const [deviceResetLoading, setDeviceResetLoading] = useState(false);
  const handleUsageToggle = () => {
    setUsageVisible((current) => !current);
  };

  const formatDeviceDate = (value?: string) => {
    if (!value) return "-";
    const parsed = dayjs(value);
    return parsed.isValid() ? parsed.format("YYYY-MM-DD HH:mm") : "-";
  };

  const deviceTypeLabel = (deviceType?: string) => {
    switch ((deviceType || "").toLowerCase()) {
      case "phone":
        return t("userDialog.deviceTypePhone");
      case "tablet":
        return t("userDialog.deviceTypeTablet");
      case "desktop":
        return t("userDialog.deviceTypeDesktop");
      default:
        return t("userDialog.deviceTypeOther");
    }
  };

  const refreshDevices = async (username: string) => {
    if (!canUseDeviceLimit) {
      setDevices([]);
      return;
    }
    const safeUsername = (username || "").trim();
    if (!safeUsername) {
      setDevices([]);
      return;
    }
    setDevicesLoading(true);
    try {
      const resp: any = await fetch(`/flew/devices/${encodeURIComponent(safeUsername)}`);
      setDevices(Array.isArray(resp?.devices) ? resp.devices : []);
    } catch {
      setDevices([]);
    } finally {
      setDevicesLoading(false);
    }
  };

  const updateDeviceStatus = async (fingerprint: string, nextStatus: "ban" | "unban") => {
    if (!canUseDeviceLimit) return;
    const username = (editingUser?.username || form.getValues("username") || "").trim();
    if (!username || !fingerprint) return;

    setDeviceActionFingerprint(fingerprint);
    try {
      await fetch(`/flew/devices/${encodeURIComponent(username)}/${nextStatus}`, {
        method: "POST",
        body: { fingerprint },
      });
      await refreshDevices(username);
      toast({
        title: t(
          nextStatus === "ban"
            ? "userDialog.deviceBanDone"
            : "userDialog.deviceUnbanDone"
        ),
        status: "success",
        isClosable: true,
        position: "top",
        duration: 2500,
      });
    } catch {
      toast({
        title: t(
          nextStatus === "ban"
            ? "userDialog.deviceBanFailed"
            : "userDialog.deviceUnbanFailed"
        ),
        status: "warning",
        isClosable: true,
        position: "top",
        duration: 2500,
      });
    } finally {
      setDeviceActionFingerprint(null);
    }
  };

  const resetDevices = async () => {
    if (!canUseDeviceLimit) return;
    const username = (editingUser?.username || form.getValues("username") || "").trim();
    if (!username) return;

    setDeviceResetLoading(true);
    try {
      await fetch(`/flew/devices/${encodeURIComponent(username)}/reset`, {
        method: "POST",
        body: {},
      });
      await refreshDevices(username);
      toast({
        title: t("userDialog.deviceResetDone"),
        status: "success",
        isClosable: true,
        position: "top",
        duration: 2500,
      });
    } catch {
      toast({
        title: t("userDialog.deviceResetFailed"),
        status: "warning",
        isClosable: true,
        position: "top",
        duration: 2500,
      });
    } finally {
      setDeviceResetLoading(false);
    }
  };

  const form = useForm<FormType>({
    defaultValues: getDefaultValues(),
    resolver: zodResolver(schema),
  });

  useEffect(
    () =>
      useDashboard.subscribe(
        (state) => state.inbounds,
        () => {
          form.reset(getDefaultValues());
        }
      ),
    []
  );

  const [dataLimit, userStatus] = useWatch({
    control: form.control,
    name: ["data_limit", "status"],
  });

  const usageTitle = t("userDialog.total");
  const [usage, setUsage] = useState(createUsageConfig(colorMode, usageTitle));
  const [usageFilter, setUsageFilter] = useState("1m");
  const applyDialogCapabilities = ({
    ipLimitMax: nextIpLimitMax,
    deviceLimitMax: nextDeviceLimitMax,
    deviceAllowUnlimited: nextDeviceAllowUnlimited,
  }: Omit<UserDialogCapabilityCache, "expiresAt">) => {
    if (canUseIpLimit) {
      setIpLimitMax(nextIpLimitMax);
    } else {
      setIpLimitMax(3);
    }

    if (canUseDeviceLimit) {
      setDeviceLimitMax(Math.max(1, nextDeviceLimitMax));
      setDeviceAllowUnlimited(nextDeviceAllowUnlimited);
      setCanEditDeviceLimit(true);
    } else {
      setDeviceLimitMax(1);
      setDeviceAllowUnlimited(false);
      setCanEditDeviceLimit(false);
      form.setValue("device_limit", "");
    }
  };

  const fetchUsageWithFilter = (query: FilterUsageType) => {
    fetchUserUsage(editingUser!, query).then((data: any) => {
      const labels = [];
      const series = [];
      for (const key in data.usages) {
        series.push(data.usages[key].used_traffic);
        labels.push(data.usages[key].node_name);
      }
      setUsage(createUsageConfig(colorMode, usageTitle, series, labels));
    });
  };

  useEffect(() => {
    if (!isOpen) return;

    const cachedCapabilities = getUserDialogCapabilityCache();
    if (cachedCapabilities) {
      applyDialogCapabilities(cachedCapabilities);
      return;
    }

    const ipCapRequest = canUseIpLimit
      ? fetch("/flew/ip-limit-cap")
      : Promise.resolve(null);
    const deviceCapRequest = canUseDeviceLimit
      ? fetch("/flew/device-limit-cap")
      : Promise.resolve(null);

    Promise.allSettled([ipCapRequest, deviceCapRequest])
      .then((results) => {
        const ipCapResp: any =
          results[0].status === "fulfilled" ? (results[0] as PromiseFulfilledResult<any>).value : null;
        const deviceCapResp: any =
          results[1].status === "fulfilled" ? (results[1] as PromiseFulfilledResult<any>).value : null;
        const resolvedCapabilities = setUserDialogCapabilityCache({
          ipLimitMax: Math.max(1, Number(ipCapResp?.max_limit || 3)),
          deviceLimitMax: Math.max(1, Number(deviceCapResp?.max_limit || 1)),
          deviceAllowUnlimited: !!deviceCapResp?.allow_unlimited,
        });

        applyDialogCapabilities(resolvedCapabilities);
      })
      .catch(() => {
        applyDialogCapabilities({
          ipLimitMax: 3,
          deviceLimitMax: 1,
          deviceAllowUnlimited: false,
        });
      });
  }, [isOpen, isEditing, canUseIpLimit, canUseDeviceLimit]);

  useEffect(() => {
    if (!editingUser) {
      form.reset(getDefaultValues());
      setDevices([]);
      setUsageVisible(false);
      return;
    }

    let deviceRefreshTimer: number | null = null;

    form.reset(formatUser(editingUser));

    // Load per-user unique IP limit (2h window) for non-Happ clients.
    if (canUseIpLimit) {
      fetch(`/flew/ip-limit/${encodeURIComponent(editingUser.username)}`)
        .then((resp: any) => {
          const maxLimit = Number(resp?.max_limit || 3);
          const disabled = !!resp?.disabled;
          const hasOverride = !!resp?.has_override;
          const limit = Number(resp?.limit ?? 0);
          setIpLimitMax(maxLimit);
          if (disabled || !hasOverride || !Number.isFinite(limit) || limit <= 0) {
            form.setValue("unique_ip_limit", "");
          } else {
            const safeLimit = Math.min(Math.max(1, limit), maxLimit);
            form.setValue("unique_ip_limit", String(safeLimit));
          }
        })
        .catch(() => {
          setIpLimitMax(3);
          form.setValue("unique_ip_limit", "");
        });
    } else {
      setIpLimitMax(3);
      form.setValue("unique_ip_limit", "");
    }

    if (canUseDeviceLimit) {
      fetch(`/flew/device-limit/${encodeURIComponent(editingUser.username)}`)
        .then((resp: any) => {
          const maxLimit = Number(resp?.max_limit || 1);
          const safeMax = Math.max(1, maxLimit);
          const allowUnlimited = !!resp?.allow_unlimited;
          const unlimited = !!resp?.unlimited;
          const hasOverride = !!resp?.has_override;
          const limit = Number(resp?.limit ?? 0);

          setDeviceLimitMax(safeMax);
          setDeviceAllowUnlimited(allowUnlimited);
          if (allowUnlimited && unlimited) {
            form.setValue("device_limit", "");
          } else if (!hasOverride || !Number.isFinite(limit) || limit <= 0) {
            form.setValue("device_limit", "");
          } else {
            const safeLimit = Math.min(Math.max(1, limit), safeMax);
            form.setValue("device_limit", String(safeLimit));
          }
        })
        .catch(() => {
          setDeviceLimitMax(1);
          setDeviceAllowUnlimited(false);
          form.setValue("device_limit", "");
        });

      // Defer the device list request so the page becomes interactive first.
      deviceRefreshTimer = window.setTimeout(() => {
        refreshDevices(editingUser.username);
      }, 160);
    } else {
      setDeviceLimitMax(1);
      setDeviceAllowUnlimited(false);
      form.setValue("device_limit", "");
      setDevices([]);
    }

    // Load V2Box device ID lock setting.
    if (canUseV2box) {
      fetch(`/flew/v2box-hwid/${encodeURIComponent(editingUser.username)}`)
        .then((resp: any) => {
          form.setValue("v2box_hwid", resp?.device_id || "");
        })
        .catch(() => {
          form.setValue("v2box_hwid", "");
        });
    } else {
      form.setValue("v2box_hwid", "");
    }

    // Load Happ HWID setting.
    if (canUseHapp) {
      fetch(`/flew/hwid/${encodeURIComponent(editingUser.username)}`)
        .then((resp: any) => {
          form.setValue("happ_hwid", resp?.device_id || "");
        })
        .catch(() => {
          form.setValue("happ_hwid", "");
        });
    } else {
      form.setValue("happ_hwid", "");
    }

    setUsage(createUsageConfig(colorMode, usageTitle));

    return () => {
      if (deviceRefreshTimer !== null) {
        window.clearTimeout(deviceRefreshTimer);
      }
    };
  }, [editingUser, canUseIpLimit, canUseDeviceLimit, canUseV2box, canUseHapp]);

  useEffect(() => {
    if (!editingUser || !usageVisible) {
      return;
    }

    fetchUsageWithFilter(buildUsageQueryFromFilter(usageFilter));
  }, [editingUser?.username, usageVisible]);

  const isSubmitting = useRef(false);

  const submit = (values: FormType) => {
    if (isSubmitting.current) return;
    isSubmitting.current = true;
    setLoading(true);
    const methods = { edited: editUser, created: createUser };
    const method = isEditing ? "edited" : "created";
    setError(null);
    const dirtyFields = form.formState.dirtyFields;

    const {
      selected_proxies,
      unique_ip_limit,
      device_limit,
      v2box_hwid,
      happ_hwid,
      ...rest
    } = values;

    let body: UserCreate = {
      ...rest,
      data_limit: values.data_limit,
      proxies: mergeProxies(selected_proxies, values.proxies),
      data_limit_reset_strategy:
        values.data_limit && values.data_limit > 0
          ? values.data_limit_reset_strategy
          : "no_reset",
      status:
        values.status === "active" ||
          values.status === "disabled" ||
          values.status === "on_hold"
          ? values.status
          : "active",
    };

    methods[method](body)
      .then(async () => {
        if (canUseIpLimit && dirtyFields.unique_ip_limit) {
          const limitRaw = String(
            form.getValues("unique_ip_limit") ?? unique_ip_limit ?? ""
          ).trim();
          let limitNum: number | null = null;
          if (limitRaw.length) {
            const parsed = Number(limitRaw);
            const normalized = Number.isFinite(parsed) ? Math.trunc(parsed) : 1;
            const maxLimit = Math.max(1, Number(ipLimitMax || 3));
            limitNum = Math.min(Math.max(1, normalized || 1), maxLimit);
          }
          try {
            await fetch("/flew/ip-limit", {
              method: "POST",
              body: { username: values.username, limit: limitNum },
            });
          } catch (e) {
            // Do not fail user save if this extra setting fails.
            toast({
              title: t("userDialog.uniqueIpLimitFailed"),
              status: "warning",
              isClosable: true,
              position: "top",
              duration: 3000,
            });
          }
        }

        if (canUseDeviceLimit && canEditDeviceLimit && dirtyFields.device_limit) {
          try {
            const limitRaw = String(form.getValues("device_limit") ?? device_limit ?? "").trim();
            const unlimited = deviceAllowUnlimited && limitRaw.length === 0;
            let parsedLimit: number | null = null;
            if (limitRaw.length && !unlimited) {
              const maxLimit = Math.max(1, Number(deviceLimitMax || 1));
              const parsed = Number(limitRaw);
              const normalized = Number.isFinite(parsed) ? Math.trunc(parsed) : 1;
              parsedLimit = Math.min(Math.max(1, normalized || 1), maxLimit);
            }

            const saved: any = await fetch("/flew/device-limit", {
              method: "POST",
              body: { username: values.username, limit: parsedLimit, unlimited },
            });

            // Keep UI in sync with server response immediately after save.
            const savedAllowUnlimited = !!saved?.allow_unlimited;
            const savedUnlimited = !!saved?.unlimited;
            const savedMax = Math.max(1, Number(saved?.max_limit || deviceLimitMax || 1));
            const savedHasOverride = !!saved?.has_override;
            const savedLimit = Math.max(1, Number(saved?.limit || parsedLimit || 1));

            setDeviceLimitMax(savedMax);
            setDeviceAllowUnlimited(savedAllowUnlimited);
            if ((savedAllowUnlimited && savedUnlimited) || !savedHasOverride) {
              form.setValue("device_limit", "");
            } else {
              form.setValue("device_limit", String(savedLimit));
            }
          } catch (e) {
            toast({
              title: t("userDialog.deviceLimitFailed"),
              status: "warning",
              isClosable: true,
              position: "top",
              duration: 3000,
            });
          }
        }

        // Apply V2Box device ID lock (ID-only mode).
        if (canUseV2box) {
          try {
            await fetch("/flew/v2box-hwid", {
              method: "POST",
              body: { username: values.username, device_id: (v2box_hwid || "").trim() || null },
            });
          } catch (e) {
            toast({
              title: t("userDialog.v2boxHwidLimitFailed"),
              status: "warning",
              isClosable: true,
              position: "top",
              duration: 3000,
            });
          }
        }

        // Apply Happ HWID lock (ID-only mode).
        if (canUseHapp) {
          try {
            await fetch("/flew/hwid", {
              method: "POST",
              body: { username: values.username, device_id: (happ_hwid || "").trim() || null },
            });
          } catch (e) {
            toast({
              title: t("userDialog.happHwidLimitFailed"),
              status: "warning",
              isClosable: true,
              position: "top",
              duration: 3000,
            });
          }
        }

        // refresh users list so copied subscription link includes latest v2box_hwid query
        refetchUsers();

        toast({
          title: t(
            isEditing ? "userDialog.userEdited" : "userDialog.userCreated",
            { username: values.username }
          ),
          status: "success",
          isClosable: true,
          position: "top",
          duration: 3000,
        });
        onClose();
      })
      .catch((err) => {
        if (err?.response?.status === 409 || err?.response?.status === 400)
          setError(err?.response?._data?.detail);
        if (err?.response?.status === 422) {
          Object.keys(err.response._data.detail).forEach((key) => {
            setError(err?.response._data.detail[key] as string);
            form.setError(
              key as "proxies" | "username" | "data_limit" | "expire",
              {
                type: "custom",
                message: err?.response._data.detail[key],
              }
            );
          });
        } else {
          setError(err?.response?._data?.detail || "Unknown error occurred");
        }
      })
      .finally(() => {
        isSubmitting.current = false;
        setLoading(false);
      });
  };

  const onClose = () => {
    form.reset(getDefaultValues());
    onCreateUser(false);
    onEditingUser(null);
    setError(null);
    setDevices([]);
    setDevicesLoading(false);
    setDeviceActionFingerprint(null);
    setDeviceLimitMax(1);
    setDeviceAllowUnlimited(false);
    setUsageVisible(false);
    setUsageFilter("1m");
    if (isPageMode) {
      navigate("/", { replace: true });
    }
  };

  const handleResetUsage = () => {
    useDashboard.setState({ resetUsageUser: editingUser });
  };

  const handleRevokeSubscription = () => {
    useDashboard.setState({ revokeSubscriptionUser: editingUser });
  };

  const disabled = loading;
  const isOnHold = userStatus === "on_hold";

  const [randomUsernameLoading, setrandomUsernameLoading] = useState(false);

  const createRandomUsername = (): string => {
    setrandomUsernameLoading(true);
    let result = "";
    const characters =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const charactersLength = characters.length;
    let counter = 0;
    while (counter < 6) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
      counter += 1;
    }
    return result;
  };

  const FrameComponent: any = isPageMode ? Box : ModalContent;
  const HeaderComponent: any = isPageMode ? Box : ModalHeader;
  const BodyComponent: any = isPageMode ? Box : ModalBody;
  const FooterComponent: any = isPageMode ? Box : ModalFooter;

  const dialogContent = (
    <FormProvider {...form}>
      <FrameComponent
        className={classNames("workspace-page-modal", {
          "workspace-route-page": isPageMode,
        })}
        mx={isPageMode ? 0 : { base: 0, lg: 3 }}
        my={isPageMode ? 0 : { base: 0, lg: 3 }}
        w={isPageMode ? "100%" : { base: "100vw", lg: "calc(100vw - 24px)" }}
        maxW={isPageMode ? "100%" : { base: "100vw", xl: "1360px" }}
        minH={isPageMode ? undefined : { base: "100vh", lg: "calc(100vh - 24px)" }}
        alignSelf={isPageMode ? undefined : "center"}
      >
        <form
          onSubmit={form.handleSubmit(submit)}
          className={classNames({ "workspace-route-page-form": isPageMode })}
        >
          <HeaderComponent
            pt={isPageMode ? undefined : 6}
            className={classNames({ "chakra-modal__header": isPageMode })}
          >
            <HStack gap={2}>
              <Icon color="primary">
                {isEditing ? (
                  <EditUserIcon color="white" />
                ) : (
                  <AddUserIcon color="white" />
                )}
              </Icon>
              <Text fontWeight="semibold" fontSize="lg">
                {isEditing
                  ? t("userDialog.editUserTitle")
                  : t("createNewUser")}
              </Text>
            </HStack>
          </HeaderComponent>
          {!isPageMode && <ModalCloseButton mt={3} disabled={disabled} />}
          <BodyComponent className={classNames({ "chakra-modal__body": isPageMode })}>
            <Grid
              templateColumns={{
                base: "repeat(1, 1fr)",
                md: "repeat(2, 1fr)",
              }}
              gap={3}
            >
                <GridItem>
                  <VStack justifyContent="space-between">
                    <Flex
                      flexDirection="column"
                      gridAutoRows="min-content"
                      w="full"
                    >
                      <Flex flexDirection="row" w="full" gap={2}>
                        <FormControl mb={"10px"}>
                          <FormLabel>{t("username")}</FormLabel>
                          <HStack align="stretch" spacing={2}>
                            <Input
                              size="sm"
                              type="text"
                              borderRadius="6px"
                              error={form.formState.errors.username?.message}
                              disabled={disabled || isEditing}
                              {...form.register("username")}
                            />
                            <Tooltip
                              label={
                                isEditing
                                  ? "Username cannot be changed for an existing user"
                                  : t("userDialog.randomUsername")
                              }
                              placement="top"
                            >
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                minW={{ base: "96px", sm: "112px" }}
                                px={4}
                                flexShrink={0}
                                isDisabled={disabled || isEditing}
                                isLoading={randomUsernameLoading}
                                leftIcon={
                                  randomUsernameLoading ? undefined : <ReloadIcon />
                                }
                                onClick={() => {
                                  const randomUsername = createRandomUsername();
                                  form.setValue("username", randomUsername);
                                  setTimeout(() => {
                                    setrandomUsernameLoading(false);
                                  }, 350);
                                }}
                              >
                                <Text display={{ base: "none", sm: "inline" }}>
                                  {t("userDialog.randomUsername")}
                                </Text>
                              </Button>
                            </Tooltip>
                            {isEditing && (
                              <HStack px={1}>
                                <Controller
                                  name="status"
                                  control={form.control}
                                  render={({ field }) => {
                                    return (
                                      <Tooltip
                                        placement="top"
                                        label={"status: " + t(`status.${field.value}`)}
                                        textTransform="capitalize"
                                      >
                                        <Box>
                                          <Switch
                                            colorScheme="primary"
                                            isChecked={field.value === "active"}
                                            onChange={(e) => {
                                              if (e.target.checked) {
                                                field.onChange("active");
                                              } else {
                                                field.onChange("disabled");
                                              }
                                            }}
                                          />
                                        </Box>
                                      </Tooltip>
                                    );
                                  }}
                                />
                              </HStack>
                            )}
                          </HStack>
                        </FormControl>
                        {!isEditing && (
                          <FormControl flex="1">
                            <FormLabel whiteSpace={"nowrap"}>
                              {t("userDialog.onHold")}
                            </FormLabel>
                            <Controller
                              name="status"
                              control={form.control}
                              render={({ field }) => {
                                const status = field.value;
                                return (
                                  <>
                                    {status ? (
                                      <Switch
                                        colorScheme="primary"
                                        isChecked={status === "on_hold"}
                                        onChange={(e) => {
                                          if (e.target.checked) {
                                            field.onChange("on_hold");
                                          } else {
                                            field.onChange("active");
                                          }
                                        }}
                                      />
                                    ) : (
                                      ""
                                    )}
                                  </>
                                );
                              }}
                            />
                          </FormControl>
                        )}
                      </Flex>
                      <FormControl mb={"10px"}>
                        <FormLabel>{t("userDialog.dataLimit")}</FormLabel>
                        <Controller
                          control={form.control}
                          name="data_limit"
                          render={({ field }) => {
                            return (
                              <Input
                                endAdornment="GB"
                                type="number"
                                size="sm"
                                borderRadius="6px"
                                onChange={field.onChange}
                                disabled={disabled}
                                error={
                                  form.formState.errors.data_limit?.message
                                }
                                value={field.value ? String(field.value) : ""}
                              />
                            );
                          }}
                        />
                      </FormControl>
                      <Collapse
                        in={!!(dataLimit && dataLimit > 0)}
                        animateOpacity
                        style={{ width: "100%" }}
                      >
                        <FormControl height="66px">
                          <FormLabel>
                            {t("userDialog.periodicUsageReset")}
                          </FormLabel>
                          <Controller
                            control={form.control}
                            name="data_limit_reset_strategy"
                            render={({ field }) => {
                              return (
                                <Select
                                  size="sm"
                                  {...field}
                                  disabled={disabled}
                                  bg={disabled ? "gray.100" : "transparent"}
                                  _dark={{
                                    bg: disabled ? "gray.600" : "transparent",
                                  }}
                                  sx={{
                                    option: {
                                      backgroundColor: colorMode === "dark" ? "#222C3B" : "white"
                                    }
                                  }}
                                >
                                  {resetStrategy.map((s) => {
                                    return (
                                      <option key={s.value} value={s.value}>
                                        {t(
                                          "userDialog.resetStrategy" + s.title
                                        )}
                                      </option>
                                    );
                                  })}
                                </Select>
                              );
                            }}
                          />
                        </FormControl>
                      </Collapse>

                      <FormControl mb={"10px"}>
                        <FormLabel>
                          {isOnHold
                            ? t("userDialog.onHoldExpireDuration")
                            : t("userDialog.expiryDate")}
                        </FormLabel>

                        {isOnHold && (
                          <Controller
                            control={form.control}
                            name="on_hold_expire_duration"
                            render={({ field }) => {
                              return (
                                <Input
                                  endAdornment="Days"
                                  type="number"
                                  size="sm"
                                  borderRadius="6px"
                                  onChange={(on_hold) => {
                                    form.setValue("expire", null);
                                    field.onChange({
                                      target: {
                                        value: on_hold,
                                      },
                                    });
                                  }}
                                  disabled={disabled}
                                  error={
                                    form.formState.errors
                                      .on_hold_expire_duration?.message
                                  }
                                  value={field.value ? String(field.value) : ""}
                                />
                              );
                            }}
                          />
                        )}
                        {!isOnHold && (
                          <Controller
                            name="expire"
                            control={form.control}
                            render={({ field }) => {
                              function createDateAsUTC(num: number) {
                                return dayjs(
                                  dayjs(num * 1000).utc()
                                  // .format("MMMM D, YYYY") // exception with: dayjs.locale(lng);
                                ).toDate();
                              }
                              const { status, time } = relativeExpiryDate(
                                field.value
                              );
                              return (
                                <>
                                  <ReactDatePicker
                                    calendarClassName="theme-date-picker"
                                    popperClassName="theme-date-picker-popper"
                                    wrapperClassName="theme-date-picker-wrapper"
                                    locale={i18n.language.toLocaleLowerCase()}
                                    dateFormat={t("dateFormat")}
                                    minDate={new Date()}
                                    selected={
                                      field.value
                                        ? createDateAsUTC(field.value)
                                        : undefined
                                    }
                                    onChange={(date: Date) => {
                                      form.setValue(
                                        "on_hold_expire_duration",
                                        null
                                      );
                                      field.onChange({
                                        target: {
                                          value: date
                                            ? dayjs(
                                              dayjs(date)
                                                .set("hour", 23)
                                                .set("minute", 59)
                                                .set("second", 59)
                                            )
                                              .utc()
                                              .valueOf() / 1000
                                            : 0,
                                          name: "expire",
                                        },
                                      });
                                    }}
                                    customInput={
                                      <Input
                                        className="theme-date-picker-input"
                                        size="sm"
                                        type="text"
                                        borderRadius="6px"
                                        clearable
                                        disabled={disabled}
                                        error={
                                          form.formState.errors.expire?.message
                                        }
                                      />
                                    }
                                  />
                                  {field.value ? (
                                    <FormHelperText>
                                      {t(status, { time: time })}
                                    </FormHelperText>
                                  ) : (
                                    ""
                                  )}
                                </>
                              );
                            }}
                          />
                        )}
                      </FormControl>

                      <FormControl
                        mb={"10px"}
                        isInvalid={!!form.formState.errors.note}
                      >
                        <FormLabel>{t("userDialog.note")}</FormLabel>
                        <Textarea {...form.register("note")} minH="70px" />
                        <FormErrorMessage>
                          {form.formState.errors?.note?.message}
                        </FormErrorMessage>
                      </FormControl>
                      {canUseIpLimit && (
                        <FormControl mb={"10px"}>
                          <FormLabel>{t("userDialog.uniqueIpLimit")}</FormLabel>
                          <ChakraInput
                            size="sm"
                            type="number"
                            min={1}
                            max={ipLimitMax}
                            step={1}
                            {...form.register("unique_ip_limit")}
                          />
                          <FormHelperText>
                            {t("userDialog.limitDisabledHint")}
                          </FormHelperText>
                        </FormControl>
                      )}
                      {canUseDeviceLimit && canEditDeviceLimit && (
                        <FormControl mb={"10px"}>
                          <FormLabel>{t("userDialog.deviceLimit")}</FormLabel>
                          <ChakraInput
                            size="sm"
                            type="number"
                            min={1}
                            max={deviceLimitMax}
                            step={1}
                            {...form.register("device_limit")}
                          />
                          <FormHelperText>
                            {t("userDialog.limitDisabledHint")}
                          </FormHelperText>
                        </FormControl>
                      )}
                      {canUseDeviceLimit && isEditing && (
                        <FormControl mb={"10px"}>
                          <FormLabel>
                            <Flex justifyContent="space-between" alignItems="center">
                              <Text>{t("userDialog.deviceList")}</Text>
                              <HStack gap={2}>
                                <Button
                                  size="xs"
                                  variant="outline"
                                  isLoading={deviceResetLoading}
                                  onClick={resetDevices}
                                >
                                  {t("userDialog.deviceReset")}
                                </Button>
                                <Button
                                  size="xs"
                                  variant="ghost"
                                  isLoading={devicesLoading}
                                  onClick={() =>
                                    refreshDevices(
                                      (editingUser?.username ||
                                        form.getValues("username") ||
                                        "").trim()
                                    )
                                  }
                                >
                                  {t("userDialog.deviceRefresh")}
                                </Button>
                              </HStack>
                            </Flex>
                          </FormLabel>
                          <VStack
                            align="stretch"
                            gap={2}
                            maxH="220px"
                            overflowY="auto"
                            borderWidth="1px"
                            borderRadius="8px"
                            p={2}
                          >
                            {!devices.length && (
                              <Text fontSize="sm" color="gray.500">
                                {t("userDialog.deviceListEmpty")}
                              </Text>
                            )}
                            {devices.map((item) => {
                              const isBanned = item.status === "banned";
                              const title = `${item.brand || "Unknown"} ${item.model || "Unknown"}`.trim();
                              return (
                                <Box key={item.fingerprint} borderWidth="1px" borderRadius="6px" p={2}>
                                  <Flex justifyContent="space-between" alignItems="flex-start" gap={2}>
                                    <VStack align="start" gap={0}>
                                      <Text fontSize="sm" fontWeight="semibold">
                                        {title}
                                      </Text>
                                      <Text fontSize="xs" color="gray.500">
                                        {item.os || "Unknown"} | {deviceTypeLabel(item.device_type)}
                                      </Text>
                                      <Text fontSize="xs" color="gray.500">
                                        {t("userDialog.deviceFirstSeen")}: {formatDeviceDate(item.first_seen_at)}
                                      </Text>
                                      <Text fontSize="xs" color="gray.500">
                                        {t("userDialog.deviceLastSeen")}: {formatDeviceDate(item.last_seen_at)}
                                      </Text>
                                      <Text fontSize="xs" color="gray.500" noOfLines={1}>
                                        {item.fingerprint}
                                      </Text>
                                    </VStack>
                                    <VStack align="end" gap={1}>
                                      <Text
                                        fontSize="xs"
                                        color={isBanned ? "red.500" : "green.500"}
                                        fontWeight="semibold"
                                        textTransform="uppercase"
                                      >
                                        {isBanned
                                          ? t("userDialog.deviceStatusBanned")
                                          : t("userDialog.deviceStatusAllowed")}
                                      </Text>
                                      <Button
                                        size="xs"
                                        variant="outline"
                                        isLoading={deviceActionFingerprint === item.fingerprint}
                                        onClick={() =>
                                          updateDeviceStatus(
                                            item.fingerprint,
                                            isBanned ? "unban" : "ban"
                                          )
                                        }
                                      >
                                        {isBanned
                                          ? t("userDialog.deviceUnban")
                                          : t("userDialog.deviceBan")}
                                      </Button>
                                    </VStack>
                                  </Flex>
                                </Box>
                              );
                            })}
                          </VStack>
                        </FormControl>
                      )}
                    </Flex>
                    {error && (
                      <Alert
                        status="error"
                        display={{ base: "none", md: "flex" }}
                      >
                        <AlertIcon />
                        {error}
                      </Alert>
                    )}
                  </VStack>
                </GridItem>
                <GridItem>
                  <FormControl
                    isInvalid={
                      !!form.formState.errors.selected_proxies?.message
                    }
                  >
                    <FormLabel>{t("userDialog.protocols")}</FormLabel>
                    <Controller
                      control={form.control}
                      name="selected_proxies"
                      render={({ field }) => {
                        return (
                          <RadioGroup
                            list={[
                              {
                                title: "vmess",
                                description: t("userDialog.vmessDesc"),
                              },
                              {
                                title: "vless",
                                description: t("userDialog.vlessDesc"),
                              },
                              {
                                title: "trojan",
                                description: t("userDialog.trojanDesc"),
                              },
                              {
                                title: "shadowsocks",
                                description: t("userDialog.shadowsocksDesc"),
                              },
                            ]}
                            disabled={disabled}
                            {...field}
                          />
                        );
                      }}
                    />
                    <FormErrorMessage>
                      {t(
                        form.formState.errors.selected_proxies
                          ?.message as string
                      )}
                    </FormErrorMessage>
                  </FormControl>

                  {canUseV2box && (
                    <FormControl mt={3} mb={"10px"}>
                      <FormLabel>{t("userDialog.v2boxHwidLimit")}</FormLabel>
                      <Input
                        mt={2}
                        size="sm"
                        placeholder={t("userDialog.v2boxHwidPlaceholder")}
                        {...form.register("v2box_hwid")}
                      />
                      {isEditing && (
                        <Button
                          mt={2}
                          size="xs"
                          variant="outline"
                          onClick={async () => {
                            try {
                              const username =
                                (editingUser?.username ||
                                  form.getValues("username") ||
                                  "").trim();
                              if (!username) throw new Error("username is required");
                              await fetch("/flew/v2box-hwid/reset", {
                                method: "POST",
                                body: { username },
                              });
                              form.setValue("v2box_hwid", "");
                              refetchUsers();
                              toast({
                                title: t("userDialog.v2boxHwidResetDone"),
                                status: "success",
                                isClosable: true,
                                position: "top",
                                duration: 2500,
                              });
                            } catch {
                              toast({
                                title: t("userDialog.v2boxHwidResetFailed"),
                                status: "warning",
                                isClosable: true,
                                position: "top",
                                duration: 2500,
                              });
                            }
                          }}
                        >
                          {t("userDialog.v2boxHwidReset")}
                        </Button>
                      )}
                    </FormControl>
                  )}

                  {canUseHapp && (
                    <FormControl mt={3} mb={"10px"}>
                      <FormLabel>{t("userDialog.happHwidLimit")}</FormLabel>
                      <Input
                        mt={2}
                        size="sm"
                        placeholder={t("userDialog.happHwidPlaceholder")}
                        {...form.register("happ_hwid")}
                      />
                      {isEditing && (
                        <Button
                          mt={2}
                          size="xs"
                          variant="outline"
                          onClick={async () => {
                            try {
                              const username =
                                (editingUser?.username ||
                                  form.getValues("username") ||
                                  "").trim();
                              if (!username) throw new Error("username is required");
                              await fetch("/flew/hwid/reset", {
                                method: "POST",
                                body: { username },
                              });
                              form.setValue("happ_hwid", "");
                              refetchUsers();
                              toast({
                                title: t("userDialog.happHwidResetDone"),
                                status: "success",
                                isClosable: true,
                                position: "top",
                                duration: 2500,
                              });
                            } catch {
                              toast({
                                title: t("userDialog.happHwidResetFailed"),
                                status: "warning",
                                isClosable: true,
                                position: "top",
                                duration: 2500,
                              });
                            }
                          }}
                        >
                          {t("userDialog.happHwidReset")}
                        </Button>
                      )}
                    </FormControl>
                  )}
                </GridItem>
                {isEditing && usageVisible && (
                  <GridItem pt={6} colSpan={{ base: 1, md: 2 }}>
                    <Suspense
                      fallback={
                        <HStack justifyContent="center" py={8}>
                          <Spinner size="sm" color="primary.300" />
                        </HStack>
                      }
                    >
                      <UserUsageSection
                        usage={usage}
                        usageFilter={usageFilter}
                        onFilterChange={(filter, query) => {
                          setUsageFilter(filter);
                          fetchUsageWithFilter(query);
                        }}
                      />
                    </Suspense>
                  </GridItem>
                )}
              </Grid>
              {error && (
                <Alert
                  mt="3"
                  status="error"
                  display={{ base: "flex", md: "none" }}
                >
                  <AlertIcon />
                  {error}
                </Alert>
              )}
            </BodyComponent>
            <FooterComponent
              mt="3"
              className={classNames({ "chakra-modal__footer": isPageMode })}
            >
              <HStack
                justifyContent="space-between"
                w="full"
                gap={3}
                flexDirection={{
                  base: "column",
                  sm: "row",
                }}
              >
                <HStack
                  justifyContent="flex-start"
                  w={{
                    base: "full",
                    sm: "unset",
                  }}
                >
                  {isEditing && (
                    <>
                      <Tooltip label={t("delete")} placement="top">
                        <IconButton
                          aria-label="Delete"
                          size="sm"
                          onClick={() => {
                            onDeletingUser(editingUser);
                          }}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip label={t("userDialog.usage")} placement="top">
                        <IconButton
                          aria-label="usage"
                          size="sm"
                          onClick={handleUsageToggle}
                        >
                          <UserUsageIcon />
                        </IconButton>
                      </Tooltip>
                      <Button onClick={handleResetUsage} size="sm">
                        {t("userDialog.resetUsage")}
                      </Button>
                      <Button onClick={handleRevokeSubscription} size="sm">
                        {t("userDialog.revokeSubscription")}
                      </Button>
                    </>
                  )}
                </HStack>
                <HStack
                  w="full"
                  maxW={{ md: "50%", base: "full" }}
                  justify="end"
                >
                  <Button
                    type="submit"
                    size="sm"
                    px="8"
                    colorScheme="primary"
                    className="dashboard-accent-btn"
                    leftIcon={loading ? <Spinner size="xs" /> : undefined}
                    disabled={disabled}
                    w="full"
                  >
                    {isEditing ? t("userDialog.editUser") : t("createUser")}
                  </Button>
                </HStack>
              </HStack>
            </FooterComponent>
          </form>
        </FrameComponent>
      </FormProvider>
  );

  if (isPageMode) {
    return dialogContent;
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="full"
      scrollBehavior="inside"
      motionPreset="slideInBottom"
    >
      <ModalOverlay bg="blackAlpha.300" backdropFilter="blur(10px)" />
      {dialogContent}
    </Modal>
  );
};
