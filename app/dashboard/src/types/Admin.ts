export type Admin = {
  username: string;
  is_sudo: boolean;
  telegram_id?: number | null;
  discord_webhook?: string | null;
  users_usage?: number | null;
  traffic_limit?: number | null;
  users_limit?: number | null;
};
