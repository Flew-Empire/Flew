export type Admin = {
  username: string;
  is_sudo: boolean;
  is_disabled?: boolean;
  is_primary_sudo?: boolean;
  created_at?: string | null;
  telegram_id?: number | null;
  discord_webhook?: string | null;
  users_usage?: number | null;
  traffic_limit?: number | null;
  users_limit?: number | null;
  unique_ip_limit?: number | null;
  device_limit?: number | null;
  subscription_url_prefix?: string | null;
};
