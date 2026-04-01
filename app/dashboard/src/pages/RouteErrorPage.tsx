import { Box, Button, HStack, Text, VStack } from "@chakra-ui/react";
import { FC } from "react";
import { useNavigate, useRouteError } from "react-router-dom";

export const RouteErrorPage: FC = () => {
  const navigate = useNavigate();
  const error = useRouteError() as any;
  const status = error?.status || error?.response?.status;
  const message =
    error?.data?.message ||
    error?.data?.detail ||
    error?.message ||
    "Temporary navigation error";

  return (
    <Box minH="60vh" display="flex" alignItems="center" justifyContent="center" px={6}>
      <VStack
        spacing={4}
        maxW="520px"
        w="full"
        p={6}
        borderRadius="24px"
        bg="var(--surface-elevated)"
        border="1px solid var(--border)"
        textAlign="center"
      >
        <Text fontSize="2xl" fontWeight="700">
          {status === 401 || status === 403 ? "Session expired" : "Page error"}
        </Text>
        <Text color="var(--muted)">
          {status === 401 || status === 403
            ? "Please sign in again."
            : message}
        </Text>
        <HStack spacing={3}>
          <Button size="sm" variant="outline" onClick={() => navigate(-1)}>
            Back
          </Button>
          <Button size="sm" colorScheme="primary" onClick={() => navigate("/", { replace: true })}>
            Dashboard
          </Button>
        </HStack>
      </VStack>
    </Box>
  );
};

export default RouteErrorPage;
