import { Box } from "@chakra-ui/react";
import { FC } from "react";

type UserStatusProps = {
  lastOnline?: string | null;
  lastFetch?: string | null;
  firstFetch?: string | null;
};

const toUnixSeconds = (value?: string | null): number | null => {
  if (!value) return null;
  const date = new Date(`${value}Z`);
  return Math.floor(date.getTime() / 1000);
};

export const OnlineBadge: FC<UserStatusProps> = ({
  lastOnline,
  lastFetch,
  firstFetch,
}) => {
  const currentTimeInSeconds = Math.floor(Date.now() / 1000);
  const onlineUnix = toUnixSeconds(lastOnline);
  const lastFetchUnix = toUnixSeconds(lastFetch);
  const firstFetchUnix = toUnixSeconds(firstFetch);

  if (!lastOnline && !lastFetch && !firstFetch) {
    return (
      <Box
        border="1px solid"
        borderColor="gray.400"
        _dark={{ borderColor: "gray.600" }}
        className="circle"
      />
    );
  }

  if (onlineUnix !== null) {
    const timeDifferenceInSeconds = currentTimeInSeconds - onlineUnix;
    if (timeDifferenceInSeconds <= 60) {
      return (
        <Box
          bg="green.300"
          _dark={{ bg: "green.500" }}
          className="circle pulse green"
        />
      );
    }
  }

  // First-ever subscription fetch (only once) = blue
  if (firstFetchUnix !== null && lastFetchUnix !== null && firstFetchUnix === lastFetchUnix) {
    return (
      <Box
        bg="blue.400"
        _dark={{ bg: "blue.500" }}
        className="circle"
      />
    );
  }

  // Any subscription fetch = light blue
  if (lastFetchUnix !== null) {
    return (
      <Box
        bg="cyan.300"
        _dark={{ bg: "cyan.500" }}
        className="circle"
      />
    );
  }

  return <Box bg="gray.400" _dark={{ bg: "gray.600" }} className="circle" />;
};
