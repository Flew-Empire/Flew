import { Box, HStack, Spinner } from "@chakra-ui/react";
import { Dashboard } from "pages/Dashboard";
import { useDashboard } from "contexts/DashboardContext";
import { fetch } from "service/http";
import { FC, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

export const SubscriptionEditorPage: FC = () => {
  const { username = "" } = useParams();
  const navigate = useNavigate();
  const { editingUser, onEditingUser } = useDashboard();
  const [isLoading, setIsLoading] = useState(true);
  const [hasOpenedRouteEditor, setHasOpenedRouteEditor] = useState(false);

  useEffect(() => {
    let alive = true;

    const openEditor = async () => {
      try {
        setIsLoading(true);
        const user = await fetch(`/user/${encodeURIComponent(username)}`);
        if (!alive) return;
        onEditingUser(user);
        setHasOpenedRouteEditor(true);
      } catch (error) {
        console.error("Failed to load user for subscription editor:", error);
        if (alive) navigate("/", { replace: true });
      } finally {
        if (alive) setIsLoading(false);
      }
    };

    openEditor();

    return () => {
      alive = false;
      onEditingUser(null);
    };
  }, [navigate, onEditingUser, username]);

  useEffect(() => {
    if (!isLoading && hasOpenedRouteEditor && editingUser === null) {
      navigate("/", { replace: true });
    }
  }, [editingUser, hasOpenedRouteEditor, isLoading, navigate]);

  return (
    <Box minW={0}>
      {isLoading && (
        <HStack justifyContent="center" py={8}>
          <Spinner size="sm" color="primary.300" />
        </HStack>
      )}
      <Dashboard />
    </Box>
  );
};

export default SubscriptionEditorPage;
