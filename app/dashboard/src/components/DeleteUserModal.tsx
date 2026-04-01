import {
  Button,
  chakra,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Spinner,
  Text,
  useToast,
} from "@chakra-ui/react";
import { TrashIcon } from "@heroicons/react/24/outline";
import { useDashboard } from "contexts/DashboardContext";
import { FC, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { Icon } from "./Icon";

export const DeleteIcon = chakra(TrashIcon, {
  baseStyle: {
    w: 5,
    h: 5,
  },
});

export type DeleteUserModalProps = {
  deleteCallback?: () => void;
};

export const DeleteUserModal: FC<DeleteUserModalProps> = () => {
  const [loading, setLoading] = useState(false);
  const { deletingUser: user, onDeletingUser, deleteUser } = useDashboard();
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const onClose = () => {
    if (loading) return;
    onDeletingUser(null);
  };
  const onDelete = async () => {
    if (!user || loading) {
      return;
    }

    const username = user.username;
    const shouldReturnToDashboard = location.pathname.startsWith("/subscription/");

    setLoading(true);
    try {
      await deleteUser(user);
      toast({
        title: t("deleteUser.deleteSuccess", { username }),
        status: "success",
        isClosable: true,
        position: "top",
        duration: 3000,
      });

      if (shouldReturnToDashboard) {
        navigate("/", { replace: true });
      }
    } catch (error) {
      toast({
        title: t("deleteUser.deleteError"),
        status: "error",
        isClosable: true,
        position: "top",
        duration: 3000,
      });
    } finally {
      setLoading(false);
    }
  };
  return (
    <Modal
      isCentered
      isOpen={!!user}
      onClose={onClose}
      size="sm"
      closeOnOverlayClick={!loading}
      closeOnEsc={!loading}
    >
      <ModalOverlay bg="blackAlpha.300" backdropFilter="blur(10px)" />
      <ModalContent mx="3">
        <ModalHeader pt={6}>
          <Icon color="red">
            <DeleteIcon />
          </Icon>
        </ModalHeader>
        <ModalCloseButton mt={3} />
        <ModalBody>
          <Text fontWeight="semibold" fontSize="lg">
            {t("deleteUser.title")}
          </Text>
          {user && (
            <Text
              mt={1}
              fontSize="sm"
              _dark={{ color: "gray.400" }}
              color="gray.600"
            >
              <Trans components={{ b: <b /> }}>
                {t("deleteUser.prompt", { username: user.username })}
              </Trans>
            </Text>
          )}
        </ModalBody>
        <ModalFooter display="flex">
          <Button
            size="sm"
            onClick={onClose}
            mr={3}
            w="full"
            variant="outline"
            isDisabled={loading}
          >
            {t("cancel")}
          </Button>
          <Button
            size="sm"
            w="full"
            colorScheme="red"
            onClick={onDelete}
            leftIcon={loading ? <Spinner size="xs" /> : undefined}
            isLoading={loading}
            isDisabled={!user || loading}
          >
            {t("delete")}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
