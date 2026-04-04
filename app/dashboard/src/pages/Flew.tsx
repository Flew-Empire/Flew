import {
  Box,
  Button,
  Card,
  CardBody,
  CardHeader,
  Flex,
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
  Stat,
  StatLabel,
  StatNumber,
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
  chakra,
  useBreakpointValue,
  Grid,
  Textarea,
  Badge,
} from "@chakra-ui/react";
import { Header } from "components/Header";
import { Footer } from "components/Footer";
import { WhitelistManager } from "components/WhitelistManager";
import { DirectConfigManager } from "components/DirectConfigManager";
import { PanelSyncManager } from "components/PanelSyncManager";
import { InstallOtpManager } from "components/InstallOtpManager";
import { FC, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { TrashIcon, ArrowPathIcon, PlusIcon } from "@heroicons/react/24/outline";
import { fetch } from "../service/http";
import { getAuthToken } from "../utils/authStorage";
import { useFeatures } from "../hooks/useFeatures";
import useGetUser from "../hooks/useGetUser";

const AddIcon = chakra(PlusIcon, { baseStyle: { w: 4, h: 4 } });
const RepeatIcon = chakra(ArrowPathIcon, { baseStyle: { w: 4, h: 4 } });

interface Source {
  id: number;
  name: string;
  url: string;
  enabled: boolean;
  priority: number;
  config_count: number;
  success_rate: number;
  last_fetched: string | null;
}

interface Stats {
  total_sources: number;
  enabled_sources: number;
  total_configs: number;
  active_configs: number;
  avg_ping: number;
  target_ips: string[];
  domain: string;
}

interface Config {
  id: number;
  protocol: string;
  server: string;
  port: number;
  remarks: string;
  ping_ms: number;
  packet_loss: number;
  is_active: boolean;
  is_permanent: boolean;
}

interface SourceCreate {
  name: string;
  url: string;
  priority: number;
}

interface Host {
  host: string;
  description: string;
  country: string;
  is_active: boolean;
  added_at: string;
}

interface WhitelistCreate {
  name: string;
  description: string;
}

interface HostCreate {
  host: string;
  description: string;
  country: string;
}

const XpanelStatCard: FC<{
  label: string;
  value: string | number;
  accentColor?: string;
}> = ({ label, value, accentColor }) => (
  <Box className="statistics-card xpanel-stat-card">
    <Text className="statistics-card__title">{label}</Text>
    <Text
      className="statistics-card__value"
      color={accentColor || "var(--text)"}
    >
      {value}
    </Text>
  </Box>
);

export const Flew: FC = () => {
  const [sources, setSources] = useState<Source[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [configs, setConfigs] = useState<Config[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const isMobile = useBreakpointValue({ base: true, md: false });
  const [newSource, setNewSource] = useState<SourceCreate>({
    name: "",
    url: "",
    priority: 1,
  });
  const [testingUrl, setTestingUrl] = useState(false);
  const [targetIpsInput, setTargetIpsInput] = useState("");
  const toast = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const targetIpsModal = useDisclosure();
  const { hasFeature, isLoading: featuresLoading } = useFeatures();
  const xpanelEnabled = hasFeature("xpanel");
  const { userData, getUserIsSuccess } = useGetUser();

  const loadData = async () => {
    setLoading(true);
    try {
      const [sourcesRes, statsRes, configsRes] = await Promise.all([
        fetch("/api/flew/sources", {
          headers: { Authorization: `Bearer ${getAuthToken()}` },
        }),
        fetch("/api/flew/stats", {
          headers: { Authorization: `Bearer ${getAuthToken()}` },
        }),
        fetch("/api/flew/configs", {
          headers: { Authorization: `Bearer ${getAuthToken()}` },
        }),
      ]);
      setSources(sourcesRes);
      setStats(statsRes);
      setConfigs(configsRes);
    } catch (error) {
      console.error("Failed to load Xpanel data:", error);
      toast({
        title: "Error loading data",
        description: "Failed to load Xpanel data",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (featuresLoading) return;
    if (!xpanelEnabled) {
      setLoading(false);
      return;
    }
    loadData();
  }, [featuresLoading, xpanelEnabled]);

  const handleAddSource = async () => {
    if (!newSource.name || !newSource.url) {
      toast({
        title: "Please fill all fields",
        status: "warning",
        duration: 3000,
      });
      return;
    }

    try {
      await fetch("/api/flew/sources", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newSource),
      });
      toast({
        title: "Source added",
        status: "success",
        duration: 3000,
      });
      setNewSource({ name: "", url: "", priority: 1 });
      onClose();
      loadData();
    } catch (error) {
      toast({
        title: "Error adding source",
        status: "error",
        duration: 3000,
      });
    }
  };

  const handleTestUrl = async () => {
    if (!newSource.url) {
      toast({
        title: "Please enter URL to test",
        status: "warning",
        duration: 3000,
      });
      return;
    }

    setTestingUrl(true);
    try {
      const result = await fetch("/api/flew/test-url", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: newSource.url }),
      });
      const data = await result.json();
      
      if (data.success) {
        toast({
          title: "URL Test Successful",
          description: `Found ${data.config_count} configs`,
          status: "success",
          duration: 5000,
        });
      } else {
        toast({
          title: "URL Test Failed",
          description: data.error || "Unknown error",
          status: "error",
          duration: 5000,
        });
      }
    } catch (error) {
      toast({
        title: "Error testing URL",
        description: "Failed to connect to the URL",
        status: "error",
        duration: 3000,
      });
    } finally {
      setTestingUrl(false);
    }
  };

  const handleDeleteSource = async (id: number) => {
    try {
      await fetch(`/api/flew/sources/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      toast({
        title: "Source deleted",
        status: "success",
        duration: 3000,
      });
      loadData();
    } catch (error) {
      toast({
        title: "Error deleting source",
        status: "error",
        duration: 3000,
      });
    }
  };

  const handleToggleSource = async (id: number) => {
    try {
      await fetch(`/api/flew/sources/${id}/toggle`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      loadData();
    } catch (error) {
      toast({
        title: "Error toggling source",
        status: "error",
        duration: 3000,
      });
    }
  };

  const handleUpdate = async () => {
    setUpdating(true);
    try {
      const result = await fetch("/api/flew/update", {
        method: "POST",
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      toast({
        title: "Update complete",
        description: `${result.active_configs}/${result.total_configs} active configs`,
        status: "success",
        duration: 5000,
      });
      loadData();
    } catch (error) {
      toast({
        title: "Error updating",
        status: "error",
        duration: 3000,
      });
    } finally {
      setUpdating(false);
    }
  };

  const handleToggleConfigPermanent = async (id: number, isPermanent: boolean) => {
    try {
      await fetch(`/api/flew/configs/${id}/permanent`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ is_permanent: isPermanent }),
      });
      await loadData();
    } catch (error) {
      toast({
        title: "Error updating permanent status",
        status: "error",
        duration: 3000,
      });
    }
  };

  const handleSyncCore = async () => {
    setUpdating(true);
    try {
      const result = await fetch("/api/flew/sync-core", {
        method: "POST",
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      const data = await result.json();
      toast({
        title: "Flew Core sync complete",
        description: `${data.total_synced || 0} configs synced to Flew Core`,
        status: "success",
        duration: 5000,
      });
      loadData();
    } catch (error) {
      toast({
        title: "Error syncing to Flew Core",
        status: "error",
        duration: 3000,
      });
    } finally {
      setUpdating(false);
    }
  };

  const openTargetIpsModal = () => {
    setTargetIpsInput((stats?.target_ips || []).join(", "));
    targetIpsModal.onOpen();
  };

  const handleSaveTargetIps = async () => {
    try {
      const target_ips = targetIpsInput
        .split(/[,\n]/)
        .map((x) => x.trim())
        .filter((x) => x.length > 0);
      if (target_ips.length === 0) {
        throw new Error("Target IP list cannot be empty");
      }
      await fetch("/api/flew/target-ips", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ target_ips }),
      });
      toast({
        title: "Target IPs updated",
        status: "success",
        duration: 3000,
      });
      targetIpsModal.onClose();
      await loadData();
    } catch (error: any) {
      toast({
        title: "Error updating Target IPs",
        description: error?.message || "Failed to update Target IPs",
        status: "error",
        duration: 4000,
      });
    }
  };

  if (loading) {
    return (
      <VStack justifyContent="center" minH="100vh">
        <Spinner size="xl" />
      </VStack>
    );
  }

  if (!featuresLoading && !xpanelEnabled) {
    return <Navigate to="/" replace />;
  }

  return (
    <VStack
      justifyContent="space-between"
      minH="100vh"
      p={{ base: 4, lg: 6 }}
      rowGap={{ base: 4, md: 4 }}
      w="full"
      minW={0}
      maxW="100%"
      overflowX="hidden"
    >
      <Box w="full" minW={0}>
        <Header />

        {/* Statistics */}
        {stats && (
          <Card mt="4" className="glass-card">
            <CardHeader>
              <Heading size="md">Xpanel Statistics</Heading>
            </CardHeader>
            <CardBody>
              <Grid className="statistics-grid xpanel-stats-grid">
                <XpanelStatCard
                  label="Total Sources"
                  value={stats.total_sources}
                />
                <XpanelStatCard
                  label="Enabled Sources"
                  value={stats.enabled_sources}
                />
                <XpanelStatCard
                  label="Total Configs"
                  value={stats.total_configs}
                />
                <XpanelStatCard
                  label="Active Configs"
                  value={stats.active_configs}
                  accentColor="var(--green)"
                />
                <XpanelStatCard
                  label="Avg Ping"
                  value={`${stats.avg_ping.toFixed(0)} ms`}
                />
              </Grid>
              <Box mt={4}>
                <HStack spacing={3} align="center" mb={1}>
                  <Text fontSize="sm" color="var(--muted)">
                    Target IPs: {stats.target_ips.join(", ")}
                  </Text>
                  <Button size="xs" variant="outline" onClick={openTargetIpsModal}>
                    Edit
                  </Button>
                </HStack>
                <Text fontSize="sm" color="var(--muted)">
                  Domain: {stats.domain}
                </Text>
              </Box>
            </CardBody>
          </Card>
        )}

        {/* External panel cloning */}
        <PanelSyncManager />

        {/* Direct Configurations */}
        <DirectConfigManager />

        {/* Whitelists */}
        <WhitelistManager />

        {/* Sources */}
        <Card mt="4" className="glass-card">
          <CardHeader>
            <Stack
              direction={{ base: "column", md: "row" }}
              justify="space-between"
              align={{ base: "stretch", md: "center" }}
              spacing={3}
            >
              <Heading size="md">Subscription Sources</Heading>
              <Flex wrap="wrap" gap={2} justify={{ base: "flex-start", md: "flex-end" }}>
                <Button
                  leftIcon={<RepeatIcon />}
                  colorScheme="blue"
                  onClick={handleUpdate}
                  isLoading={updating}
                  size="sm"
                >
                  Update Now
                </Button>
                <Button
                  leftIcon={<RepeatIcon />}
                  colorScheme="purple"
                  onClick={handleSyncCore}
                  isLoading={updating}
                  size="sm"
                >
                  Sync to Flew Core
                </Button>
                <Button colorScheme="green" onClick={onOpen} size="sm">
                  Add Source
                </Button>
              </Flex>
            </Stack>
          </CardHeader>
          <CardBody>
            {isMobile ? (
              <VStack align="stretch" spacing={3}>
                {sources.map((source) => (
                  <Box
                    key={source.id}
                    className="glass-list-card"
                    borderWidth="1px"
                    borderColor="gray.200"
                    _dark={{ borderColor: "gray.600" }}
                    borderRadius="xl"
                    p={3}
                  >
                    <Flex justify="space-between" align="center">
                      <Text fontWeight="semibold" noOfLines={1}>
                        {source.name}
                      </Text>
                      <HStack>
                        <Switch
                          isChecked={source.enabled}
                          onChange={() => handleToggleSource(source.id)}
                          size="sm"
                        />
                        <IconButton
                          aria-label="Delete"
                          icon={<TrashIcon />}
                          colorScheme="red"
                          size="xs"
                          variant="ghost"
                          onClick={() => handleDeleteSource(source.id)}
                        />
                      </HStack>
                    </Flex>
                    <Text fontSize="sm" color="gray.600" mt={1} noOfLines={2}>
                      {source.url}
                    </Text>
                    <HStack mt={2} spacing={2} wrap="wrap">
                      <Badge colorScheme="blue">{source.config_count} configs</Badge>
                      <Badge colorScheme="green">{source.success_rate.toFixed(1)}%</Badge>
                      <Badge colorScheme="gray">
                        {source.last_fetched ? new Date(source.last_fetched).toLocaleString() : "Never"}
                      </Badge>
                    </HStack>
                  </Box>
                ))}
              </VStack>
            ) : (
              <Box overflowX="auto">
                <Table variant="simple">
                  <Thead>
                    <Tr>
                      <Th>Name</Th>
                      <Th>URL</Th>
                      <Th>Configs</Th>
                      <Th>Success Rate</Th>
                      <Th>Last Fetched</Th>
                      <Th>Enabled</Th>
                      <Th>Actions</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {sources.map((source) => (
                      <Tr key={source.id}>
                        <Td>{source.name}</Td>
                        <Td fontSize="sm" maxW="300px" isTruncated>
                          {source.url}
                        </Td>
                        <Td>{source.config_count}</Td>
                        <Td>{source.success_rate.toFixed(1)}%</Td>
                        <Td fontSize="sm">
                          {source.last_fetched ? new Date(source.last_fetched).toLocaleString() : "Never"}
                        </Td>
                        <Td>
                          <Switch isChecked={source.enabled} onChange={() => handleToggleSource(source.id)} />
                        </Td>
                        <Td>
                          <IconButton
                            aria-label="Delete"
                            icon={<TrashIcon />}
                            colorScheme="red"
                            size="sm"
                            onClick={() => handleDeleteSource(source.id)}
                          />
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </Box>
            )}
          </CardBody>
        </Card>

        {/* Configs */}
        <Card mt="4" className="glass-card">
          <CardHeader>
            <Heading size="md">Active Configurations ({configs.filter(c => c.is_active || c.is_permanent).length})</Heading>
          </CardHeader>
          <CardBody>
            {isMobile ? (
              <VStack align="stretch" spacing={3}>
                {configs
                  .filter((c) => c.is_active || c.is_permanent)
                  .slice(0, 20)
                  .map((config) => (
                    <Box
                      key={config.id}
                      className="glass-list-card"
                      borderWidth="1px"
                      borderColor="gray.200"
                      _dark={{ borderColor: "gray.600" }}
                      borderRadius="xl"
                      p={3}
                    >
                      <Flex justify="space-between" align="center">
                        <Text fontWeight="semibold" noOfLines={1}>
                          {config.remarks || "-"}
                        </Text>
                        <Badge colorScheme="blue">{config.protocol.toUpperCase()}</Badge>
                      </Flex>
                      <Text fontSize="sm" color="gray.600" mt={1} noOfLines={1}>
                        {config.server}:{config.port}
                      </Text>
                      <HStack mt={2} justify="space-between">
                        <Text fontSize="sm">{config.ping_ms.toFixed(0)} ms</Text>
                        <Text fontSize="sm" color="gray.600">
                          {config.packet_loss.toFixed(0)}%
                        </Text>
                        <Badge colorScheme={config.is_permanent ? "purple" : "green"}>
                          {config.is_permanent ? "Permanent" : "Active"}
                        </Badge>
                      </HStack>
                      <HStack mt={2} justify="space-between">
                        <Text fontSize="xs" color="gray.500">
                          Permanent
                        </Text>
                        <Switch
                          size="sm"
                          isChecked={config.is_permanent}
                          onChange={() => handleToggleConfigPermanent(config.id, !config.is_permanent)}
                        />
                      </HStack>
                    </Box>
                  ))}
                {configs.filter((c) => c.is_active || c.is_permanent).length === 0 && (
                  <Text textAlign="center" color="gray.500" py={4}>
                    No active configurations
                  </Text>
                )}
              </VStack>
            ) : (
              <Box overflowX="auto">
                <Table variant="simple" size="sm">
                  <Thead>
                    <Tr>
                      <Th>Remarks</Th>
                      <Th>Server</Th>
                      <Th>Port</Th>
                      <Th>Protocol</Th>
                      <Th>Ping</Th>
                      <Th>Loss</Th>
                      <Th>Permanent</Th>
                      <Th>Status</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {configs
                      .filter((c) => c.is_active || c.is_permanent)
                      .slice(0, 20)
                      .map((config) => (
                        <Tr key={config.id}>
                          <Td fontSize="sm">{config.remarks}</Td>
                          <Td fontSize="sm">{config.server}</Td>
                          <Td>{config.port}</Td>
                          <Td>{config.protocol.toUpperCase()}</Td>
                          <Td>{config.ping_ms.toFixed(0)} ms</Td>
                          <Td>{config.packet_loss.toFixed(0)}%</Td>
                          <Td>
                            <Switch
                              size="sm"
                              isChecked={config.is_permanent}
                              onChange={() => handleToggleConfigPermanent(config.id, !config.is_permanent)}
                            />
                          </Td>
                          <Td>
                            <Text color={config.is_permanent ? "purple.500" : "green.500"} fontWeight="bold">
                              {config.is_permanent ? "Permanent" : "Active"}
                            </Text>
                          </Td>
                        </Tr>
                      ))}
                  </Tbody>
                </Table>
              </Box>
            )}
            {configs.filter((c) => c.is_active || c.is_permanent).length > 20 && (
              <Text mt={2} fontSize="sm" color="gray.500">
                Showing 20 of {configs.filter((c) => c.is_active || c.is_permanent).length} active configs
              </Text>
            )}
          </CardBody>
        </Card>
      </Box>

      {/* Installation OTPs — available only for sudo admins */}
      {getUserIsSuccess && userData?.is_sudo && <InstallOtpManager />}

      <Footer />

      {/* Add Source Modal */}
      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Add Subscription Source</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Stack spacing={4}>
              <FormControl isRequired>
                <FormLabel>Name</FormLabel>
                <Input
                  value={newSource.name}
                  onChange={(e) =>
                    setNewSource({ ...newSource, name: e.target.value })
                  }
                  placeholder="My Subscription"
                />
              </FormControl>
              <FormControl isRequired>
                <FormLabel>URL</FormLabel>
                <Input
                  value={newSource.url}
                  onChange={(e) =>
                    setNewSource({ ...newSource, url: e.target.value })
                  }
                  placeholder="https://example.com/subscription"
                />
                <Button
                  mt={2}
                  size="sm"
                  colorScheme="blue"
                  variant="outline"
                  onClick={handleTestUrl}
                  isLoading={testingUrl}
                  w="full"
                >
                  {testingUrl ? "Testing..." : "Test URL"}
                </Button>
              </FormControl>
              <FormControl>
                <FormLabel>Priority</FormLabel>
                <Input
                  type="number"
                  value={newSource.priority}
                  onChange={(e) =>
                    setNewSource({ ...newSource, priority: parseInt(e.target.value) || 1 })
                  }
                  placeholder="1"
                />
              </FormControl>
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              colorScheme="blue"
              onClick={handleAddSource}
              isLoading={loading}
            >
              Add Source
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={targetIpsModal.isOpen} onClose={targetIpsModal.onClose} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Edit Target IPs</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <FormControl>
              <FormLabel>Target IPs (comma or new line)</FormLabel>
              <Textarea
                value={targetIpsInput}
                onChange={(e) => setTargetIpsInput(e.target.value)}
                rows={6}
                placeholder="1.1.1.1, 8.8.8.8"
              />
            </FormControl>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onClick={targetIpsModal.onClose}>
              Cancel
            </Button>
            <Button colorScheme="blue" onClick={handleSaveTargetIps}>
              Save
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </VStack>
  );
};

export default Flew;
