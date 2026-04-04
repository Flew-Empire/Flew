import { Box, HStack, Spinner } from "@chakra-ui/react";
import { UserDialog } from "components/UserDialog";
import { useDashboard } from "contexts/DashboardContext";
import { fetch } from "service/http";
import { FC, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  clearPrefetchedUserEditor,
  getPrefetchedUserEditor,
  isUserEditorNotFoundError,
  isUserEditorUnavailableError,
} from "utils/userEditorPrefetch";

export const SubscriptionEditorPage: FC = () => {
  const { username = "" } = useParams();
  const navigate = useNavigate();
  const { onCreateUser, onEditingUser } = useDashboard();
  const [isLoading, setIsLoading] = useState(true);
  const isCreateMode = username.length === 0;

  useEffect(() => {
    let alive = true;

    if (isCreateMode) {
      onCreateUser(true);
      onEditingUser(null);
      setIsLoading(false);
      return () => {
        alive = false;
        onCreateUser(false);
        onEditingUser(null);
      };
    }

    const openEditor = async () => {
      const prefetchedUser = getPrefetchedUserEditor(username);
      if (prefetchedUser) {
        onEditingUser(prefetchedUser);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const user = await fetch(`/user/${encodeURIComponent(username)}`, {
          ...({ silent404: true, silent403: true } as any),
        });
        if (!alive) return;
        onEditingUser(user);
      } catch (error) {
        if (!isUserEditorUnavailableError(error)) {
          console.error("Failed to load user for subscription editor:", error);
        }
        if (alive) navigate("/", { replace: true });
      } finally {
        if (alive) {
          setIsLoading(false);
        }
      }
    };

    openEditor();

    return () => {
      alive = false;
      onCreateUser(false);
      onEditingUser(null);
      if (!isCreateMode) {
        clearPrefetchedUserEditor(username);
      }
    };
  }, [isCreateMode, navigate, onCreateUser, onEditingUser, username]);

  return (
    <Box minW={0}>
      {isLoading && (
        <HStack justifyContent="center" py={8}>
          <Spinner size="sm" color="primary.300" />
        </HStack>
      )}
      {!isLoading && <UserDialog mode="page" />}
    </Box>
  );
};

export default SubscriptionEditorPage;
