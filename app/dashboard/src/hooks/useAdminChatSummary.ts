import { useMemo } from "react";
import { useQuery } from "react-query";
import { fetch } from "service/http";
import { useFeatures } from "./useFeatures";
import useGetUser from "./useGetUser";
import { AdminChatContact } from "types/AdminChat";

export const useAdminChatSummary = () => {
  const { hasFeature } = useFeatures();
  const { userData, getUserIsSuccess } = useGetUser();
  const enabled = hasFeature("admin_chat") && getUserIsSuccess && !!userData.username;

  const query = useQuery<AdminChatContact[]>({
    queryKey: ["admin-chat-contacts"],
    queryFn: () => fetch("/admin-chat/contacts"),
    enabled,
    refetchInterval: 5000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const contacts = query.data || [];
  const totalUnread = useMemo(
    () => contacts.reduce((total, item) => total + Number(item.unread_count || 0), 0),
    [contacts]
  );

  return {
    ...query,
    contacts,
    totalUnread,
    isEnabled: enabled,
  };
};
