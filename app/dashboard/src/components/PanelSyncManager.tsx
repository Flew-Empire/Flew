import {
  Badge,
  Box,
  Button,
  Card,
  CardBody,
  CardHeader,
  Collapse,
  Flex,
  FormControl,
  FormLabel,
  Heading,
  HStack,
  Input,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  useBreakpointValue,
  useToast,
} from "@chakra-ui/react";
import { FC, useEffect, useMemo, useRef, useState } from "react";
import { fetch } from "../service/http";

type TargetStatus = "idle" | "ok" | "error";

interface PanelSyncTarget {
  id: number;
  url: string;
  username: string;
  password: string;
  enabled: boolean;
  last_status?: TargetStatus;
  last_message?: string;
  last_checked?: string | null;
}

const MAX_TARGETS = 4;

const buildEmptyTargets = (): PanelSyncTarget[] =>
  Array.from({ length: MAX_TARGETS }, (_, idx) => ({
    id: idx + 1,
    url: "",
    username: "",
    password: "",
    enabled: false,
    last_status: "idle",
    last_message: "",
    last_checked: null,
  }));

const normalizeTargets = (targets: PanelSyncTarget[] = []): PanelSyncTarget[] => {
  const out = buildEmptyTargets();
  for (let i = 0; i < out.length; i += 1) {
    const src = targets[i];
    if (!src) continue;
    out[i] = {
      ...out[i],
      ...src,
      id: i + 1,
    };
  }
  return out;
};

export const PanelSyncManager: FC = () => {
  const [targets, setTargets] = useState<PanelSyncTarget[]>(buildEmptyTargets());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncingUsers, setSyncingUsers] = useState(false);
  const [purgingTargetId, setPurgingTargetId] = useState<number | null>(null);
  const [isOpen, setIsOpen] = useState(true);
  const isMobile = useBreakpointValue({ base: true, md: false });
  const hasInitOpen = useRef(false);
  const toast = useToast();

  const hasEnabledTargets = useMemo(
    () => targets.some((target) => target.enabled),
    [targets]
  );
  const enabledCount = useMemo(
    () => targets.filter((target) => target.enabled).length,
    [targets]
  );

  useEffect(() => {
    if (hasInitOpen.current) return;
    if (typeof isMobile === "boolean") {
      setIsOpen(!isMobile);
      hasInitOpen.current = true;
    }
  }, [isMobile]);

  const loadTargets = async () => {
    setLoading(true);
    try {
      const result = await fetch<{ targets: PanelSyncTarget[] }>(
        "/api/flew/panel-sync/targets"
      );
      setTargets(normalizeTargets(result?.targets || []));
    } catch (error) {
      toast({
        title: "Failed to load clone targets",
        status: "error",
        duration: 4000,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTargets();
  }, []);

  const updateTarget = (
    index: number,
    key: keyof Pick<PanelSyncTarget, "url" | "username" | "password" | "enabled">,
    value: string | boolean
  ) => {
    setTargets((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, [key]: value } : item))
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await fetch<{ targets: PanelSyncTarget[] }>(
        "/api/flew/panel-sync/targets",
        {
          method: "PUT",
          body: {
            targets: targets.map((target) => ({
              id: target.id,
              url: target.url,
              username: target.username,
              password: target.password,
              enabled: target.enabled,
            })),
          },
        }
      );
      setTargets(normalizeTargets(result?.targets || []));
      toast({
        title: "Clone targets saved",
        status: "success",
        duration: 2500,
      });
    } catch (error) {
      toast({
        title: "Failed to save clone targets",
        status: "error",
        duration: 3500,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const result = await fetch<{ targets: PanelSyncTarget[] }>(
        "/api/flew/panel-sync/test",
        { method: "POST" }
      );
      setTargets(normalizeTargets(result?.targets || []));
      toast({
        title: "Connection check complete",
        status: "success",
        duration: 2500,
      });
    } catch (error) {
      toast({
        title: "Connection check failed",
        status: "error",
        duration: 3500,
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSyncAllUsers = async () => {
    setSyncingUsers(true);
    try {
      const result = await fetch<{
        total_users: number;
        created: number;
        updated: number;
        errors: number;
      }>("/api/flew/panel-sync/sync-all-users", {
        method: "POST",
        // Full clone reconciliation can take a while on large user lists.
        timeout: 10 * 60 * 1000,
      });
      toast({
        title: "User clone sync finished",
        description: `Users: ${result.total_users}, created: ${result.created}, updated: ${result.updated}, errors: ${result.errors}`,
        status: result.errors > 0 ? "warning" : "success",
        duration: 7000,
      });
    } catch (error: any) {
      const statusCode = error?.statusCode ?? error?.response?.status;
      const detail = String(
        error?.data?.detail ??
          error?.response?._data?.detail ??
          error?.message ??
          ""
      ).toLowerCase();
      if (statusCode === 409 || detail.includes("sync already running")) {
        toast({
          title: "Sync already running",
          description: "Please wait until current sync is finished.",
          status: "info",
          duration: 4000,
        });
        return;
      }
      toast({
        title: "Failed to sync users",
        status: "error",
        duration: 4000,
      });
    } finally {
      setSyncingUsers(false);
    }
  };

  const handlePurgeTarget = async (targetId: number) => {
    const accepted = globalThis.confirm(
      "Delete all cloned users from this target panel and clear local mapping?"
    );
    if (!accepted) return;

    setPurgingTargetId(targetId);
    try {
      const result = await fetch<{
        deleted: number;
        errors: number;
      }>(`/api/flew/panel-sync/targets/${targetId}/purge-users`, {
        method: "POST",
      });
      toast({
        title: "Clone purge complete",
        description: `Deleted: ${result.deleted || 0}, errors: ${result.errors || 0}`,
        status: (result.errors || 0) > 0 ? "warning" : "success",
        duration: 5000,
      });
      await loadTargets();
    } catch (error) {
      toast({
        title: "Failed to purge clones",
        status: "error",
        duration: 3500,
      });
    } finally {
      setPurgingTargetId(null);
    }
  };

  const getStatusBadge = (status: TargetStatus = "idle") => {
    if (status === "ok") {
      return <Badge colorScheme="green">Connected</Badge>;
    }
    if (status === "error") {
      return <Badge colorScheme="red">Error</Badge>;
    }
    return <Badge colorScheme="gray">Idle</Badge>;
  };

  return (
    <Card mt="4">
      <CardHeader>
        <Stack
          direction={{ base: "column", md: "row" }}
          justify="space-between"
          align={{ base: "stretch", md: "center" }}
          spacing={3}
        >
          <Box>
            <Heading size="md">Panel User Cloning</Heading>
            <Text mt={1} fontSize="sm" color="gray.500">
              Clone each created user to up to four external panels.
            </Text>
            <Text mt={1} fontSize="xs" color="gray.500">
              Enabled targets: {enabledCount}/{MAX_TARGETS}
            </Text>
          </Box>
          <HStack spacing={2} flexWrap="wrap">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsOpen((prev) => !prev)}
            >
              {isOpen ? "Collapse" : "Expand"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleTest}
              isLoading={testing || loading}
            >
              Refresh
            </Button>
            <Button
              size="sm"
              colorScheme="blue"
              onClick={handleSave}
              isLoading={saving || loading}
            >
              Save
            </Button>
            <Button
              size="sm"
              colorScheme="green"
              onClick={handleSyncAllUsers}
              isLoading={syncingUsers || loading}
              isDisabled={!hasEnabledTargets}
            >
              Sync Existing Users
            </Button>
          </HStack>
        </Stack>
      </CardHeader>
      <Collapse in={isOpen} animateOpacity>
        <CardBody pt={0}>
          <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={4}>
            {targets.map((target, index) => (
              <Box
                key={target.id}
                borderWidth="1px"
                borderRadius="lg"
                p={4}
                borderColor="gray.200"
                _dark={{ borderColor: "whiteAlpha.300", bg: "whiteAlpha.50" }}
              >
                <Flex justify="space-between" align="center" mb={3}>
                  <Heading size="sm">Panel #{target.id}</Heading>
                  <HStack spacing={2}>
                    {getStatusBadge(target.last_status)}
                    <Switch
                      size="sm"
                      isChecked={target.enabled}
                      onChange={(e) => updateTarget(index, "enabled", e.target.checked)}
                    />
                  </HStack>
                </Flex>

                <Button
                  size="xs"
                  colorScheme="red"
                  variant="outline"
                  mb={3}
                  onClick={() => handlePurgeTarget(target.id)}
                  isLoading={purgingTargetId === target.id}
                  isDisabled={!target.url || !target.username || !target.password}
                >
                  Delete Clones
                </Button>

                <Stack spacing={3}>
                  <FormControl>
                    <FormLabel fontSize="sm" mb={1}>
                      URL
                    </FormLabel>
                    <Input
                      size="sm"
                      value={target.url}
                      onChange={(e) => updateTarget(index, "url", e.target.value)}
                      placeholder="https://sub.example.com/dashboard/#/"
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel fontSize="sm" mb={1}>
                      Login
                    </FormLabel>
                    <Input
                      size="sm"
                      value={target.username}
                      onChange={(e) => updateTarget(index, "username", e.target.value)}
                      placeholder="admin"
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel fontSize="sm" mb={1}>
                      Password
                    </FormLabel>
                    <Input
                      size="sm"
                      type="password"
                      value={target.password}
                      onChange={(e) => updateTarget(index, "password", e.target.value)}
                      placeholder="password"
                    />
                  </FormControl>
                  <Text fontSize="xs" color="gray.500" minH="18px">
                    {target.last_message || ""}
                  </Text>
                </Stack>
              </Box>
            ))}
          </SimpleGrid>
        </CardBody>
      </Collapse>
    </Card>
  );
};

export default PanelSyncManager;
