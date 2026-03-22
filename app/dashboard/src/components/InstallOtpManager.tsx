import {
  Badge,
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
  Input,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useBreakpointValue,
  useToast,
} from "@chakra-ui/react";
import { FC, useEffect, useMemo, useState } from "react";
import { fetch } from "../service/http";

interface InstallOtp {
  id: number;
  code: string;
  created_at: string;
  expires_at: string;
  product?: string;
  bound_ip?: string | null;
  edition: string;
  used_at?: string | null;
  created_by_admin_username?: string | null;
  note?: string | null;
}

const DEFAULT_INSTALL_DOMAIN = "flew.mediatmshow.online";

const normalizeIso = (value?: string | null) => {
  if (!value) return "";
  const trimmed = String(value).trim();
  if (!trimmed) return "";
  if (/[zZ]$/.test(trimmed) || /[+-]\d\d:\d\d$/.test(trimmed)) return trimmed;
  return `${trimmed}Z`;
};

const parseDate = (value?: string | null) => {
  const iso = normalizeIso(value);
  if (!iso) return null;
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
};

const formatDateTime = (value?: string | null) => {
  const dt = parseDate(value);
  if (!dt) return value || "-";
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString();
};

const getStatus = (otp: InstallOtp) => {
  if (otp.used_at) return "used";
  const exp = parseDate(otp.expires_at)?.getTime();
  if (exp && exp <= Date.now()) return "expired";
  return "active";
};

const statusBadge = (status: string) => {
  if (status === "active") return { colorScheme: "green", label: "Active" };
  if (status === "used") return { colorScheme: "yellow", label: "Used" };
  return { colorScheme: "red", label: "Expired" };
};

const productLabel = (value?: string | null) => {
  const normalized = (value || "").toLowerCase();
  if (normalized === "marzban_patch") return "Marzban patch";
  if (normalized === "flew" || !normalized) return "Flew panel";
  return value || "-";
};

const buildInstallCommand = (otp: InstallOtp) => {
  const domain = DEFAULT_INSTALL_DOMAIN;
  const product = (otp.product || "flew").toLowerCase();
  if (product === "marzban_patch") {
    const editionValue = (otp.edition || "standard").toLowerCase();
    return [
      `curl -fsSL https://${domain}/api/install/marzban/script | bash -s --`,
      `--domain ${domain}`,
      `--otp ${otp.code}`,
      `--edition ${editionValue}`,
      `--target /opt/marzban`,
    ].join(" ");
  }
  const editionValue = (otp.edition || "standard").toLowerCase();
  return [
    `curl -fsSL https://${domain}/api/install/script | bash -s --`,
    `--domain ${domain}`,
    `--otp ${otp.code}`,
    `--edition ${editionValue}`,
  ].join(" ");
};

export const InstallOtpManager: FC = () => {
  const [otps, setOtps] = useState<InstallOtp[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [expiresIn, setExpiresIn] = useState("30");
  const [product, setProduct] = useState("flew");
  const [edition, setEdition] = useState("standard");
  const [boundIp, setBoundIp] = useState("");
  const [note, setNote] = useState("");
  const isMobile = useBreakpointValue({ base: true, md: false });
  const toast = useToast();

  const loadOtps = async () => {
    setLoading(true);
    try {
      const result = await fetch<InstallOtp[]>("/api/admin/install-otp", {
        method: "GET",
      });
      setOtps(Array.isArray(result) ? result : []);
    } catch (error) {
      toast({
        title: "Failed to load OTPs",
        status: "error",
        duration: 4000,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOtps();
  }, []);

  const handleCreate = async () => {
    const ttl = parseInt(expiresIn, 10);
    if (Number.isNaN(ttl) || ttl < 1 || ttl > 1440) {
      toast({
        title: "Invalid expiry",
        description: "Expires in minutes must be between 1 and 1440",
        status: "warning",
        duration: 4000,
      });
      return;
    }

    setCreating(true);
    try {
      const payload: Record<string, unknown> = {
        product,
        expires_in_minutes: ttl,
        bound_ip: boundIp || undefined,
        note: note || undefined,
      };
      payload.edition = edition;
      const result = await fetch<InstallOtp>("/api/admin/install-otp", {
        method: "POST",
        body: payload,
      });
      if (result?.code) {
        toast({
          title: "OTP generated",
          description: `Code: ${result.code}`,
          status: "success",
          duration: 5000,
          isClosable: true,
        });
      } else {
        toast({
          title: "OTP generated",
          status: "success",
          duration: 4000,
        });
      }
      setNote("");
      loadOtps();
    } catch (error) {
      toast({
        title: "Failed to generate OTP",
        status: "error",
        duration: 4000,
      });
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast({
        title: "Copied",
        status: "success",
        duration: 1500,
      });
    } catch (error) {
      toast({
        title: "Copy failed",
        status: "error",
        duration: 2000,
      });
    }
  };

  const handleCopyCommand = async (otp: InstallOtp) => {
    const command = buildInstallCommand(otp);
    try {
      await navigator.clipboard.writeText(command);
      toast({
        title: "Install command copied",
        status: "success",
        duration: 2000,
      });
    } catch (error) {
      toast({
        title: "Copy failed",
        status: "error",
        duration: 2000,
      });
    }
  };

  const handleDelete = async (otp: InstallOtp) => {
    if (!otp?.id) return;
    const confirmed = window.confirm(`Delete OTP ${otp.code}?`);
    if (!confirmed) return;
    setDeletingId(otp.id);
    try {
      await fetch(`/api/admin/install-otp/${otp.id}`, { method: "DELETE" });
      setOtps((prev) => prev.filter((item) => item.id !== otp.id));
      toast({
        title: "OTP deleted",
        status: "success",
        duration: 2000,
      });
    } catch (error) {
      toast({
        title: "Failed to delete OTP",
        status: "error",
        duration: 3000,
      });
    } finally {
      setDeletingId(null);
    }
  };

  const items = useMemo(() => otps || [], [otps]);

  return (
    <Card mt="4">
      <CardHeader>
        <Stack
          direction={{ base: "column", md: "row" }}
          justify="space-between"
          align={{ base: "stretch", md: "center" }}
          spacing={3}
        >
          <Heading size="md">Installation OTP</Heading>
          <Flex wrap="wrap" gap={2} justify={{ base: "flex-start", md: "flex-end" }}>
            <Button onClick={loadOtps} variant="outline" size="sm" isLoading={loading}>
              Refresh
            </Button>
          </Flex>
        </Stack>
      </CardHeader>
      <CardBody>
        <SimpleGrid columns={{ base: 1, md: 6 }} spacing={4} mb={4}>
          <FormControl>
            <FormLabel>Expires in (minutes)</FormLabel>
            <Input
              type="number"
              min={1}
              max={1440}
              value={expiresIn}
              onChange={(e) => setExpiresIn(e.target.value)}
            />
          </FormControl>
          <FormControl>
            <FormLabel>Product</FormLabel>
            <Select value={product} onChange={(e) => setProduct(e.target.value)}>
              <option value="flew">Flew panel</option>
              <option value="marzban_patch">Marzban patch</option>
            </Select>
          </FormControl>
          <FormControl>
            <FormLabel>Edition</FormLabel>
            <Select value={edition} onChange={(e) => setEdition(e.target.value)}>
              <option value="standard">Standard</option>
              <option value="full">Full</option>
              <option value="custom">Custom</option>
            </Select>
          </FormControl>
          <FormControl>
            <FormLabel>Bound IP (optional)</FormLabel>
            <Input
              placeholder="1.2.3.4 or 2001:db8::1"
              value={boundIp}
              onChange={(e) => setBoundIp(e.target.value)}
            />
          </FormControl>
          <FormControl>
            <FormLabel>Note (optional)</FormLabel>
            <Input
              placeholder="Client or server note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </FormControl>
          <FormControl>
            <FormLabel>&nbsp;</FormLabel>
            <Button
              colorScheme="purple"
              onClick={handleCreate}
              isLoading={creating}
              w="full"
            >
              Generate OTP
            </Button>
          </FormControl>
        </SimpleGrid>

        {items.length === 0 ? (
          <Text color="gray.500">No OTPs generated yet.</Text>
        ) : isMobile ? (
          <Stack spacing={3}>
            {items.map((otp) => {
              const status = getStatus(otp);
              const badge = statusBadge(status);
              const installCommand = buildInstallCommand(otp);
              return (
                <Box
                  key={otp.id}
                  borderWidth="1px"
                  borderColor="gray.200"
                  _dark={{ borderColor: "gray.600" }}
                  borderRadius="md"
                  p={3}
                >
                  <Flex justify="space-between" align="center" mb={2}>
                    <Text fontWeight="semibold">{otp.code}</Text>
                    <Badge colorScheme={badge.colorScheme}>{badge.label}</Badge>
                  </Flex>
                  <Text fontSize="sm" color="gray.500">
                    Expires: {formatDateTime(otp.expires_at)}
                  </Text>
                  <Text fontSize="sm" color="gray.500">
                    Created: {formatDateTime(otp.created_at)}
                  </Text>
                  <Text fontSize="sm" color="gray.500">
                    Product: {productLabel(otp.product)}
                  </Text>
                  <Text fontSize="sm" color="gray.500">
                    Bound IP: {otp.bound_ip || "-"}
                  </Text>
                  <Text fontSize="sm" color="gray.500">
                    Edition: {otp.edition || "-"}
                  </Text>
                {otp.note && (
                    <Text fontSize="sm" color="gray.500">
                      Note: {otp.note}
                    </Text>
                  )}
                  <Text
                    fontSize="xs"
                    color="gray.500"
                    mt={2}
                    fontFamily="mono"
                    wordBreak="break-all"
                  >
                    {installCommand}
                  </Text>
                  <HStack mt={2} spacing={2} flexWrap="wrap">
                    <Button
                      size="xs"
                      variant="outline"
                      colorScheme="red"
                      isLoading={deletingId === otp.id}
                      onClick={() => handleDelete(otp)}
                    >
                      Delete
                    </Button>
                    <Button size="xs" variant="outline" onClick={() => handleCopy(otp.code)}>
                      Copy OTP
                    </Button>
                    <Button size="xs" variant="outline" onClick={() => handleCopyCommand(otp)}>
                      Copy Install
                    </Button>
                  </HStack>
                </Box>
              );
            })}
          </Stack>
        ) : (
          <Box overflowX="auto">
            <Table variant="simple" size="sm">
              <Thead>
                <Tr>
                  <Th>Code</Th>
                  <Th>Status</Th>
                  <Th>Product</Th>
                  <Th>Bound IP</Th>
                  <Th>Edition</Th>
                  <Th>Expires</Th>
                  <Th>Created</Th>
                  <Th>Install</Th>
                  <Th>Note</Th>
                  <Th>Admin</Th>
                  <Th></Th>
                </Tr>
              </Thead>
              <Tbody>
                {items.map((otp) => {
                  const status = getStatus(otp);
                  const badge = statusBadge(status);
                  const installCommand = buildInstallCommand(otp);
                  return (
                    <Tr key={otp.id}>
                      <Td fontWeight="semibold">{otp.code}</Td>
                      <Td>
                        <Badge colorScheme={badge.colorScheme}>{badge.label}</Badge>
                      </Td>
                      <Td>{productLabel(otp.product)}</Td>
                      <Td>{otp.bound_ip || "-"}</Td>
                      <Td>{otp.edition || "-"}</Td>
                      <Td>{formatDateTime(otp.expires_at)}</Td>
                      <Td>{formatDateTime(otp.created_at)}</Td>
                      <Td maxW="360px">
                        <Text fontSize="xs" fontFamily="mono" wordBreak="break-all">
                          {installCommand}
                        </Text>
                      </Td>
                      <Td>{otp.note || "-"}</Td>
                      <Td>{otp.created_by_admin_username || "-"}</Td>
                      <Td>
                        <HStack spacing={2}>
                          <Button
                            size="xs"
                            variant="outline"
                            colorScheme="red"
                            isLoading={deletingId === otp.id}
                            onClick={() => handleDelete(otp)}
                          >
                            Delete
                          </Button>
                          <Button size="xs" variant="outline" onClick={() => handleCopy(otp.code)}>
                            Copy
                          </Button>
                          <Button size="xs" variant="outline" onClick={() => handleCopyCommand(otp)}>
                            Copy Install
                          </Button>
                        </HStack>
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          </Box>
        )}
      </CardBody>
    </Card>
  );
};
