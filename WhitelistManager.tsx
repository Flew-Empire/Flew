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
  Stack,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useDisclosure,
  useToast,
  useBreakpointValue,
  VStack,
  Badge,
  Textarea,
} from "@chakra-ui/react";
import { TrashIcon, PlusIcon } from "@heroicons/react/24/outline";
import { FC, useEffect, useState } from "react";
import { fetch } from "../service/http";
import { getAuthToken } from "../utils/authStorage";

const DeleteIcon = TrashIcon;

interface Whitelist {
  id: string;
  name: string;
  description: string;
  hosts_count: number;
  active_hosts: number;
  created_at: string;
  updated_at: string;
  is_active: boolean;
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

export const WhitelistManager: FC = () => {
  const [whitelists, setWhitelists] = useState<Whitelist[]>([]);
  const [selectedWhitelist, setSelectedWhitelist] = useState<Whitelist | null>(null);
  const [whitelistHosts, setWhitelistHosts] = useState<Host[]>([]);
  const [loading, setLoading] = useState(true);
  const [newWhitelist, setNewWhitelist] = useState<WhitelistCreate>({
    name: "",
    description: "",
  });
  const [newHost, setNewHost] = useState<HostCreate>({
    host: "",
    description: "",
    country: "",
  });
  const toast = useToast();
  const { 
    isOpen: isWhitelistOpen, 
    onOpen: onWhitelistOpen, 
    onClose: onWhitelistClose 
  } = useDisclosure();
  const { 
    isOpen: isHostOpen, 
    onOpen: onHostOpen, 
    onClose: onHostClose 
  } = useDisclosure();
  const isMobile = useBreakpointValue({ base: true, md: false });

  const loadData = async () => {
    setLoading(true);
    try {
      const whitelistsRes = await fetch("/api/xpert/whitelists", {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      setWhitelists(whitelistsRes.whitelists || []);
    } catch (error) {
      console.error("Failed to load whitelists:", error);
      toast({
        title: "Error loading whitelists",
        description: "Failed to load whitelist data",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  const loadWhitelistHosts = async (whitelistId: string) => {
    try {
      const hostsRes = await fetch(`/api/xpert/whitelists/${whitelistId}/hosts`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      setWhitelistHosts(hostsRes.hosts || []);
    } catch (error) {
      console.error("Failed to load whitelist hosts:", error);
      toast({
        title: "Error loading hosts",
        description: "Failed to load whitelist hosts",
        status: "error",
        duration: 3000,
      });
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddWhitelist = async () => {
    if (!newWhitelist.name) {
      toast({
        title: "Please enter whitelist name",
        status: "warning",
        duration: 3000,
      });
      return;
    }

    try {
      await fetch("/api/xpert/whitelists", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newWhitelist),
      });
      toast({
        title: "Whitelist created",
        status: "success",
        duration: 3000,
      });
      setNewWhitelist({ name: "", description: "" });
      onWhitelistClose();
      loadData();
    } catch (error) {
      toast({
        title: "Error creating whitelist",
        status: "error",
        duration: 3000,
      });
    }
  };

  const handleAddHost = async () => {
    if (!newHost.host || !selectedWhitelist) {
      toast({
        title: "Please enter host and select whitelist",
        status: "warning",
        duration: 3000,
      });
      return;
    }

    try {
      await fetch(`/api/xpert/whitelists/${selectedWhitelist.id}/hosts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newHost),
      });
      toast({
        title: "Host added",
        status: "success",
        duration: 3000,
      });
      setNewHost({ host: "", description: "", country: "" });
      onHostClose();
      loadWhitelistHosts(selectedWhitelist.id);
      loadData();
    } catch (error) {
      toast({
        title: "Error adding host",
        status: "error",
        duration: 3000,
      });
    }
  };

  const handleDeleteWhitelist = async (id: string) => {
    try {
      await fetch(`/api/xpert/whitelists/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      toast({
        title: "Whitelist deleted",
        status: "success",
        duration: 3000,
      });
      loadData();
    } catch (error) {
      toast({
        title: "Error deleting whitelist",
        status: "error",
        duration: 3000,
      });
    }
  };

  const handleDeleteHost = async (host: string) => {
    if (!selectedWhitelist) return;
    
    try {
      await fetch(`/api/xpert/whitelists/${selectedWhitelist.id}/hosts/${host}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      toast({
        title: "Host deleted",
        status: "success",
        duration: 3000,
      });
      loadWhitelistHosts(selectedWhitelist.id);
      loadData();
    } catch (error) {
      toast({
        title: "Error deleting host",
        status: "error",
        duration: 3000,
      });
    }
  };

  if (loading) {
    return <Box>Loading...</Box>;
  }

  return (
    <Card>
      <CardHeader>
        <Stack
          direction={{ base: "column", md: "row" }}
          justify="space-between"
          align={{ base: "stretch", md: "center" }}
          spacing={3}
        >
          <Heading size="md">IP/Domain Whitelists</Heading>
          <Button colorScheme="purple" onClick={onWhitelistOpen} size="sm">
            Create Whitelist
          </Button>
        </Stack>
      </CardHeader>
      <CardBody>
        {isMobile ? (
          <VStack align="stretch" spacing={3}>
            {whitelists.map((whitelist) => (
              <Box
                key={whitelist.id}
                borderWidth="1px"
                borderColor="gray.200"
                _dark={{ borderColor: "gray.600" }}
                borderRadius="md"
                p={3}
              >
                <Flex justify="space-between" align="center">
                  <Text fontWeight="semibold" noOfLines={1}>
                    {whitelist.name}
                  </Text>
                  <Badge colorScheme={whitelist.is_active ? "green" : "red"}>
                    {whitelist.is_active ? "Active" : "Inactive"}
                  </Badge>
                </Flex>

                <Text fontSize="sm" color="gray.600" mt={1} noOfLines={2}>
                  {whitelist.description || "-"}
                </Text>

                <HStack mt={2} justify="space-between">
                  <Badge colorScheme="blue">
                    {whitelist.active_hosts}/{whitelist.hosts_count} hosts
                  </Badge>
                  <Text fontSize="sm" color="gray.500">
                    {new Date(whitelist.created_at).toLocaleDateString()}
                  </Text>
                </HStack>

                <HStack mt={3} spacing={2}>
                  <Button
                    size="xs"
                    colorScheme="blue"
                    onClick={() => {
                      setSelectedWhitelist(whitelist);
                      loadWhitelistHosts(whitelist.id);
                      onHostOpen();
                    }}
                  >
                    View Hosts
                  </Button>
                  <IconButton
                    aria-label="Delete"
                    icon={<DeleteIcon />}
                    colorScheme="red"
                    size="xs"
                    variant="ghost"
                    onClick={() => handleDeleteWhitelist(whitelist.id)}
                  />
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
                  <Th>Description</Th>
                  <Th>Hosts</Th>
                  <Th>Active</Th>
                  <Th>Created</Th>
                  <Th>Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {whitelists.map((whitelist) => (
                  <Tr key={whitelist.id}>
                    <Td fontWeight="bold">{whitelist.name}</Td>
                    <Td fontSize="sm">{whitelist.description || "-"}</Td>
                    <Td>
                      <Badge colorScheme="blue">
                        {whitelist.active_hosts}/{whitelist.hosts_count}
                      </Badge>
                    </Td>
                    <Td>
                      <Badge colorScheme={whitelist.is_active ? "green" : "red"}>
                        {whitelist.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </Td>
                    <Td fontSize="sm">{new Date(whitelist.created_at).toLocaleDateString()}</Td>
                    <Td>
                      <HStack>
                        <Button
                          size="sm"
                          colorScheme="blue"
                          onClick={() => {
                            setSelectedWhitelist(whitelist);
                            loadWhitelistHosts(whitelist.id);
                            onHostOpen();
                          }}
                        >
                          View Hosts
                        </Button>
                        <IconButton
                          aria-label="Delete"
                          icon={<DeleteIcon />}
                          colorScheme="red"
                          size="sm"
                          onClick={() => handleDeleteWhitelist(whitelist.id)}
                        />
                      </HStack>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Box>
        )}
        {whitelists.length === 0 && (
          <Text textAlign="center" color="gray.500" py={4}>
            No whitelists created yet. Create a whitelist to filter servers by IP/domain.
          </Text>
        )}
      </CardBody>

      {/* Create Whitelist Modal */}
      <Modal isOpen={isWhitelistOpen} onClose={onWhitelistClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Create IP/Domain Whitelist</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Stack spacing={4}>
              <FormControl isRequired>
                <FormLabel>Name</FormLabel>
                <Input
                  value={newWhitelist.name}
                  onChange={(e) =>
                    setNewWhitelist({ ...newWhitelist, name: e.target.value })
                  }
                  placeholder="Working Servers"
                />
              </FormControl>
              <FormControl>
                <FormLabel>Description</FormLabel>
                <Textarea
                  value={newWhitelist.description}
                  onChange={(e) =>
                    setNewWhitelist({ ...newWhitelist, description: e.target.value })
                  }
                  placeholder="List of working server IPs and domains"
                  rows={3}
                />
              </FormControl>
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onClick={onWhitelistClose}>
              Cancel
            </Button>
            <Button
              colorScheme="purple"
              onClick={handleAddWhitelist}
              isLoading={loading}
            >
              Create Whitelist
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Add Host Modal */}
      <Modal isOpen={isHostOpen} onClose={onHostClose} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            Add Host to {selectedWhitelist?.name}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Stack spacing={4}>
              <FormControl isRequired>
                <FormLabel>Host (IP or Domain)</FormLabel>
                <Input
                  value={newHost.host}
                  onChange={(e) =>
                    setNewHost({ ...newHost, host: e.target.value })
                  }
                  placeholder="1.2.3.4 or server.example.com"
                />
              </FormControl>
              <FormControl>
                <FormLabel>Description</FormLabel>
                <Input
                  value={newHost.description}
                  onChange={(e) =>
                    setNewHost({ ...newHost, description: e.target.value })
                  }
                  placeholder="Main server"
                />
              </FormControl>
              <FormControl>
                <FormLabel>Country</FormLabel>
                <Input
                  value={newHost.country}
                  onChange={(e) =>
                    setNewHost({ ...newHost, country: e.target.value })
                  }
                  placeholder="US"
                />
              </FormControl>
              
              {/* Current Hosts */}
              {selectedWhitelist && whitelistHosts.length > 0 && (
                <Box>
                  <FormLabel>Current Hosts</FormLabel>
                  {isMobile ? (
                    <VStack align="stretch" spacing={2}>
                      {whitelistHosts.map((host) => (
                        <Box
                          key={host.host}
                          borderWidth="1px"
                          borderColor="gray.200"
                          _dark={{ borderColor: "gray.600" }}
                          borderRadius="md"
                          p={2}
                        >
                          <Flex justify="space-between" align="center">
                            <Text fontFamily="monospace" fontSize="sm" noOfLines={1}>
                              {host.host}
                            </Text>
                            <HStack>
                              <Badge colorScheme={host.is_active ? "green" : "red"}>
                                {host.is_active ? "Active" : "Inactive"}
                              </Badge>
                              <IconButton
                                aria-label="Delete"
                                icon={<DeleteIcon />}
                                colorScheme="red"
                                size="xs"
                                variant="ghost"
                                onClick={() => handleDeleteHost(host.host)}
                              />
                            </HStack>
                          </Flex>
                          <Text fontSize="sm" color="gray.600" mt={1} noOfLines={2}>
                            {host.description || "-"}
                          </Text>
                          <Text fontSize="sm" color="gray.500">
                            {host.country || "-"}
                          </Text>
                        </Box>
                      ))}
                    </VStack>
                  ) : (
                    <Box overflowX="auto">
                      <Table variant="simple" size="sm">
                        <Thead>
                          <Tr>
                            <Th>Host</Th>
                            <Th>Description</Th>
                            <Th>Country</Th>
                            <Th>Status</Th>
                            <Th>Actions</Th>
                          </Tr>
                        </Thead>
                        <Tbody>
                          {whitelistHosts.map((host) => (
                            <Tr key={host.host}>
                              <Td fontFamily="monospace">{host.host}</Td>
                              <Td fontSize="sm">{host.description || "-"}</Td>
                              <Td>{host.country || "-"}</Td>
                              <Td>
                                <Badge colorScheme={host.is_active ? "green" : "red"}>
                                  {host.is_active ? "Active" : "Inactive"}
                                </Badge>
                              </Td>
                              <Td>
                                <IconButton
                                  aria-label="Delete"
                                  icon={<DeleteIcon />}
                                  colorScheme="red"
                                  size="sm"
                                  onClick={() => handleDeleteHost(host.host)}
                                />
                              </Td>
                            </Tr>
                          ))}
                        </Tbody>
                      </Table>
                    </Box>
                  )}
                </Box>
              )}
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onClick={onHostClose}>
              Close
            </Button>
            <Button
              colorScheme="blue"
              onClick={handleAddHost}
              isLoading={loading}
            >
              Add Host
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Card>
  );
};

export default WhitelistManager;
