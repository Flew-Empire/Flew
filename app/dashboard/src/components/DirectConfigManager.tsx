import {
  Box,
  Button,
  Checkbox,
  Card,
  CardBody,
  CardHeader,
  FormControl,
  FormLabel,
  Heading,
  HStack,
  IconButton,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Spinner,
  Stack,
  Switch,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useDisclosure,
  useToast,
  VStack,
  Textarea,
  Badge,
  Alert,
  AlertIcon,
  Divider,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Flex,
  useBreakpointValue,
} from "@chakra-ui/react";
import { FC, useEffect, useState } from "react";
import { TrashIcon, PlusIcon, ArrowPathIcon, PencilSquareIcon, ArrowUpIcon, ArrowDownIcon, Bars3Icon } from "@heroicons/react/24/outline";
import { fetch } from "../service/http";
import { getAuthToken } from "../utils/authStorage";

const AddIcon = PlusIcon;
const RepeatIcon = ArrowPathIcon;
const EditIcon = PencilSquareIcon;
const ArrowUp = ArrowUpIcon;
const ArrowDown = ArrowDownIcon;
const DragHandle = Bars3Icon;

interface DirectConfig {
  id: number;
  raw: string;
  protocol: string;
  server: string;
  port: number;
  remarks: string;
  ping_ms: number;
  jitter_ms: number;
  packet_loss: number;
  is_active: boolean;
  is_permanent: boolean;
  bypass_whitelist: boolean;
  auto_sync_to_core: boolean;
  added_at: string;
  added_by: string;
}

interface DirectConfigCreate {
  raw: string;
  remarks?: string;
  added_by?: string;
}

interface ValidationResult {
  valid: boolean;
  protocol?: string;
  server?: string;
  port?: number;
  remarks?: string;
  ping_ms?: number;
  is_active?: boolean;
  error?: string;
}

export const DirectConfigManager: FC = () => {
  const [configs, setConfigs] = useState<DirectConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [newConfig, setNewConfig] = useState<DirectConfigCreate>({
    raw: "",
    remarks: "",
    added_by: "admin",
  });
  const [batchConfigs, setBatchConfigs] = useState({
    configs: "",
    added_by: "admin",
  });
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [editConfig, setEditConfig] = useState<DirectConfigCreate & { id: number } | null>(null);
  const [editValidationResult, setEditValidationResult] = useState<ValidationResult | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [movingBatch, setMovingBatch] = useState(false);
  const [deletingBatch, setDeletingBatch] = useState(false);
  const [pingRefreshing, setPingRefreshing] = useState(false);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dropTargetId, setDropTargetId] = useState<number | null>(null);
  const [mobileDragActive, setMobileDragActive] = useState(false);
  const isMobile = useBreakpointValue({ base: true, md: false });
  const toast = useToast();
  
  const singleModal = useDisclosure();
  const batchModal = useDisclosure();
  const editModal = useDisclosure();

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/flew/direct-configs", {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      setConfigs(response.configs || []);
    } catch (error) {
      console.error("Failed to load direct configs:", error);
      toast({
        title: "Error loading direct configs",
        description: "Failed to load direct configurations",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfigs();
  }, []);

  useEffect(() => {
    const interval = globalThis.setInterval(async () => {
      try {
        await globalThis.fetch("/api/flew/direct-configs/ping-refresh", {
          method: "POST",
          headers: { Authorization: `Bearer ${getAuthToken()}` },
        });
        await loadConfigs();
      } catch {
        // silent
      }
    }, 30 * 60 * 1000);
    return () => globalThis.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reorderRequest = async (sourceId: number, targetId: number) => {
    const response = await globalThis.fetch("/api/flew/direct-configs/reorder", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getAuthToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ source_id: sourceId, target_id: targetId }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `HTTP ${response.status}`);
    }
  };

  useEffect(() => {
    if (!isMobile || !mobileDragActive || draggingId === null) return;

    const onMove = (e: PointerEvent) => {
      e.preventDefault();
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const card = el?.closest?.("[data-config-id]") as HTMLElement | null;
      const idStr = card?.dataset?.configId;
      if (!idStr) return;
      const id = Number(idStr);
      if (!Number.isFinite(id)) return;
      setDropTargetId(id);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!e.touches?.[0]) return;
      e.preventDefault();
      const t = e.touches[0];
      const el = document.elementFromPoint(t.clientX, t.clientY) as HTMLElement | null;
      const card = el?.closest?.("[data-config-id]") as HTMLElement | null;
      const idStr = card?.dataset?.configId;
      if (!idStr) return;
      const id = Number(idStr);
      if (!Number.isFinite(id)) return;
      setDropTargetId(id);
    };

    const finish = async () => {
      const src = draggingId;
      const dst = dropTargetId;
      setMobileDragActive(false);
      setDraggingId(null);
      setDropTargetId(null);
      if (src != null && dst != null && src !== dst) {
        try {
          setMovingBatch(true);
          await reorderRequest(src, dst);
          await loadConfigs();
        } catch {
          // silent
        } finally {
          setMovingBatch(false);
        }
      }
    };

    const onUp = () => {
      void finish();
    };

    const onTouchEnd = () => {
      void finish();
    };

    const onCancel = () => {
      setMobileDragActive(false);
      setDraggingId(null);
      setDropTargetId(null);
    };

    const prevUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("pointercancel", onCancel, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onCancel, { passive: true });
    return () => {
      document.body.style.userSelect = prevUserSelect;
      window.removeEventListener("pointermove", onMove as any);
      window.removeEventListener("pointerup", onUp as any);
      window.removeEventListener("pointercancel", onCancel as any);
      window.removeEventListener("touchmove", onTouchMove as any);
      window.removeEventListener("touchend", onTouchEnd as any);
      window.removeEventListener("touchcancel", onCancel as any);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, mobileDragActive, draggingId, dropTargetId]);

  const handleValidateConfig = async () => {
    if (!newConfig.raw.trim()) {
      toast({
        title: "Please enter a configuration",
        status: "warning",
        duration: 3000,
      });
      return;
    }

    setValidating(true);
    try {
      
      const response = await globalThis.fetch("/api/flew/direct-configs/validate", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw: newConfig.raw }),
      });
      
      const rawText = await response.text();
      let result: any = null;
      try {
        result = rawText ? JSON.parse(rawText) : null;
      } catch {
        result = null;
      }

      if (!response.ok) {
        const message =
          (result && (result.detail || result.error || result.message)) ||
          rawText ||
          `Server error: ${response.status}`;
        console.error("Validation error:", response.status, message);
        throw new Error(message);
      }

      if (!result) {
        throw new Error("Empty response from server");
      }

      setValidationResult(result);
      
      if (result.valid) {
        toast({
          title: "Configuration is valid",
          description: `${result.protocol}://${result.server}:${result.port}`,
          status: "success",
          duration: 3000,
        });
      } else {
        toast({
          title: "Invalid configuration",
          description: result.error || "Unknown error",
          status: "error",
          duration: 5000,
        });
      }
    } catch (error: any) {
      console.error("Validation error:", error);
      toast({
        title: "Validation failed",
        description: error.message || "Failed to validate configuration",
        status: "error",
        duration: 5000,
      });
    } finally {
      setValidating(false);
    }
  };

  const handleAddConfig = async () => {
    if (!newConfig.raw.trim()) {
      toast({
        title: "Please enter a configuration",
        status: "warning",
        duration: 3000,
      });
      return;
    }

    try {
      const response = await globalThis.fetch("/api/flew/direct-configs", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newConfig),
      });

      const rawText = await response.text();
      let result: any = null;
      try {
        result = rawText ? JSON.parse(rawText) : null;
      } catch {
        result = null;
      }

      if (!response.ok) {
        const message =
          (result && (result.detail || result.error || result.message)) ||
          rawText ||
          `Server error: ${response.status}`;
        throw new Error(message);
      }
      
      toast({
        title: "Direct config added",
        description: "Configuration added successfully and synced to Flew Core",
        status: "success",
        duration: 3000,
      });
      
      setNewConfig({ raw: "", remarks: "", added_by: "admin" });
      setValidationResult(null);
      singleModal.onClose();
      loadConfigs();
    } catch (error: any) {
      toast({
        title: "Error adding config",
        description: error?.message || "Failed to add configuration",
        status: "error",
        duration: 3000,
      });
    }
  };

  const handleAddBatch = async () => {
    const configLines = batchConfigs.configs
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (configLines.length === 0) {
      toast({
        title: "Please enter configurations",
        status: "warning",
        duration: 3000,
      });
      return;
    }

    try {
      const response = await globalThis.fetch("/api/flew/direct-configs/batch", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          configs: configLines,
          added_by: batchConfigs.added_by,
        }),
      });

      const rawText = await response.text();
      let result: any = null;
      try {
        result = rawText ? JSON.parse(rawText) : null;
      } catch {
        result = null;
      }

      if (!response.ok) {
        const message =
          (result && (result.detail || result.error || result.message)) ||
          rawText ||
          `Server error: ${response.status}`;
        console.error("Batch add error:", response.status, message);
        throw new Error(message);
      }

      if (!result) {
        throw new Error("Empty response from server");
      }


      toast({
        title: "Batch addition complete",
        description: `${result.successful_added}/${result.total_provided} configs added successfully`,
        status: result.successful_added > 0 ? "success" : "warning",
        duration: 5000,
      });

      setBatchConfigs({ configs: "", added_by: "admin" });
      batchModal.onClose();
      loadConfigs();
    } catch (error: any) {
      console.error("Batch add error:", error);
      toast({
        title: "Error adding batch configs",
        description: error.message,
        status: "error",
        duration: 3000,
      });
    }
  };

  const handleDeleteConfig = async (id: number) => {
    try {
      await fetch(`/api/flew/direct-configs/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      toast({
        title: "Config deleted",
        status: "success",
        duration: 3000,
      });
      loadConfigs();
    } catch (error) {
      toast({
        title: "Error deleting config",
        status: "error",
        duration: 3000,
      });
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) {
      toast({
        title: "Select configs first",
        status: "warning",
        duration: 2000,
      });
      return;
    }

    const ok = window.confirm(`Delete ${selectedIds.length} selected configs?`);
    if (!ok) return;

    try {
      setDeletingBatch(true);
      let success = 0;
      let failed = 0;
      for (const id of selectedIds) {
        try {
          await fetch(`/api/flew/direct-configs/${id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${getAuthToken()}` },
          });
          success += 1;
        } catch {
          failed += 1;
        }
      }

      if (success > 0) {
        toast({
          title: "Configs deleted",
          description: `${success} deleted${failed ? `, ${failed} failed` : ""}`,
          status: failed ? "warning" : "success",
          duration: 3000,
        });
      } else {
        toast({
          title: "Error deleting selected configs",
          status: "error",
          duration: 3000,
        });
      }

      setSelectedIds([]);
      await loadConfigs();
    } catch (error) {
      toast({
        title: "Error deleting selected configs",
        status: "error",
        duration: 3000,
      });
    } finally {
      setDeletingBatch(false);
    }
  };

  const handleToggleConfig = async (id: number) => {
    try {
      await fetch(`/api/flew/direct-configs/${id}/toggle`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      loadConfigs();
    } catch (error) {
      toast({
        title: "Error toggling config",
        status: "error",
        duration: 3000,
      });
    }
  };

  const handleTogglePermanent = async (id: number, isPermanent: boolean) => {
    try {
      await fetch(`/api/flew/direct-configs/${id}/permanent`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ is_permanent: isPermanent }),
      });
      await loadConfigs();
    } catch (error) {
      toast({
        title: "Error updating permanent status",
        status: "error",
        duration: 3000,
      });
    }
  };

  const handleSyncToCore = async (id: number) => {
    try {
      await fetch(`/api/flew/direct-configs/${id}/sync-to-core`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      toast({
        title: "Config synced to Flew Core",
        status: "success",
        duration: 3000,
      });
    } catch (error) {
      toast({
        title: "Error syncing to Flew Core",
        status: "error",
        duration: 3000,
      });
    }
  };

  const handlePingRefresh = async () => {
    try {
      setPingRefreshing(true);
      await fetch("/api/flew/direct-configs/ping-refresh", {
        method: "POST",
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      await loadConfigs();
      toast({
        title: "Ping refreshed",
        status: "success",
        duration: 2000,
      });
    } catch (error) {
      toast({
        title: "Error refreshing ping",
        status: "error",
        duration: 3000,
      });
    } finally {
      setPingRefreshing(false);
    }
  };

  const openEditModal = (config: DirectConfig) => {
    setEditConfig({ id: config.id, raw: config.raw, remarks: config.remarks, added_by: config.added_by });
    setEditValidationResult(null);
    editModal.onOpen();
  };

  const handleValidateEditConfig = async () => {
    if (!editConfig?.raw?.trim()) {
      toast({
        title: "Please enter a configuration",
        status: "warning",
        duration: 3000,
      });
      return;
    }

    setValidating(true);
    try {
      const response = await globalThis.fetch("/api/flew/direct-configs/validate", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw: editConfig.raw }),
      });

      const rawText = await response.text();
      let result: any = null;
      try {
        result = rawText ? JSON.parse(rawText) : null;
      } catch {
        result = null;
      }

      if (!response.ok) {
        const message =
          (result && (result.detail || result.error || result.message)) ||
          rawText ||
          `Server error: ${response.status}`;
        throw new Error(message);
      }

      if (!result) {
        throw new Error("Empty response from server");
      }

      setEditValidationResult(result);

      if (result.valid) {
        toast({
          title: "Configuration is valid",
          description: `${result.protocol}://${result.server}:${result.port}`,
          status: "success",
          duration: 3000,
        });
      } else {
        toast({
          title: "Invalid configuration",
          description: result.error || "Unknown error",
          status: "error",
          duration: 5000,
        });
      }
    } catch (error: any) {
      toast({
        title: "Validation failed",
        description: error.message || "Failed to validate configuration",
        status: "error",
        duration: 5000,
      });
    } finally {
      setValidating(false);
    }
  };

  const handleUpdateConfig = async () => {
    if (!editConfig) return;
    try {
      setSavingEdit(true);
      const response = await globalThis.fetch(`/api/flew/direct-configs/${editConfig.id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          raw: editConfig.raw,
          remarks: editConfig.remarks,
          added_by: editConfig.added_by,
        }),
      });

      const rawText = await response.text();
      let result: any = null;
      try {
        result = rawText ? JSON.parse(rawText) : null;
      } catch {
        result = null;
      }

      if (!response.ok) {
        const message =
          (result && (result.detail || result.error || result.message)) ||
          rawText ||
          `Server error: ${response.status}`;
        throw new Error(message);
      }

      toast({
        title: "Config updated",
        status: "success",
        duration: 3000,
      });

      editModal.onClose();
      setEditConfig(null);
      setEditValidationResult(null);
      loadConfigs();
    } catch (error: any) {
      toast({
        title: "Error updating config",
        description: error?.message || "Failed to update configuration",
        status: "error",
        duration: 3000,
      });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleMoveConfig = async (id: number, direction: "up" | "down") => {
    try {
      await moveConfigRequest(id, direction);
      loadConfigs();
    } catch (error) {
      toast({
        title: "Error moving config",
        status: "error",
        duration: 3000,
      });
    }
  };

  const moveConfigRequest = async (id: number, direction: "up" | "down") => {
    await fetch(`/api/flew/direct-configs/${id}/move`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getAuthToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ direction }),
    });
  };

  const toggleSelectConfig = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === configs.length) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(configs.map((c) => c.id));
  };

  const handleMoveSelected = async (direction: "up" | "down") => {
    if (selectedIds.length === 0) {
      toast({
        title: "Select configs first",
        status: "warning",
        duration: 2000,
      });
      return;
    }

    try {
      setMovingBatch(true);
      const response = await globalThis.fetch("/api/flew/direct-configs/move-batch", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ config_ids: selectedIds, direction }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `HTTP ${response.status}`);
      }
      await loadConfigs();
    } catch (error) {
      toast({
        title: "Error moving selected configs",
        status: "error",
        duration: 3000,
      });
    } finally {
      setMovingBatch(false);
    }
  };

  const handleDropOnConfig = async (targetId: number) => {
    if (draggingId === null || draggingId === targetId) {
      setDraggingId(null);
      return;
    }

    try {
      setMovingBatch(true);
      await reorderRequest(draggingId, targetId);
      await loadConfigs();
    } catch (error) {
      toast({
        title: "Error reordering config",
        status: "error",
        duration: 3000,
      });
    } finally {
      setMovingBatch(false);
      setDraggingId(null);
      setDropTargetId(null);
    }
  };

  if (loading) {
    return (
      <VStack justifyContent="center" p={8}>
        <Spinner size="xl" />
      </VStack>
    );
  }

  return (
    <Card mt="4">
      <CardHeader>
        <Stack
          direction={{ base: "column", md: "row" }}
          justify="space-between"
          align={{ base: "stretch", md: "center" }}
          spacing={3}
        >
          <Heading size="md">
            Direct Configurations ({configs.filter((c) => c.is_active || c.is_permanent).length} active)
            <Badge ml={2} colorScheme="green">
              Bypass Whitelist
            </Badge>
          </Heading>

          <Flex wrap="wrap" gap={2} align="center">
            <Button leftIcon={<AddIcon />} colorScheme="green" onClick={singleModal.onOpen} size="sm">
              Add Single
            </Button>
            <Button leftIcon={<AddIcon />} colorScheme="blue" onClick={batchModal.onOpen} size="sm">
              Add Batch
            </Button>
            <Button
              leftIcon={<RepeatIcon />}
              variant="outline"
              onClick={handlePingRefresh}
              isLoading={pingRefreshing}
              size="sm"
            >
              Ping Check
            </Button>
            <Button
              leftIcon={<ArrowUp />}
              variant="outline"
              onClick={() => handleMoveSelected("up")}
              isDisabled={selectedIds.length === 0 || movingBatch}
              isLoading={movingBatch}
              size="sm"
            >
              Move Selected Up
            </Button>
            <Button
              leftIcon={<ArrowDown />}
              variant="outline"
              onClick={() => handleMoveSelected("down")}
              isDisabled={selectedIds.length === 0 || movingBatch}
              isLoading={movingBatch}
              size="sm"
            >
              Move Selected Down
            </Button>
            <Button
              leftIcon={<TrashIcon />}
              colorScheme="red"
              variant="outline"
              onClick={handleDeleteSelected}
              isDisabled={selectedIds.length === 0 || deletingBatch}
              isLoading={deletingBatch}
              size="sm"
            >
              Delete Selected
            </Button>
            <Text fontSize="sm" color="gray.500">
              Selected: {selectedIds.length}
            </Text>
          </Flex>
        </Stack>
      </CardHeader>
      <CardBody>
        {isMobile ? (
          <VStack align="stretch" spacing={3}>
            <HStack justify="space-between">
              <Checkbox
                isChecked={configs.length > 0 && selectedIds.length === configs.length}
                isIndeterminate={selectedIds.length > 0 && selectedIds.length < configs.length}
                onChange={toggleSelectAll}
              >
                Select all
              </Checkbox>
              <Text fontSize="sm" color="gray.500">
                {selectedIds.length} selected
              </Text>
            </HStack>

            {configs.map((config, index) => (
              <Box
                key={config.id}
                data-config-id={config.id}
                borderWidth="1px"
                borderColor="gray.200"
                _dark={{ borderColor: "gray.600" }}
                borderRadius="md"
                p={3}
                bg={
                  mobileDragActive && dropTargetId === config.id && draggingId !== config.id
                    ? "gray.50"
                    : undefined
                }
                transition="transform 140ms ease, background-color 140ms ease"
                transform={mobileDragActive && draggingId === config.id ? "scale(0.98)" : undefined}
              >
                <Flex justify="space-between" align="center">
                  <HStack>
                    <Checkbox
                      isChecked={selectedIds.includes(config.id)}
                      onChange={() => toggleSelectConfig(config.id)}
                    />
                    <Switch
                      isChecked={config.is_active}
                      onChange={() => handleToggleConfig(config.id)}
                      size="sm"
                    />
                    <HStack spacing={1}>
                      <Text fontSize="xs" color="gray.500">
                        P
                      </Text>
                      <Switch
                        isChecked={config.is_permanent}
                        onChange={() => handleTogglePermanent(config.id, !config.is_permanent)}
                        size="sm"
                        colorScheme="purple"
                      />
                    </HStack>
                  </HStack>
                  <HStack>
                    <IconButton
                      aria-label="Drag"
                      icon={<DragHandle />}
                      size="xs"
                      variant="ghost"
                      isDisabled={movingBatch || deletingBatch}
                      style={{ touchAction: "none" }}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        (e.currentTarget as any)?.setPointerCapture?.(e.pointerId);
                        setDraggingId(config.id);
                        setDropTargetId(config.id);
                        setMobileDragActive(true);
                      }}
                      onTouchStart={(e) => {
                        e.preventDefault();
                        setDraggingId(config.id);
                        setDropTargetId(config.id);
                        setMobileDragActive(true);
                      }}
                    />
                    <Badge colorScheme="blue">{config.protocol.toUpperCase()}</Badge>
                  </HStack>
                </Flex>

                <Text mt={2} fontWeight="semibold" noOfLines={1}>
                  {config.remarks || "-"}
                </Text>
                <Text fontSize="sm" color="gray.600" noOfLines={1}>
                  {config.server}:{config.port}
                </Text>
                <HStack mt={2} justify="space-between">
                  <Text fontSize="sm">{config.ping_ms.toFixed(0)} ms</Text>
                  <Badge colorScheme={config.is_permanent ? "purple" : "green"}>
                    {config.is_permanent ? "Permanent" : "Active"}
                  </Badge>
                  <Text fontSize="sm" color="gray.500">
                    {new Date(config.added_at).toLocaleDateString()}
                  </Text>
                </HStack>

                <Flex mt={3} wrap="wrap" gap={1}>
                  <IconButton
                    aria-label="Move Up"
                    icon={<ArrowUp />}
                    size="xs"
                    variant="ghost"
                    onClick={() => handleMoveConfig(config.id, "up")}
                    isDisabled={index === 0}
                  />
                  <IconButton
                    aria-label="Move Down"
                    icon={<ArrowDown />}
                    size="xs"
                    variant="ghost"
                    onClick={() => handleMoveConfig(config.id, "down")}
                    isDisabled={index === configs.length - 1}
                  />
                  <IconButton
                    aria-label="Edit"
                    icon={<EditIcon />}
                    size="xs"
                    variant="ghost"
                    onClick={() => openEditModal(config)}
                  />
                  <IconButton
                    aria-label="Sync to Flew Core"
                    icon={<RepeatIcon />}
                    size="xs"
                    colorScheme="purple"
                    variant="ghost"
                    onClick={() => handleSyncToCore(config.id)}
                  />
                  <IconButton
                    aria-label="Delete"
                    icon={<TrashIcon />}
                    colorScheme="red"
                    size="xs"
                    variant="ghost"
                    onClick={() => handleDeleteConfig(config.id)}
                  />
                </Flex>
              </Box>
            ))}
          </VStack>
        ) : (
          <Box overflowX="auto">
            <Table variant="simple" size="sm">
              <Thead>
                <Tr>
                  <Th>
                    <Checkbox
                      isChecked={configs.length > 0 && selectedIds.length === configs.length}
                      isIndeterminate={selectedIds.length > 0 && selectedIds.length < configs.length}
                      onChange={toggleSelectAll}
                    />
                  </Th>
                  <Th>Status</Th>
                  <Th>Permanent</Th>
                  <Th>Remarks</Th>
                  <Th>Server</Th>
                  <Th>Port</Th>
                  <Th>Protocol</Th>
                  <Th>Ping</Th>
                  <Th>Added</Th>
                  <Th>Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {configs.map((config, index) => (
                  <Tr
                    key={config.id}
                    draggable
                    onDragStart={(e) => {
                      setDraggingId(config.id);
                      setDropTargetId(config.id);
                      e.dataTransfer.setData("text/plain", String(config.id));
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnter={() => {
                      if (draggingId !== null) setDropTargetId(config.id);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (draggingId !== null) setDropTargetId(config.id);
                    }}
                    onDrop={() => {
                      setDropTargetId(null);
                      handleDropOnConfig(config.id);
                    }}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setDropTargetId(null);
                    }}
                    cursor="move"
                    transition="background-color 120ms ease, opacity 120ms ease"
                    opacity={draggingId === config.id ? 0.6 : 1}
                    bg={
                      draggingId === config.id
                        ? "blue.50"
                        : dropTargetId === config.id && draggingId !== null
                        ? "gray.50"
                        : undefined
                    }
                  >
                    <Td>
                      <Checkbox
                        isChecked={selectedIds.includes(config.id)}
                        onChange={() => toggleSelectConfig(config.id)}
                      />
                    </Td>
                    <Td>
                      <Switch
                        isChecked={config.is_active}
                        onChange={() => handleToggleConfig(config.id)}
                        size="sm"
                      />
                    </Td>
                    <Td>
                      <Switch
                        isChecked={config.is_permanent}
                        onChange={() => handleTogglePermanent(config.id, !config.is_permanent)}
                        size="sm"
                        colorScheme="purple"
                      />
                    </Td>
                    <Td fontSize="sm" maxW="200px" isTruncated>
                      {config.remarks}
                    </Td>
                    <Td fontSize="sm">{config.server}</Td>
                    <Td>{config.port}</Td>
                    <Td>
                      <Badge colorScheme="blue">{config.protocol.toUpperCase()}</Badge>
                    </Td>
                    <Td>{config.ping_ms.toFixed(0)} ms</Td>
                    <Td fontSize="sm">{new Date(config.added_at).toLocaleDateString()}</Td>
                    <Td>
                      <HStack spacing={1}>
                          <IconButton
                            aria-label="Move Up"
                            icon={<ArrowUp />}
                            size="sm"
                            variant="outline"
                            onClick={() => handleMoveConfig(config.id, "up")}
                            isDisabled={index === 0}
                          />
                          <IconButton
                            aria-label="Move Down"
                            icon={<ArrowDown />}
                            size="sm"
                            variant="outline"
                            onClick={() => handleMoveConfig(config.id, "down")}
                            isDisabled={index === configs.length - 1}
                          />
                        <IconButton
                          aria-label="Edit"
                          icon={<EditIcon />}
                          size="sm"
                          variant="outline"
                          onClick={() => openEditModal(config)}
                        />
                        <IconButton
                          aria-label="Sync to Flew Core"
                          icon={<RepeatIcon />}
                          size="sm"
                          colorScheme="purple"
                          variant="outline"
                          onClick={() => handleSyncToCore(config.id)}
                        />
                        <IconButton
                          aria-label="Delete"
                          icon={<TrashIcon />}
                          colorScheme="red"
                          size="sm"
                          onClick={() => handleDeleteConfig(config.id)}
                        />
                      </HStack>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Box>
        )}

        {configs.length === 0 && (
          <Text textAlign="center" color="gray.500" py={8}>
            No direct configurations found. Add configs to bypass whitelist filtering.
          </Text>
        )}

      </CardBody>

      {/* Single Config Modal */}
      <Modal isOpen={singleModal.isOpen} onClose={singleModal.onClose} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Add Direct Configuration</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Stack spacing={4}>
              <FormControl isRequired>
                <FormLabel>Configuration</FormLabel>
                <Textarea
                  value={newConfig.raw}
                  onChange={(e) => setNewConfig({ ...newConfig, raw: e.target.value })}
                  placeholder="vless://uuid@server:port?encryption=none&security=tls&type=ws&host=example.com&path=/#remarks"
                  rows={4}
                  fontFamily="mono"
                  fontSize="sm"
                />
                <Button
                  mt={2}
                  size="sm"
                  colorScheme="blue"
                  variant="outline"
                  onClick={handleValidateConfig}
                  isLoading={validating}
                  w="full"
                >
                  {validating ? "Validating..." : "Validate Config"}
                </Button>
              </FormControl>

              {validationResult && (
                <Alert status={validationResult.valid ? "success" : "error"}>
                  <AlertIcon />
                  <Box>
                    <Text fontWeight="bold">
                      {validationResult.valid ? "Valid Configuration" : "Invalid Configuration"}
                    </Text>
                    {validationResult.valid ? (
                      <Text fontSize="sm">
                        {validationResult.protocol}://{validationResult.server}:{validationResult.port}
                      </Text>
                    ) : (
                      <Text fontSize="sm">{validationResult.error}</Text>
                    )}
                  </Box>
                </Alert>
              )}

              <FormControl>
                <FormLabel>Remarks</FormLabel>
                <Input
                  value={newConfig.remarks}
                  onChange={(e) => setNewConfig({ ...newConfig, remarks: e.target.value })}
                  placeholder="Optional description"
                />
              </FormControl>

              <FormControl>
                <FormLabel>Added By</FormLabel>
                <Input
                  value={newConfig.added_by}
                  onChange={(e) => setNewConfig({ ...newConfig, added_by: e.target.value })}
                  placeholder="admin"
                />
              </FormControl>
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onClick={singleModal.onClose}>
              Cancel
            </Button>
            <Button
              colorScheme="green"
              onClick={handleAddConfig}
              isDisabled={!validationResult?.valid}
            >
              Add Config
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>


      {/* Edit Config Modal */}
      <Modal isOpen={editModal.isOpen} onClose={editModal.onClose} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Edit Direct Configuration</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Stack spacing={4}>
              <FormControl isRequired>
                <FormLabel>Configuration</FormLabel>
                <Textarea
                  value={editConfig?.raw || ""}
                  onChange={(e) =>
                    setEditConfig((prev) =>
                      prev ? { ...prev, raw: e.target.value } : prev
                    )
                  }
                  placeholder="vless://uuid@server:port?encryption=none&security=tls&type=ws&host=example.com&path=/#remarks"
                  rows={4}
                  fontFamily="mono"
                  fontSize="sm"
                />
                <Button
                  mt={2}
                  size="sm"
                  colorScheme="blue"
                  variant="outline"
                  onClick={handleValidateEditConfig}
                  isLoading={validating}
                  w="full"
                >
                  {validating ? "Validating..." : "Validate Config"}
                </Button>
              </FormControl>

              {editValidationResult && (
                <Alert status={editValidationResult.valid ? "success" : "error"}>
                  <AlertIcon />
                  <Box>
                    <Text fontWeight="bold">
                      {editValidationResult.valid ? "Valid Configuration" : "Invalid Configuration"}
                    </Text>
                    {editValidationResult.valid ? (
                      <Text fontSize="sm">
                        {editValidationResult.protocol}://{editValidationResult.server}:{editValidationResult.port}
                      </Text>
                    ) : (
                      <Text fontSize="sm">{editValidationResult.error}</Text>
                    )}
                  </Box>
                </Alert>
              )}

              <FormControl>
                <FormLabel>Remarks</FormLabel>
                <Input
                  value={editConfig?.remarks || ""}
                  onChange={(e) =>
                    setEditConfig((prev) =>
                      prev ? { ...prev, remarks: e.target.value } : prev
                    )
                  }
                  placeholder="Optional description"
                />
              </FormControl>

              <FormControl>
                <FormLabel>Added By</FormLabel>
                <Input
                  value={editConfig?.added_by || ""}
                  onChange={(e) =>
                    setEditConfig((prev) =>
                      prev ? { ...prev, added_by: e.target.value } : prev
                    )
                  }
                  placeholder="admin"
                />
              </FormControl>
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onClick={editModal.onClose}>
              Cancel
            </Button>
            <Button
              colorScheme="green"
              onClick={handleUpdateConfig}
              isLoading={savingEdit}
              isDisabled={!editConfig?.raw?.trim()}
            >
              Save Changes
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Batch Config Modal */}
      <Modal isOpen={batchModal.isOpen} onClose={batchModal.onClose} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Add Batch Configurations</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Stack spacing={4}>
              <FormControl isRequired>
                <FormLabel>Configurations (one per line)</FormLabel>
                <Textarea
                  value={batchConfigs.configs}
                  onChange={(e) => setBatchConfigs({ ...batchConfigs, configs: e.target.value })}
                  placeholder="vless://uuid1@server1:port?params#remarks1&#10;vless://uuid2@server2:port?params#remarks2&#10;vmess://encoded-config"
                  rows={10}
                  fontFamily="mono"
                  fontSize="sm"
                />
              </FormControl>

              <FormControl>
                <FormLabel>Added By</FormLabel>
                <Input
                  value={batchConfigs.added_by}
                  onChange={(e) => setBatchConfigs({ ...batchConfigs, added_by: e.target.value })}
                  placeholder="admin"
                />
              </FormControl>
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onClick={batchModal.onClose}>
              Cancel
            </Button>
            <Button colorScheme="blue" onClick={handleAddBatch}>
              Add Batch
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Card>
  );
};

export default DirectConfigManager;
