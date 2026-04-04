import {
  Badge,
  Box,
  Button,
  Checkbox,
  FormControl,
  FormErrorMessage,
  FormLabel,
  Grid,
  HStack,
  Input,
  Select,
  SimpleGrid,
  Text,
  Textarea,
  useBreakpointValue,
  useToast,
  VStack,
} from "@chakra-ui/react";
import {
  ArrowDownIcon,
  ArrowPathIcon,
  ArrowUpIcon,
  Bars3Icon,
  ClipboardDocumentIcon,
  DocumentDuplicateIcon,
  PencilSquareIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { fetchInbounds } from "contexts/DashboardContext";
import { FC, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetch } from "service/http";
import { copyToClipboard } from "utils/clipboard";

type RawInbound = Record<string, any> & {
  tag: string;
  protocol?: string;
  port?: number | string;
};

type CoreConfigPayload = Record<string, any> & {
  inbounds?: RawInbound[];
};

type GeneratorFrameWindow = Window & {
  __ddsInboundGenerator?: {
    getGeneratedConfig?: () => string;
    importConfig?: (value: unknown) => void;
  };
};

type GeneratorFormState = {
  tag: string;
  listen: string;
  port: string;
  protocol: string;
  network: string;
  security: string;
  path: string;
  host: string;
  sni: string;
  sniffingEnabled: boolean;
  sniffRouteOnly: boolean;
  sniffDestOverride: string;
  tcpHeaderType: string;
  grpcAuthority: string;
  allowInsecure: boolean;
};

const DEFAULT_GENERATOR_FORM: GeneratorFormState = {
  tag: "vless-ws-443",
  listen: "0.0.0.0",
  port: "443",
  protocol: "vless",
  network: "ws",
  security: "tls",
  path: "/ws",
  host: "example.com",
  sni: "example.com",
  sniffingEnabled: true,
  sniffRouteOnly: false,
  sniffDestOverride: "http, tls",
  tcpHeaderType: "none",
  grpcAuthority: "",
  allowInsecure: false,
};

const parseList = (value: string) =>
  String(value || "")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);

const cloneValue = <T,>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;

const stringifyInbound = (value: unknown) => JSON.stringify(value, null, 2);

const generateRandomPort = () =>
  Math.floor(Math.random() * (65535 - 1024 + 1)) + 1024;

const summarizeInbound = (inbound: RawInbound) => {
  const network = inbound?.streamSettings?.network || inbound?.network || "-";
  const security =
    inbound?.streamSettings?.security || inbound?.tls || "none";
  const port = inbound?.port ?? "-";
  const protocol = String(inbound?.protocol || "-").toUpperCase();
  return `${protocol} · port ${port} · ${network} · tls: ${security}`;
};

const tryParseInboundObject = (value: string): RawInbound | null => {
  if (!value.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as RawInbound;
    }
  } catch {
    return null;
  }

  return null;
};

const formatJsonSyntaxError = (source: string, error: SyntaxError) => {
  const message = String(error?.message || "Invalid JSON");
  const positionMatch = message.match(/position\s+(\d+)/i);

  if (!positionMatch) {
    return message;
  }

  const position = Number(positionMatch[1]);
  if (!Number.isFinite(position) || position < 0) {
    return message;
  }

  const beforeError = source.slice(0, position);
  const line = beforeError.split("\n").length;
  const column = beforeError.length - beforeError.lastIndexOf("\n");
  return `JSON error on line ${line}, column ${column}: ${message}`;
};

const getInboundDraftError = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return "Inbound must be a JSON object.";
    }

    const tag = String(parsed.tag || "").trim();
    const protocol = String(parsed.protocol || "").trim();
    const portValue = parsed.port;
    const port =
      typeof portValue === "number"
        ? portValue
        : Number.parseInt(String(portValue || "").trim(), 10);

    if (!tag) {
      return 'Missing required field: "tag".';
    }
    if (!protocol) {
      return 'Missing required field: "protocol".';
    }
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      return 'Field "port" must be a valid port from 1 to 65535.';
    }

    return null;
  } catch (error) {
    if (error instanceof SyntaxError) {
      return formatJsonSyntaxError(value, error);
    }
    return String(error);
  }
};

const moveItem = <T,>(items: T[], fromIndex: number, toIndex: number) => {
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
};

const buildGeneratedInbound = (
  form: GeneratorFormState
): Record<string, unknown> => {
  const protocol = form.protocol.trim().toLowerCase();
  const network = form.network.trim().toLowerCase();
  const security = form.security.trim().toLowerCase();
  const hostValues = parseList(form.host);
  const sniValues = parseList(form.sni);
  const pathValues = parseList(form.path);

  const inbound: Record<string, unknown> = {
    tag: form.tag.trim() || "new-inbound",
    listen: form.listen.trim() || "0.0.0.0",
    port: Number.parseInt(form.port, 10) || 443,
    protocol,
  };

  const settings: Record<string, unknown> = {};
  if (protocol === "vless") {
    settings.decryption = "none";
    settings.clients = [];
  } else if (
    protocol === "vmess" ||
    protocol === "trojan" ||
    protocol === "shadowsocks"
  ) {
    settings.clients = [];
    if (protocol === "shadowsocks") {
      settings.network = "tcp,udp";
    }
  } else {
    settings.clients = [];
  }
  inbound.settings = settings;

  const streamSettings: Record<string, unknown> = {
    network,
  };

  if (security === "tls") {
    const tlsSettings: Record<string, unknown> = {};
    if (sniValues[0]) {
      tlsSettings.serverName = sniValues[0];
    } else if (hostValues[0]) {
      tlsSettings.serverName = hostValues[0];
    }
    if (form.allowInsecure) {
      tlsSettings.allowInsecure = true;
    }
    streamSettings.security = "tls";
    streamSettings.tlsSettings = tlsSettings;
  } else {
    streamSettings.security = "none";
  }

  if (network === "ws") {
    const wsSettings: Record<string, unknown> = {};
    if (form.path.trim()) {
      wsSettings.path = form.path.trim();
    }
    if (hostValues[0]) {
      wsSettings.headers = { Host: hostValues.join(",") };
    }
    streamSettings.wsSettings = wsSettings;
  } else if (network === "grpc") {
    const grpcSettings: Record<string, unknown> = {
      serviceName: form.path.trim() || "grpc",
    };
    if (form.grpcAuthority.trim()) {
      grpcSettings.authority = form.grpcAuthority.trim();
    } else if (hostValues[0]) {
      grpcSettings.authority = hostValues[0];
    }
    streamSettings.grpcSettings = grpcSettings;
  } else if (network === "httpupgrade") {
    const httpupgradeSettings: Record<string, unknown> = {};
    if (form.path.trim()) {
      httpupgradeSettings.path = form.path.trim();
    }
    if (hostValues[0]) {
      httpupgradeSettings.host = hostValues[0];
    }
    streamSettings.httpupgradeSettings = httpupgradeSettings;
  } else if (network === "xhttp" || network === "splithttp") {
    const httpLikeSettings: Record<string, unknown> = {};
    if (form.path.trim()) {
      httpLikeSettings.path = form.path.trim();
    }
    if (hostValues[0]) {
      httpLikeSettings.host = hostValues[0];
    }
    streamSettings[network === "xhttp" ? "xhttpSettings" : "splithttpSettings"] =
      httpLikeSettings;
  } else if (network === "http" || network === "h2" || network === "h3") {
    const httpSettings: Record<string, unknown> = {};
    if (hostValues.length > 0) {
      httpSettings.host = hostValues;
    }
    if (form.path.trim()) {
      httpSettings.path = form.path.trim();
    }
    streamSettings.httpSettings = httpSettings;
  } else if (network === "kcp") {
    streamSettings.kcpSettings = {
      header: { type: form.tcpHeaderType || "none" },
      seed: form.path.trim() || undefined,
    };
  } else if (network === "quic") {
    streamSettings.quicSettings = {
      security: "none",
      key: form.path.trim() || "",
      header: { type: form.tcpHeaderType || "none" },
    };
  } else if (form.tcpHeaderType === "http") {
    streamSettings.tcpSettings = {
      header: {
        type: "http",
        request: {
          path: pathValues.length > 0 ? pathValues : ["/"],
          headers: {
            Host: hostValues.length > 0 ? hostValues : [""],
          },
        },
      },
    };
  }

  inbound.streamSettings = streamSettings;

  if (form.sniffingEnabled) {
    inbound.sniffing = {
      enabled: true,
      routeOnly: form.sniffRouteOnly,
      destOverride:
        parseList(form.sniffDestOverride).length > 0
          ? parseList(form.sniffDestOverride)
          : ["http", "tls"],
    };
  }

  return inbound;
};

export const InboundsPage: FC = () => {
  const { t } = useTranslation();
  const toast = useToast();
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const generatorFrameRef = useRef<HTMLIFrameElement | null>(null);
  const editorScrollbarTimerRef = useRef<number | null>(null);

  const [rawInbounds, setRawInbounds] = useState<RawInbound[]>([]);
  const [jsonInput, setJsonInput] = useState("");
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [loadingRaw, setLoadingRaw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [draggingTag, setDraggingTag] = useState<string | null>(null);
  const [dropTag, setDropTag] = useState<string | null>(null);
  const [useCoreConfigFallback, setUseCoreConfigFallback] = useState(true);
  const [editorRuntimeError, setEditorRuntimeError] = useState("");
  const [editorScrollbarVisible, setEditorScrollbarVisible] = useState(false);
  const [generatorForm, setGeneratorForm] =
    useState<GeneratorFormState>(DEFAULT_GENERATOR_FORM);

  const generatedInbound = buildGeneratedInbound(generatorForm);
  const generatedJson = stringifyInbound(generatedInbound);
  const generatorSrc = "/inbound-generator/";
  const generatorFrameHeight = useBreakpointValue({
    base: "1180px",
    md: "1680px",
    xl: "1900px",
  });
  const editorInbound = tryParseInboundObject(jsonInput);
  const editorDraftError = useMemo(() => getInboundDraftError(jsonInput), [jsonInput]);
  const editorPortValue =
    typeof editorInbound?.port === "number" || typeof editorInbound?.port === "string"
      ? String(editorInbound.port)
      : "";

  const showError = (error: any, fallback: string) => {
    toast({
      title: "Ошибка",
      description:
        error?.data?.detail ||
        error?.response?._data?.detail ||
        error?.message ||
        fallback,
      status: "error",
      duration: 4000,
    });
  };

  const focusEditor = () => {
    setTimeout(() => {
      editorRef.current?.focus();
    }, 0);
  };

  const getErrorStatus = (error: any) =>
    error?.statusCode || error?.response?.status || error?.status;

  const isLegacyInboundApiError = (error: any) => {
    const status = getErrorStatus(error);
    return status === 404 || status === 405 || status === 501;
  };

  const loadRawInboundsFromCoreConfig = async () => {
    const config = await fetch<CoreConfigPayload>("/core/config");
    return Array.isArray(config?.inbounds) ? config.inbounds : [];
  };

  const updateInboundsViaCoreConfig = async (
    updater: (currentInbounds: RawInbound[]) => RawInbound[]
  ) => {
    const config = await fetch<CoreConfigPayload>("/core/config");
    const currentInbounds = Array.isArray(config?.inbounds)
      ? cloneValue(config.inbounds)
      : [];
    const nextInbounds = updater(currentInbounds);

    await fetch("/core/config", {
      method: "PUT",
      body: {
        ...config,
        inbounds: nextInbounds,
      },
    });

    setUseCoreConfigFallback(true);
    return nextInbounds;
  };

  const loadRawInbounds = async () => {
    setLoadingRaw(true);
    try {
      const result = await loadRawInboundsFromCoreConfig();
      setRawInbounds(Array.isArray(result) ? result : []);
    } catch (error: any) {
      showError(error, "Не удалось загрузить raw inbound");
    } finally {
      setLoadingRaw(false);
    }
  };

  const refreshAll = async () => {
    await Promise.all([
      loadRawInbounds(),
      fetchInbounds().catch(() => undefined),
    ]);
  };

  useEffect(() => {
    void refreshAll();
  }, []);

  useEffect(() => {
    return () => {
      if (editorScrollbarTimerRef.current !== null) {
        window.clearTimeout(editorScrollbarTimerRef.current);
      }
    };
  }, []);

  const revealEditorScrollbar = () => {
    setEditorScrollbarVisible(true);
    if (editorScrollbarTimerRef.current !== null) {
      window.clearTimeout(editorScrollbarTimerRef.current);
      editorScrollbarTimerRef.current = null;
    }
  };

  const scheduleHideEditorScrollbar = (delay = 900) => {
    if (editorScrollbarTimerRef.current !== null) {
      window.clearTimeout(editorScrollbarTimerRef.current);
    }
    editorScrollbarTimerRef.current = window.setTimeout(() => {
      setEditorScrollbarVisible(false);
      editorScrollbarTimerRef.current = null;
    }, delay);
  };

  const saveInboundPayload = async (
    inboundPayload: Record<string, unknown>,
    currentEditingTag: string | null
  ) => {
    const targetTag = String(inboundPayload.tag || "").trim();
    if (!targetTag) {
      toast({
        title: "Пустой tag",
        description: "У inbound должен быть tag",
        status: "warning",
        duration: 3000,
      });
      return;
    }

    setSubmitting(true);
    setEditorRuntimeError("");
    try {
      const isRenamingTag =
        Boolean(currentEditingTag) && currentEditingTag !== targetTag;

      if (useCoreConfigFallback || isRenamingTag) {
        await updateInboundsViaCoreConfig((currentInbounds) => {
          const currentIndex = currentEditingTag
            ? currentInbounds.findIndex((item) => item.tag === currentEditingTag)
            : -1;
          const duplicateIndex = currentInbounds.findIndex(
            (item) => item.tag === targetTag
          );

          if (currentEditingTag) {
            if (currentIndex < 0) {
              throw new Error(`Inbound ${currentEditingTag} not found`);
            }
            if (duplicateIndex >= 0 && duplicateIndex !== currentIndex) {
              throw new Error(`Inbound ${targetTag} already exists`);
            }

            currentInbounds[currentIndex] = cloneValue(
              inboundPayload as RawInbound
            );
            return currentInbounds;
          }

          if (duplicateIndex >= 0) {
            throw new Error(`Inbound ${targetTag} already exists`);
          }

          return [...currentInbounds, cloneValue(inboundPayload as RawInbound)];
        });
      } else {
        try {
          await fetch(
            currentEditingTag
              ? `/inbounds/${encodeURIComponent(currentEditingTag)}`
              : "/inbounds",
            {
              method: currentEditingTag ? "PUT" : "POST",
              body: inboundPayload,
            }
          );
        } catch (error) {
          if (!isLegacyInboundApiError(error)) {
            throw error;
          }

          await updateInboundsViaCoreConfig((currentInbounds) => {
            const currentIndex = currentEditingTag
              ? currentInbounds.findIndex((item) => item.tag === currentEditingTag)
              : -1;
            const duplicateIndex = currentInbounds.findIndex(
              (item) => item.tag === targetTag
            );

            if (currentEditingTag) {
              if (currentIndex < 0) {
                throw new Error(`Inbound ${currentEditingTag} not found`);
              }
              if (duplicateIndex >= 0 && duplicateIndex !== currentIndex) {
                throw new Error(`Inbound ${targetTag} already exists`);
              }

              currentInbounds[currentIndex] = cloneValue(
                inboundPayload as RawInbound
              );
              return currentInbounds;
            }

            if (duplicateIndex >= 0) {
              throw new Error(`Inbound ${targetTag} already exists`);
            }

            return [...currentInbounds, cloneValue(inboundPayload as RawInbound)];
          });
        }
      }

      setEditingTag(targetTag);
      setJsonInput(stringifyInbound(inboundPayload));

      toast({
        title: currentEditingTag ? "Inbound обновлен" : "Inbound добавлен",
        status: "success",
        duration: 2500,
      });

      await refreshAll();
    } catch (error: any) {
      setEditorRuntimeError(
        error?.data?.detail ||
          error?.response?._data?.detail ||
          error?.message ||
          (currentEditingTag
            ? "Не удалось обновить inbound"
            : "Не удалось добавить inbound")
      );
      showError(
        error,
        currentEditingTag
          ? "Не удалось обновить inbound"
          : "Не удалось добавить inbound"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveEditor = async () => {
    if (!jsonInput.trim()) {
      setEditorRuntimeError("Вставьте JSON конфигурацию inbound.");
      toast({
        title: "Пустое поле",
        description: "Вставьте JSON конфигурацию inbound",
        status: "warning",
        duration: 3000,
      });
      return;
    }

    if (editorDraftError) {
      setEditorRuntimeError(editorDraftError);
      toast({
        title: "Проверьте inbound",
        description: editorDraftError,
        status: "error",
        duration: 4000,
      });
      return;
    }

    try {
      const parsedInbound = JSON.parse(jsonInput);
      setEditorRuntimeError("");
      await saveInboundPayload(parsedInbound, editingTag);
    } catch (error: any) {
      if (error instanceof SyntaxError) {
        const message = formatJsonSyntaxError(jsonInput, error);
        setEditorRuntimeError(message);
        toast({
          title: "Невалидный JSON",
          description: message,
          status: "error",
          duration: 4000,
        });
        return;
      }
      showError(error, "Не удалось сохранить inbound");
    }
  };

  const handleDeleteInbound = async (tag: string) => {
    if (!window.confirm(`Удалить inbound ${tag}?`)) {
      return;
    }

    setActiveTag(tag);
    try {
      if (useCoreConfigFallback) {
        await updateInboundsViaCoreConfig((currentInbounds) => {
          const nextInbounds = currentInbounds.filter((item) => item.tag !== tag);
          if (nextInbounds.length === currentInbounds.length) {
            throw new Error(`Inbound ${tag} not found`);
          }
          return nextInbounds;
        });
      } else {
        try {
          await fetch(`/inbounds/${encodeURIComponent(tag)}`, {
            method: "DELETE",
          });
        } catch (error) {
          if (!isLegacyInboundApiError(error)) {
            throw error;
          }

          await updateInboundsViaCoreConfig((currentInbounds) => {
            const nextInbounds = currentInbounds.filter(
              (item) => item.tag !== tag
            );
            if (nextInbounds.length === currentInbounds.length) {
              throw new Error(`Inbound ${tag} not found`);
            }
            return nextInbounds;
          });
        }
      }

      if (editingTag === tag) {
        setEditingTag(null);
        setJsonInput("");
      }

      toast({
        title: "Inbound удален",
        status: "success",
        duration: 2500,
      });

      await refreshAll();
    } catch (error) {
      showError(error, "Не удалось удалить inbound");
    } finally {
      setActiveTag(null);
    }
  };

  const persistOrder = async (nextInbounds: RawInbound[], changedTag: string) => {
    const previous = rawInbounds;
    setRawInbounds(nextInbounds);
    setActiveTag(changedTag);

    try {
      if (useCoreConfigFallback) {
        await updateInboundsViaCoreConfig((currentInbounds) => {
          const inboundMap = new Map(
            currentInbounds.map((inbound) => [inbound.tag, inbound] as const)
          );
          return nextInbounds.map((inbound) => {
            const currentInbound = inboundMap.get(inbound.tag);
            if (!currentInbound) {
              throw new Error(`Inbound ${inbound.tag} not found`);
            }
            return currentInbound;
          });
        });
      } else {
        try {
          await fetch("/inbounds/reorder", {
            method: "PUT",
            body: {
              tags: nextInbounds.map((inbound) => inbound.tag),
            },
          });
        } catch (error) {
          if (!isLegacyInboundApiError(error)) {
            throw error;
          }

          await updateInboundsViaCoreConfig((currentInbounds) => {
            const inboundMap = new Map(
              currentInbounds.map((inbound) => [inbound.tag, inbound] as const)
            );
            return nextInbounds.map((inbound) => {
              const currentInbound = inboundMap.get(inbound.tag);
              if (!currentInbound) {
                throw new Error(`Inbound ${inbound.tag} not found`);
              }
              return currentInbound;
            });
          });
        }
      }
      await fetchInbounds();
    } catch (error) {
      setRawInbounds(previous);
      showError(error, "Не удалось сохранить порядок inbound");
    } finally {
      setActiveTag(null);
      setDraggingTag(null);
      setDropTag(null);
    }
  };

  const moveInboundByOffset = async (tag: string, offset: number) => {
    const currentIndex = rawInbounds.findIndex((item) => item.tag === tag);
    const nextIndex = currentIndex + offset;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= rawInbounds.length) {
      return;
    }
    await persistOrder(moveItem(rawInbounds, currentIndex, nextIndex), tag);
  };

  const handleDrop = async (targetTag: string) => {
    if (!draggingTag || draggingTag === targetTag) {
      setDraggingTag(null);
      setDropTag(null);
      return;
    }

    const fromIndex = rawInbounds.findIndex((item) => item.tag === draggingTag);
    const toIndex = rawInbounds.findIndex((item) => item.tag === targetTag);
    if (fromIndex < 0 || toIndex < 0) {
      setDraggingTag(null);
      setDropTag(null);
      return;
    }

    await persistOrder(moveItem(rawInbounds, fromIndex, toIndex), draggingTag);
  };

  const setEditorPayload = (inbound: RawInbound) => {
    setEditingTag(inbound.tag);
    setJsonInput(stringifyInbound(inbound));
    setEditorRuntimeError("");
    focusEditor();
  };

  const handleCopyJson = async (
    text: string,
    successTitle = "Скопировано"
  ) => {
    const success = await copyToClipboard(text);
    toast({
      title: success ? successTitle : "Копирование не удалось",
      status: success ? "success" : "error",
      duration: 2000,
    });
  };

  const handleImportGeneratorJson = () => {
    const frameWindow = generatorFrameRef.current
      ?.contentWindow as GeneratorFrameWindow | null;
    const generated = frameWindow?.__ddsInboundGenerator?.getGeneratedConfig?.();

    if (!generated) {
      toast({
        title: "Генератор еще не готов",
        description: "Подождите загрузку генератора и попробуйте снова",
        status: "warning",
        duration: 2500,
      });
      return;
    }

    setEditingTag(null);
    setJsonInput(generated);
    focusEditor();
  };

  const updateEditorPort = (nextPort: string) => {
    const parsedInbound = tryParseInboundObject(jsonInput);
    if (!parsedInbound) {
      return;
    }

    const trimmed = nextPort.trim();
    if (!trimmed) {
      delete parsedInbound.port;
    } else {
      const parsedNumber = Number.parseInt(trimmed, 10);
      parsedInbound.port = Number.isNaN(parsedNumber) ? trimmed : parsedNumber;
    }

    setJsonInput(stringifyInbound(parsedInbound));
  };

  const handleRandomizeEditorPort = () => {
    updateEditorPort(String(generateRandomPort()));
  };

  const resetEditor = () => {
    setEditingTag(null);
    setJsonInput("");
    setEditorRuntimeError("");
  };

  return (
    <Box minW={0} className="inbounds-page">
      <HStack justify="space-between" align="center" mb={5} flexWrap="wrap">
        <Box>
          <Text fontSize={{ base: "xl", md: "2xl" }} fontWeight="700">
            {t("header.inbounds")}
          </Text>
        </Box>
        <HStack spacing={2} flexWrap="wrap">
          <Button
            size="sm"
            variant="outline"
            leftIcon={<ArrowPathIcon width={16} />}
            onClick={() => void refreshAll()}
            isLoading={loadingRaw}
          >
            Refresh
          </Button>
        </HStack>
      </HStack>

      <Grid
        className="inbounds-page-grid"
        templateColumns={{ base: "1fr", xl: "1.1fr .9fr" }}
        gap={{ base: 4, md: 5 }}
      >
        <Box
          className="glass-card inbounds-panel-card inbounds-generator-card"
          borderRadius="22px"
          p={{ base: 3, md: 5 }}
          order={{ base: 2, xl: 1 }}
        >
          <Text fontWeight="600" fontSize="md" mb={4}>
            Inbound Generator
          </Text>
          <Box
            className="inbounds-generator-frame-shell"
            border="1px solid var(--border)"
            borderRadius="18px"
            overflow="hidden"
            bg="var(--surface-soft)"
          >
            <iframe
              className="inbounds-generator-frame"
              ref={generatorFrameRef}
              title="DDS Xray Inbound Generator"
              src={generatorSrc}
              loading="eager"
              style={{
                width: "100%",
                height: generatorFrameHeight,
                border: "0",
                background: "transparent",
              }}
            />
          </Box>

          <HStack
            mt={4}
            spacing={3}
            flexWrap="wrap"
            flexDirection={{ base: "column", sm: "row" }}
            align={{ base: "stretch", sm: "center" }}
          >
            <Button
              leftIcon={<DocumentDuplicateIcon width={16} />}
              onClick={handleImportGeneratorJson}
              w={{ base: "full", sm: "auto" }}
            >
              В редактор
            </Button>
          </HStack>
        </Box>

        <VStack spacing={5} align="stretch" order={{ base: 1, xl: 2 }}>
          <Box
            className="glass-card inbounds-panel-card inbounds-editor-card"
            borderRadius="22px"
            p={{ base: 3, md: 5 }}
          >
            <Text fontWeight="600" fontSize="md" mb={4}>
              {editingTag ? `Редактирование: ${editingTag}` : "Inbound JSON Editor"}
            </Text>

            <HStack
              mb={4}
              spacing={3}
              flexWrap="wrap"
              flexDirection={{ base: "column", sm: "row" }}
              align={{ base: "stretch", sm: "center" }}
              className="inbounds-editor-toolbar-grid"
            >
              <Input
                value={editorPortValue}
                onChange={(event) => updateEditorPort(event.target.value)}
                placeholder="Port"
                maxW={{ base: "full", sm: "180px" }}
                inputMode="numeric"
                isDisabled={!editorInbound}
              />
              <Button
                variant="outline"
                onClick={handleRandomizeEditorPort}
                isDisabled={!editorInbound}
                w={{ base: "full", sm: "auto" }}
              >
                Random port
              </Button>
            </HStack>

            <FormControl isInvalid={Boolean(editorRuntimeError || editorDraftError)}>
              <Textarea
                ref={editorRef}
                value={jsonInput}
                onChange={(event) => {
                  setJsonInput(event.target.value);
                  setEditorRuntimeError("");
                }}
                onFocus={() => revealEditorScrollbar()}
                onBlur={() => scheduleHideEditorScrollbar(180)}
                onScroll={() => {
                  revealEditorScrollbar();
                  scheduleHideEditorScrollbar();
                }}
                onMouseEnter={() => revealEditorScrollbar()}
                onMouseLeave={() => scheduleHideEditorScrollbar()}
                onTouchStart={() => {
                  revealEditorScrollbar();
                  scheduleHideEditorScrollbar(1200);
                }}
                placeholder='{"tag": "my-inbound", "listen": "0.0.0.0", "port": 443, "protocol": "vless"}'
                minH={{ base: "320px", lg: "640px" }}
                fontFamily="monospace"
                fontSize="13px"
                bg="var(--input-bg)"
                border="1px solid var(--border)"
                borderRadius="14px"
                resize="vertical"
                overflowY="auto"
                _placeholder={{ color: "var(--faint)" }}
                _focus={{
                  borderColor: "var(--blue)",
                  boxShadow: "0 0 0 1px var(--blue)",
                }}
                sx={{
                  scrollbarWidth: editorScrollbarVisible ? "thin" : "none",
                  "&::-webkit-scrollbar": {
                    width: editorScrollbarVisible ? "8px" : "0px",
                    height: editorScrollbarVisible ? "8px" : "0px",
                  },
                  "&::-webkit-scrollbar-track": {
                    background: "transparent",
                  },
                  "&::-webkit-scrollbar-thumb": {
                    background: "rgba(148, 163, 184, 0.5)",
                    borderRadius: "999px",
                  },
                }}
              />
              <FormErrorMessage>
                {editorRuntimeError || editorDraftError}
              </FormErrorMessage>
            </FormControl>

            <HStack
              mt={4}
              spacing={3}
              flexWrap="wrap"
              flexDirection={{ base: "column", sm: "row" }}
              align={{ base: "stretch", sm: "center" }}
              className="inbounds-editor-actions-grid"
            >
              <Button
                className="dashboard-accent-btn inbounds-add-btn"
                onClick={() => void handleSaveEditor()}
                isLoading={submitting}
                w={{ base: "full", sm: "auto" }}
              >
                {editingTag ? "Сохранить изменения" : "Добавить inbound"}
              </Button>
              <Button
                variant="outline"
                leftIcon={<DocumentDuplicateIcon width={16} />}
                onClick={() =>
                  void handleCopyJson(
                    jsonInput,
                    "JSON из редактора скопирован"
                  )
                }
                isDisabled={!jsonInput.trim()}
                w={{ base: "full", sm: "auto" }}
              >
                Копировать JSON
              </Button>
              <Button
                variant="ghost"
                onClick={resetEditor}
                w={{ base: "full", sm: "auto" }}
              >
                Очистить
              </Button>
            </HStack>

            {editingTag && (
              <HStack
                mt={4}
                spacing={3}
                flexWrap="wrap"
                flexDirection={{ base: "column", sm: "row" }}
                align={{ base: "stretch", sm: "center" }}
                className="inbounds-editor-secondary-actions-grid"
              >
                <Button variant="outline" onClick={resetEditor} w={{ base: "full", sm: "auto" }}>
                  Снять режим редактирования
                </Button>
              </HStack>
            )}
          </Box>

          <Box
            className="glass-card inbounds-panel-card inbounds-list-card"
            borderRadius="22px"
            p={{ base: 3, md: 5 }}
          >
            <Text fontWeight="600" fontSize="md" mb={4}>
              Текущие Inbounds
            </Text>

            {loadingRaw && rawInbounds.length === 0 ? (
              <Text color="var(--muted)">Загрузка inbound...</Text>
            ) : rawInbounds.length === 0 ? (
              <Text color="var(--muted)">
                Нет inbound. Создайте первый через локальный генератор или JSON
                editor.
              </Text>
            ) : (
              <VStack align="stretch" spacing={3}>
                {rawInbounds.map((inbound, index) => {
                  const isActive = activeTag === inbound.tag;
                  const isDragging = draggingTag === inbound.tag;
                  const isDropTarget = dropTag === inbound.tag;

                  return (
                    <HStack
                      className="inbounds-list-item"
                      key={inbound.tag}
                      draggable
                      align="stretch"
                      spacing={3}
                      flexDirection={{ base: "column", md: "row" }}
                      p={3}
                      borderRadius="14px"
                      bg={
                        isDragging
                          ? "var(--active)"
                          : "var(--surface-soft)"
                      }
                      border={
                        isDropTarget
                          ? "1px solid var(--blue)"
                          : "1px solid var(--divider)"
                      }
                      opacity={isDragging ? 0.7 : 1}
                      onDragStart={() => {
                        setDraggingTag(inbound.tag);
                        setDropTag(inbound.tag);
                      }}
                      onDragEnd={() => {
                        setDraggingTag(null);
                        setDropTag(null);
                      }}
                      onDragEnter={() => setDropTag(inbound.tag)}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setDropTag(inbound.tag);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        void handleDrop(inbound.tag);
                      }}
                    >
                      <Box
                        className="inbounds-list-handle"
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                        px={2}
                        color="var(--muted)"
                        cursor="grab"
                      >
                        <Bars3Icon width={18} />
                      </Box>

                      <Box flex="1" minW={0}>
                        <HStack
                          justify="space-between"
                          flexWrap="wrap"
                          mb={1}
                          className="inbounds-list-title-row"
                        >
                          <Text fontSize="sm" fontWeight="700" noOfLines={1}>
                            {index + 1}. {inbound.tag}
                          </Text>
                          <Badge colorScheme="blue" borderRadius="full">
                            {String(inbound.protocol || "-").toUpperCase()}
                          </Badge>
                        </HStack>
                        <Text fontSize="xs" color="var(--muted)" noOfLines={2}>
                          {summarizeInbound(inbound)}
                        </Text>
                      </Box>

                      <VStack
                        spacing={2}
                        align="stretch"
                        w={{ base: "full", md: "auto" }}
                        className="inbounds-list-actions"
                      >
                        <SimpleGrid
                          columns={{ base: 2, sm: 2 }}
                          spacing={2}
                          w="full"
                          className="inbounds-list-actions-grid"
                        >
                          <Button
                            size="xs"
                            variant="outline"
                            leftIcon={<PencilSquareIcon width={14} />}
                            onClick={() => setEditorPayload(inbound)}
                            w="full"
                          >
                            Edit
                          </Button>
                          <Button
                            size="xs"
                            variant="outline"
                            leftIcon={<ClipboardDocumentIcon width={14} />}
                            onClick={() =>
                              void handleCopyJson(
                                stringifyInbound(inbound),
                                `Inbound ${inbound.tag} скопирован`
                              )
                            }
                            w="full"
                          >
                            Copy
                          </Button>
                          <Button
                            size="xs"
                            variant="ghost"
                            leftIcon={<ArrowUpIcon width={14} />}
                            onClick={() =>
                              void moveInboundByOffset(inbound.tag, -1)
                            }
                            isDisabled={index === 0 || isActive}
                            w="full"
                          >
                            Up
                          </Button>
                          <Button
                            size="xs"
                            variant="ghost"
                            leftIcon={<ArrowDownIcon width={14} />}
                            onClick={() =>
                              void moveInboundByOffset(inbound.tag, 1)
                            }
                            isDisabled={
                              index === rawInbounds.length - 1 || isActive
                            }
                            w="full"
                          >
                            Down
                          </Button>
                        </SimpleGrid>

                        <SimpleGrid columns={2} spacing={2} w="full">
                          <Button
                            size="xs"
                            colorScheme="red"
                            variant="outline"
                            leftIcon={<TrashIcon width={14} />}
                            onClick={() => void handleDeleteInbound(inbound.tag)}
                            isLoading={isActive}
                            gridColumn="1 / -1"
                            w="full"
                          >
                            Delete
                          </Button>
                        </SimpleGrid>
                      </VStack>
                    </HStack>
                  );
                })}
              </VStack>
            )}
          </Box>
        </VStack>
      </Grid>
    </Box>
  );
};

export default InboundsPage;
