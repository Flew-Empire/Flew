export type AdminChatContact = {
  username: string;
  is_sudo: boolean;
  unread_count: number;
  last_message?: string | null;
  last_message_at?: string | null;
};

export type AdminChatMessage = {
  id: number;
  sender_username: string;
  recipient_username: string;
  body: string;
  created_at: string;
  read_at?: string | null;
  is_outgoing: boolean;
};

export type AdminChatPeer = {
  username: string;
  is_sudo: boolean;
};

export type AdminChatPermissionsResponse = {
  username: string;
  locked_reason?: string | null;
  assignable_admins: AdminChatPeer[];
  allowed_usernames: string[];
};
