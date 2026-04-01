import {
  Badge,
  Box,
  Button,
  HStack,
  Spinner,
  Stack,
  Text,
  Textarea,
  VStack,
  useBreakpointValue,
  useToast,
} from "@chakra-ui/react";
import { ChatBubbleLeftRightIcon, PaperAirplaneIcon } from "@heroicons/react/24/outline";
import { chakra } from "@chakra-ui/react";
import { FC, useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "react-query";
import { fetch } from "service/http";
import { useAdminChatSummary } from "hooks/useAdminChatSummary";
import useGetUser from "hooks/useGetUser";
import { AdminChatMessage } from "types/AdminChat";

const ChatIcon = chakra(ChatBubbleLeftRightIcon, {
  baseStyle: { w: 5, h: 5 },
});
const SendIcon = chakra(PaperAirplaneIcon, {
  baseStyle: { w: 4, h: 4 },
});

const formatDateTime = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
};

export const AdminChatPage: FC = () => {
  const { t } = useTranslation();
  const toast = useToast();
  const { userData, getUserIsPending, getUserIsSuccess } = useGetUser();
  const { contacts, totalUnread, refetch: refetchContacts, isLoading: contactsLoading, isEnabled } =
    useAdminChatSummary();
  const [selectedUsername, setSelectedUsername] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const isMobile = useBreakpointValue({ base: true, lg: false }) ?? false;
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!contacts.length) {
      setSelectedUsername("");
      return;
    }
    setSelectedUsername((current) => {
      if (current && contacts.some((item) => item.username === current)) {
        return current;
      }
      return contacts[0]?.username || "";
    });
  }, [contacts]);

  const {
    data: messagesData,
    isLoading: messagesLoading,
    refetch: refetchMessages,
  } = useQuery<AdminChatMessage[]>({
    queryKey: ["admin-chat-messages", selectedUsername],
    queryFn: () => fetch(`/admin-chat/messages/${encodeURIComponent(selectedUsername)}`),
    enabled: isEnabled && !!selectedUsername,
    refetchInterval: selectedUsername ? 5000 : false,
    refetchOnWindowFocus: true,
    keepPreviousData: true,
    retry: 1,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesData, selectedUsername]);

  const selectedContact = useMemo(
    () => contacts.find((item) => item.username === selectedUsername) || null,
    [contacts, selectedUsername]
  );
  const messages = messagesData ?? [];

  const handleSend = async () => {
    const body = draft.trim();
    if (!body || !selectedUsername) return;

    setSending(true);
    try {
      await fetch(`/admin-chat/messages/${encodeURIComponent(selectedUsername)}`, {
        method: "POST",
        body: { body },
      });
      setDraft("");
      await Promise.all([refetchMessages(), refetchContacts()]);
    } catch (error: any) {
      toast({
        title: t("adminChat.sendError"),
        description: String(error?.response?._data?.detail || error?.message || error || ""),
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setSending(false);
    }
  };

  const handleDraftKeyDown = async (
    event: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (isMobile) return;
    if (event.key !== "Enter" || event.shiftKey) return;
    if ((event.nativeEvent as KeyboardEvent).isComposing) return;

    event.preventDefault();
    if (!draft.trim() || sending) return;
    await handleSend();
  };

  if (!getUserIsPending && !getUserIsSuccess) {
    return <Navigate to="/login/" replace />;
  }

  if (!isEnabled && !contactsLoading) {
    return <Navigate to="/" replace />;
  }

  return (
    <Box className="glass-card" p={{ base: 4, lg: 5 }} borderRadius="22px">
      <Stack
        direction={{ base: "column", lg: "row" }}
        align={{ base: "flex-start", lg: "center" }}
        justify="space-between"
        gap={3}
        mb={5}
      >
        <Box>
          <HStack spacing={3} mb={1}>
            <Box
              display="inline-flex"
              alignItems="center"
              justifyContent="center"
              w="42px"
              h="42px"
              borderRadius="14px"
              bg="var(--surface-soft)"
              border="1px solid var(--border)"
            >
              <ChatIcon />
            </Box>
            <Box>
              <Text fontSize="xl" fontWeight="700">
                {t("adminChat.title")}
              </Text>
              <Text color="var(--muted)" fontSize="sm">
                {t("adminChat.subtitle")}
              </Text>
            </Box>
          </HStack>
        </Box>

        <Badge
          px={3}
          py={1.5}
          borderRadius="full"
          bg="var(--surface-soft)"
          color="var(--text)"
          border="1px solid var(--border)"
        >
          {t("adminChat.unreadBadge", { count: totalUnread })}
        </Badge>
      </Stack>

      <Box
        display="grid"
        gridTemplateColumns={{ base: "1fr", lg: "320px minmax(0, 1fr)" }}
        gap={4}
        alignItems="stretch"
      >
        <Box
          border="1px solid var(--border)"
          borderRadius="18px"
          bg="var(--surface-soft)"
          p={3}
          maxH={{ base: "260px", lg: "620px" }}
          overflowY="auto"
        >
          <Text fontSize="sm" fontWeight="700" mb={3}>
            {t("adminChat.contacts")}
          </Text>

          {contactsLoading ? (
            <HStack py={8} justify="center">
              <Spinner size="sm" />
            </HStack>
          ) : contacts.length ? (
            <VStack align="stretch" spacing={2}>
              {contacts.map((contact) => {
                const active = contact.username === selectedUsername;
                return (
                  <Button
                    key={contact.username}
                    variant="ghost"
                    justifyContent="space-between"
                    alignItems="flex-start"
                    h="auto"
                    px={3}
                    py={3}
                    borderRadius="16px"
                    border="1px solid"
                    borderColor={active ? "primary.300" : "var(--border)"}
                    bg={active ? "rgba(59, 130, 246, 0.14)" : "transparent"}
                    onClick={() => setSelectedUsername(contact.username)}
                  >
                    <Box minW={0} textAlign="left">
                      <HStack spacing={2} mb={1}>
                        <Text fontWeight="700" noOfLines={1}>
                          {contact.username}
                        </Text>
                        <Badge colorScheme={contact.is_sudo ? "purple" : "gray"}>
                          {contact.is_sudo ? "sudo" : "admin"}
                        </Badge>
                      </HStack>
                      <Text fontSize="xs" color="var(--muted)" noOfLines={2}>
                        {contact.last_message || t("adminChat.noMessages")}
                      </Text>
                    </Box>
                    <VStack spacing={1} align="flex-end" pl={2}>
                      {contact.unread_count > 0 ? (
                        <Badge colorScheme="red" borderRadius="full" px={2}>
                          {contact.unread_count}
                        </Badge>
                      ) : null}
                      <Text fontSize="10px" color="var(--muted)" whiteSpace="nowrap">
                        {formatDateTime(contact.last_message_at)}
                      </Text>
                    </VStack>
                  </Button>
                );
              })}
            </VStack>
          ) : (
            <Text color="var(--muted)" fontSize="sm">
              {t("adminChat.noContacts")}
            </Text>
          )}
        </Box>

        <Box
          border="1px solid var(--border)"
          borderRadius="18px"
          bg="var(--surface-soft)"
          p={0}
          overflow="hidden"
          h={{ base: "72dvh", lg: "620px" }}
          minH={{ base: "520px", lg: "620px" }}
          display="flex"
          flexDirection="column"
          minW={0}
        >
          <HStack
            justify="space-between"
            px={4}
            py={3}
            borderBottom="1px solid var(--divider)"
            bg="rgba(255,255,255,0.02)"
          >
            <Box minW={0}>
              <Text fontWeight="700" noOfLines={1}>
                {selectedContact?.username || t("adminChat.pickContact")}
              </Text>
              <Text fontSize="xs" color="var(--muted)">
                {selectedContact
                  ? t("adminChat.chattingAs", { username: userData.username })
                  : t("adminChat.pickContactHint")}
              </Text>
            </Box>
            {selectedContact?.unread_count ? (
              <Badge colorScheme="red" borderRadius="full" px={2}>
                {selectedContact.unread_count}
              </Badge>
            ) : null}
          </HStack>

          <Box
            flex="1"
            minH={0}
            overflowY="auto"
            px={{ base: 3, lg: 4 }}
            py={4}
          >
            {selectedUsername ? (
              messagesLoading && !messages.length ? (
                <HStack justify="center" py={8}>
                  <Spinner size="sm" />
                </HStack>
              ) : messages.length ? (
                <VStack align="stretch" spacing={3}>
                  {messages.map((message) => (
                    <Box
                      key={message.id}
                      alignSelf={message.is_outgoing ? "flex-end" : "flex-start"}
                      maxW={{ base: "92%", md: "74%" }}
                      px={4}
                      py={3}
                      borderRadius="18px"
                      bg={
                        message.is_outgoing
                          ? "rgba(59, 130, 246, 0.16)"
                          : "rgba(255,255,255,0.04)"
                      }
                      border="1px solid"
                      borderColor={message.is_outgoing ? "primary.300" : "var(--border)"}
                    >
                      <Text whiteSpace="pre-wrap" wordBreak="break-word" fontSize="sm">
                        {message.body}
                      </Text>
                      <HStack
                        mt={2}
                        spacing={2}
                        justifyContent={message.is_outgoing ? "flex-end" : "flex-start"}
                      >
                        <Text fontSize="10px" color="var(--muted)">
                          {formatDateTime(message.created_at)}
                        </Text>
                        {message.is_outgoing ? (
                          <Text
                            fontSize="10px"
                            color={message.read_at ? "green.300" : "var(--muted)"}
                          >
                            {message.read_at
                              ? t("adminChat.statusRead")
                              : t("adminChat.statusSent")}
                          </Text>
                        ) : null}
                      </HStack>
                    </Box>
                  ))}
                  <Box ref={messagesEndRef} />
                </VStack>
              ) : (
                <HStack justify="center" py={12}>
                  <Text color="var(--muted)" fontSize="sm">
                    {t("adminChat.noMessagesYet")}
                  </Text>
                </HStack>
              )
            ) : (
              <HStack justify="center" py={12}>
                <Text color="var(--muted)" fontSize="sm">
                  {t("adminChat.pickContact")}
                </Text>
              </HStack>
            )}
          </Box>

          <Box borderTop="1px solid var(--divider)" px={{ base: 3, lg: 4 }} py={3}>
            <Stack direction={isMobile ? "column" : "row"} spacing={3} align="stretch">
              <Textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleDraftKeyDown}
                placeholder={t("adminChat.inputPlaceholder")}
                resize="none"
                rows={isMobile ? 4 : 3}
                isDisabled={!selectedUsername || sending}
              />
              <Button
                alignSelf={isMobile ? "stretch" : "flex-end"}
                minW={{ base: "full", md: "150px" }}
                h={{ base: "44px", md: "48px" }}
                leftIcon={<SendIcon />}
                onClick={handleSend}
                isLoading={sending}
                isDisabled={!selectedUsername || !draft.trim()}
              >
                {t("adminChat.send")}
              </Button>
            </Stack>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default AdminChatPage;
