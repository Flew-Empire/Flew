import { Badge, Text } from "@chakra-ui/react";

import { statusColors } from "constants/UserSettings";
import { FC } from "react";
import { useTranslation } from "react-i18next";
import { Status as UserStatusType } from "types/User";
import { relativeExpiryDate } from "utils/dateFormatter";

type UserStatusProps = {
  expiryDate?: number | null;
  status: UserStatusType;
  compact?: boolean;
  showDetail?: boolean;
  extraText?: string | null;
};
export const StatusBadge: FC<UserStatusProps> = ({
  expiryDate,
  status: userStatus,
  compact = false,
  showDetail = true,
  extraText,
}) => {
  const { t } = useTranslation();
  const dateInfo = relativeExpiryDate(expiryDate);
  const Icon = statusColors[userStatus].icon;
  return (
    <>
      <Badge
        colorScheme={statusColors[userStatus].statusColor}
        rounded="full"
        display="inline-flex"
        px={3}
        py={1}
        columnGap={compact ? 1 : 2}
        alignItems="center"
        _dark={
          userStatus === "active" || userStatus === "connected"
            ? {
                bg: "rgba(34,197,94,0.14)",
                color: "#86efac",
                border: "1px solid rgba(74,222,128,0.35)",
                boxShadow:
                  "0 0 4px rgba(74,222,128,0.34), 0 0 10px rgba(34,197,94,0.2)",
              }
            : userStatus === "expired"
            ? {
                bg: "rgba(251,146,60,0.14)",
                color: "#fdba74",
                border: "1px solid rgba(251,146,60,0.35)",
                boxShadow:
                  "0 0 4px rgba(251,146,60,0.34), 0 0 10px rgba(249,115,22,0.2)",
              }
            : undefined
        }
      >
        <Icon w={compact ? 3 : 4} />
        {showDetail && (
          <Text
            textTransform="capitalize"
            fontSize={compact ? ".7rem" : ".875rem"}
            lineHeight={compact ? "1rem" : "1.25rem"}
            fontWeight="medium"
            letterSpacing="tighter"
          >
            {userStatus && t(`status.${userStatus}`)}
            {extraText && `: ${extraText}`}
          </Text>
        )}
      </Badge>
      {showDetail && expiryDate && (
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
          {t(dateInfo.status, { time: dateInfo.time })}
        </Text>
      )}
    </>
  );
};
