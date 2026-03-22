import { FC } from "react";
import { Text } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";

type SubscriptionStatusProps = {
  lastFetch: string | null | undefined;
};

const toUnixSeconds = (value: string | null | undefined): number | null => {
  if (!value) {
    return null;
  }
  const date = new Date(value + "Z");
  return Math.floor(date.getTime() / 1000);
};

const formatCompact = (seconds: number, lang: string): string => {
  const abs = Math.max(0, seconds);
  const d = Math.floor(abs / 86400);
  const h = Math.floor((abs % 86400) / 3600);
  const m = Math.floor((abs % 3600) / 60);

  const isRu = lang.startsWith("ru");
  const isFa = lang.startsWith("fa");
  const isZh = lang.startsWith("zh");

  const units = isRu
    ? { d: "д", h: "ч", m: "м" }
    : isFa
      ? { d: "روز", h: "س", m: "د" }
      : isZh
        ? { d: "天", h: "时", m: "分" }
        : { d: "d", h: "h", m: "m" };

  if (d > 0) {
    return `${d}${units.d} ${h}${units.h}`;
  }
  if (h > 0) {
    return `${h}${units.h} ${m}${units.m}`;
  }
  return `${Math.max(1, m)}${units.m}`;
};

export const SubscriptionStatus: FC<SubscriptionStatusProps> = ({ lastFetch }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || "en";

  const labelKey = "usersTable.lastSubscriptionFetch";
  const neverKey = "usersTable.never";

  const labelFallback = lang.startsWith("ru")
    ? "Запрос подписки"
    : lang.startsWith("fa")
      ? "دریافت اشتراک"
      : lang.startsWith("zh")
        ? "订阅获取"
        : "Sub fetch";

  const neverFallback = lang.startsWith("ru")
    ? "Нет"
    : lang.startsWith("fa")
      ? "هیچ‌وقت"
      : lang.startsWith("zh")
        ? "从未"
        : "Never";

  const label = t(labelKey) === labelKey ? labelFallback : t(labelKey);
  const never = t(neverKey) === neverKey ? neverFallback : t(neverKey);

  const unixTime = toUnixSeconds(lastFetch);
  const currentTimeInSeconds = Math.floor(Date.now() / 1000);
  const timeDiff = unixTime ? currentTimeInSeconds - unixTime : null;

  const timeText = timeDiff === null ? never : formatCompact(timeDiff, lang);

  return (
    <Text
      display="inline-block"
      fontSize="xs"
      fontWeight="medium"
      ml="2"
      color="gray.600"
      _dark={{
        color: "gray.400",
      }}
    >
      {label}: {timeText}
    </Text>
  );
};
