import {
  Accordion,
  AccordionButton,
  AccordionItem,
  AccordionPanel,
  Box,
  Button,
  HStack,
  IconButton,
  SimpleGrid,
  Slider,
  SliderFilledTrack,
  SliderProps,
  SliderTrack,
  Switch,
  Table,
  TableProps,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tooltip,
  Tr,
  VStack,
  chakra,
  useBreakpointValue,
  useToast,
} from "@chakra-ui/react";
import {
  CheckIcon,
  ChevronDownIcon,
  LinkIcon,
  PencilIcon,
  QrCodeIcon,
  Squares2X2Icon,
} from "@heroicons/react/24/outline";
import { ReactComponent as AddFileIcon } from "assets/add_file.svg";
import classNames from "classnames";
import { resetStrategy, statusColors } from "constants/UserSettings";
import { useDashboard } from "contexts/DashboardContext";
import { t } from "i18next";
import { FC, useEffect, useMemo, useState } from "react";
import CopyToClipboard from "react-copy-to-clipboard";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { User, UserCreate } from "types/User";
import { formatBytes } from "utils/formatByte";
import { OnlineBadge } from "./OnlineBadge";
import { Pagination } from "./Pagination";
import { StatusBadge } from "./StatusBadge";

const EmptySectionIcon = chakra(AddFileIcon);

const iconProps = {
  baseStyle: {
    w: {
      base: 4,
      md: 5,
    },
    h: {
      base: 4,
      md: 5,
    },
  },
};

const AccordionArrowIcon = chakra(ChevronDownIcon, iconProps);
const CopiedIcon = chakra(CheckIcon, iconProps);
const SubscriptionLinkIcon = chakra(LinkIcon, iconProps);
const ConfigsIcon = chakra(Squares2X2Icon, iconProps);
const QRIcon = chakra(QrCodeIcon, iconProps);
const EditIcon = chakra(PencilIcon, iconProps);
const SortIcon = chakra(ChevronDownIcon, {
  baseStyle: {
    width: "15px",
    height: "15px",
  },
});

type UsageSliderProps = {
  used: number;
  total: number | null;
  dataLimitResetStrategy: string | null;
  totalUsedTraffic: number;
} & SliderProps;

type UserSwitchHandler = (user: User, nextEnabled: boolean) => Promise<void>;

const getResetStrategy = (strategy: string): string => {
  for (let i = 0; i < resetStrategy.length; i += 1) {
    const entry = resetStrategy[i];
    if (entry.value === strategy) {
      return entry.title;
    }
  }
  return "No";
};

const UsageSlider: FC<UsageSliderProps> = (props) => {
  const {
    used,
    total,
    dataLimitResetStrategy,
    totalUsedTraffic,
    ...restOfProps
  } = props;
  const isUnlimited = total === 0 || total === null;
  const isReached = !isUnlimited && (used / total) * 100 >= 100;
  const limitText = isUnlimited
    ? "Unlimited"
    : formatBytes(total) +
      (dataLimitResetStrategy && dataLimitResetStrategy !== "no_reset"
        ? " " + t("userDialog.resetStrategy" + getResetStrategy(dataLimitResetStrategy))
        : "");

  return (
    <>
      <Slider
        orientation="horizontal"
        value={isUnlimited ? 100 : Math.min((used / total) * 100, 100)}
        colorScheme={isReached ? "red" : "primary"}
        {...restOfProps}
      >
        <SliderTrack h="6px" borderRadius="full">
          <SliderFilledTrack borderRadius="full" />
        </SliderTrack>
      </Slider>
      <HStack
        justifyContent="space-between"
        fontSize="xs"
        fontWeight="medium"
        color="gray.600"
        _dark={{
          color: "gray.400",
        }}
        alignItems="flex-start"
      >
        <Text>{formatBytes(used)} / {limitText}</Text>
        <Text textAlign="right">
          {t("usersTable.total")}: {formatBytes(totalUsedTraffic)}
        </Text>
      </HStack>
    </>
  );
};

export type SortType = {
  sort: string;
  column: string;
};

export const Sort: FC<SortType> = ({ sort, column }) => {
  if (sort.includes(column)) {
    return (
      <SortIcon
        transform={sort.startsWith("-") ? undefined : "rotate(180deg)"}
      />
    );
  }
  return null;
};

const toUnixTime = (value?: string | null): number | null => {
  if (!value) return null;
  const normalized = value.endsWith("Z") ? value : `${value}Z`;
  const timestamp = new Date(normalized).getTime();
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : null;
};

const getUserInitials = (username: string) => {
  const parts = username
    .split(/[\s._-]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return "U";
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
};

const formatTrafficSummary = (user: User) => {
  const limit =
    user.data_limit === 0 || user.data_limit === null
      ? "Unlimited"
      : formatBytes(user.data_limit);
  return `${formatBytes(user.used_traffic)} / ${limit}`;
};

const formatLocalDate = (value: string | null | undefined, fallback: string) => {
  if (!value) return fallback;
  const normalized = value.endsWith("Z") ? value : `${value}Z`;
  const timestamp = new Date(normalized);
  if (Number.isNaN(timestamp.getTime())) return fallback;
  return timestamp.toLocaleString();
};

const formatRelativeShort = (
  value: string | null | undefined,
  fallback: string
) => {
  const unixTime = toUnixTime(value);
  if (!unixTime) return fallback;

  const diff = Math.max(0, Math.floor(Date.now() / 1000) - unixTime);
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)}m`;
};

const getConnectionIndicator = (user: User) => {
  const now = Math.floor(Date.now() / 1000);
  const onlineAt = toUnixTime(user.online_at);
  if (onlineAt && now - onlineAt <= 60) return "Online";
  if (user.sub_updated_at || user.first_sub_fetch_at) return "Fetched";
  return "Not fetched";
};

const getStatusLabel = (
  translate: (key: string) => any,
  status: User["status"]
) => {
  const key = `status.${status}`;
  const translated = translate(key);
  return translated === key ? status : translated;
};

const buildUserPayload = (user: User, status: User["status"]): UserCreate => ({
  username: user.username,
  proxies: user.proxies,
  inbounds: user.inbounds,
  expire: user.expire,
  data_limit: user.data_limit,
  data_limit_reset_strategy: user.data_limit_reset_strategy,
  on_hold_expire_duration: user.on_hold_expire_duration,
  status,
  note: user.note,
});

const MobileMetaCard: FC<{ label: string; value: string }> = ({ label, value }) => {
  return (
    <Box className="mobile-user-meta-card">
      <Text className="mobile-user-meta-label">{label}</Text>
      <Text className="mobile-user-meta-value">{value}</Text>
    </Box>
  );
};

const StateSwitch: FC<{
  user: User;
  isLoading?: boolean;
  onToggle: UserSwitchHandler;
  compact?: boolean;
}> = ({ user, isLoading = false, onToggle, compact = false }) => {
  const { t: translate } = useTranslation();
  const isEnabled = user.status !== "disabled";
  const label = translate(isEnabled ? "status.active" : "status.disabled");

  return (
    <HStack
      spacing={compact ? 2 : 3}
      className={compact ? "mobile-user-pill mobile-user-switch-pill" : "desktop-user-switch"}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <Text
        fontSize={compact ? "10px" : "xs"}
        fontWeight="700"
        color={isEnabled ? "#86efac" : "#fda4af"}
      >
        {label}
      </Text>
      <Switch
        size={compact ? "sm" : "md"}
        colorScheme="primary"
        isChecked={isEnabled}
        isDisabled={isLoading}
        onChange={(event) => onToggle(user, event.target.checked)}
      />
    </HStack>
  );
};

type MobileUsersListProps = {
  users: User[];
  isFiltered: boolean;
  onNavigateToEdit: (user: User) => void;
  onToggleStatus: UserSwitchHandler;
  togglingUsers: Record<string, boolean>;
};

const MobileUsersList: FC<MobileUsersListProps> = ({
  users,
  isFiltered,
  onNavigateToEdit,
  onToggleStatus,
  togglingUsers,
}) => {
  const { t: translate } = useTranslation();

  if (!users.length) {
    return (
      <Box display={{ base: "block", md: "none" }}>
        <EmptySection isFiltered={isFiltered} />
      </Box>
    );
  }

  return (
    <Accordion allowToggle display={{ base: "block", md: "none" }}>
      <VStack spacing={3} align="stretch">
        {users.map((user) => {
          const lastOnline = formatLocalDate(user.online_at, "Not connected yet");
          const lastFetch = formatLocalDate(
            user.sub_updated_at,
            translate("usersTable.never")
          );
          const firstFetch = formatLocalDate(
            user.first_sub_fetch_at,
            translate("usersTable.never")
          );

          return (
            <AccordionItem key={user.username} border="0">
              {({ isExpanded }) => (
                <Box className="mobile-user-card">
                  <AccordionButton
                    px={0}
                    py={0}
                    _hover={{ bg: "transparent" }}
                    _expanded={{ bg: "transparent" }}
                  >
                    <Box className="mobile-user-card-shell" w="full">
                      <HStack
                        w="full"
                        justifyContent="space-between"
                        alignItems="flex-start"
                        spacing={3}
                      >
                        <HStack spacing={3} alignItems="flex-start" minW={0} flex="1">
                          <Box className="mobile-user-avatar">
                            {getUserInitials(user.username)}
                          </Box>
                          <VStack align="flex-start" spacing={1} minW={0} flex="1">
                            <Text fontSize="sm" fontWeight="700" noOfLines={1}>
                              {user.username}
                            </Text>
                            <HStack spacing={2} flexWrap="wrap">
                              <HStack className="mobile-user-pill" spacing={2}>
                                <OnlineBadge
                                  lastOnline={user.online_at}
                                  lastFetch={user.sub_updated_at}
                                  firstFetch={user.first_sub_fetch_at}
                                />
                                <Text fontSize="10px" fontWeight="600">
                                  {getConnectionIndicator(user)}
                                </Text>
                              </HStack>
                              <Text className="mobile-user-pill">
                                {getStatusLabel(translate, user.status)}
                              </Text>
                              <StateSwitch
                                compact
                                user={user}
                                isLoading={!!togglingUsers[user.username]}
                                onToggle={onToggleStatus}
                              />
                            </HStack>
                          </VStack>
                        </HStack>

                        <VStack align="flex-end" spacing={2} flexShrink={0}>
                          <Text
                            fontSize="xs"
                            fontWeight="700"
                            textAlign="right"
                            maxW="92px"
                            lineHeight="1.3"
                          >
                            {formatTrafficSummary(user)}
                          </Text>
                          <Box className="mobile-user-toggle">
                            <AccordionArrowIcon
                              transform={isExpanded ? "rotate(180deg)" : "rotate(0deg)"}
                            />
                          </Box>
                        </VStack>
                      </HStack>
                    </Box>
                  </AccordionButton>

                  <AccordionPanel px={0} pt={2} pb={0}>
                    <VStack align="stretch" spacing={3}>
                      <Box className="mobile-user-expanded">
                        <HStack justifyContent="space-between" mb={3} flexWrap="wrap">
                          <StatusBadge
                            compact
                            expiryDate={user.expire}
                            status={user.status}
                          />
                          <Text
                            fontSize="xs"
                            fontWeight="600"
                            color="gray.500"
                            _dark={{ color: "gray.400" }}
                          >
                            {translate("usersTable.total")}:{" "}
                            {formatBytes(user.lifetime_used_traffic)}
                          </Text>
                        </HStack>

                        <UsageSlider
                          totalUsedTraffic={user.lifetime_used_traffic}
                          dataLimitResetStrategy={user.data_limit_reset_strategy}
                          used={user.used_traffic}
                          total={user.data_limit}
                          colorScheme={statusColors[user.status].bandWidthColor}
                        />

                        <SimpleGrid columns={2} spacing={2} mt={3}>
                          <MobileMetaCard label={translate("onlineNow")} value={lastOnline} />
                          <MobileMetaCard
                            label={translate("usersTable.lastSubscriptionFetch")}
                            value={lastFetch}
                          />
                          <MobileMetaCard label="First Fetch" value={firstFetch} />
                          <MobileMetaCard
                            label={translate("usersTable.dataUsage")}
                            value={formatTrafficSummary(user)}
                          />
                        </SimpleGrid>

                        <HStack
                          mt={3}
                          justifyContent="space-between"
                          alignItems="center"
                          spacing={3}
                          flexWrap="wrap"
                        >
                          <ActionButtons user={user} />
                          <Button
                            size="xs"
                            colorScheme="primary"
                            leftIcon={<EditIcon />}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              onNavigateToEdit(user);
                            }}
                          >
                            {translate("userDialog.editUser")}
                          </Button>
                        </HStack>
                      </Box>
                    </VStack>
                  </AccordionPanel>
                </Box>
              )}
            </AccordionItem>
          );
        })}
      </VStack>
    </Accordion>
  );
};

type DesktopUserCellProps = {
  user: User;
};

const DesktopUserCell: FC<DesktopUserCellProps> = ({ user }) => {
  const { t: translate } = useTranslation();

  return (
    <VStack align="flex-start" spacing={2}>
      <HStack spacing={3} minW={0}>
        <OnlineBadge
          lastOnline={user.online_at}
          lastFetch={user.sub_updated_at}
          firstFetch={user.first_sub_fetch_at}
        />
        <Text fontWeight="700" noOfLines={1}>
          {user.username}
        </Text>
      </HStack>
      <HStack spacing={2} flexWrap="wrap" className="desktop-user-indicators">
        <HStack className="mobile-user-pill" spacing={2}>
          <OnlineBadge
            lastOnline={user.online_at}
            lastFetch={user.sub_updated_at}
            firstFetch={user.first_sub_fetch_at}
          />
          <Text fontSize="10px" fontWeight="600">
            {getConnectionIndicator(user)}
          </Text>
        </HStack>
        <Text className="mobile-user-pill">
          Fetch{" "}
          {formatRelativeShort(user.sub_updated_at, translate("usersTable.never"))}
        </Text>
      </HStack>
    </VStack>
  );
};

type UsersTableProps = {} & TableProps;

export const UsersTable: FC<UsersTableProps> = (props) => {
  const {
    filters,
    users: { users, total },
    onEditingUser,
    onFilterChange,
    editUser,
  } = useDashboard();

  const { t: translate } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const marginTop = useBreakpointValue({ base: 120, lg: 72 }) || 72;
  const [top, setTop] = useState(`${marginTop}px`);
  const [togglingUsers, setTogglingUsers] = useState<Record<string, boolean>>({});
  const useTable = useBreakpointValue({ base: false, md: true });

  useEffect(() => {
    const calcTop = () => {
      const el = document.querySelector("#filters") as HTMLElement | null;
      if (!el) return;
      setTop(`${el.offsetHeight}px`);
    };

    calcTop();
    window.addEventListener("scroll", calcTop);
    window.addEventListener("resize", calcTop);
    return () => {
      window.removeEventListener("scroll", calcTop);
      window.removeEventListener("resize", calcTop);
    };
  }, []);

  const isFiltered = users?.length !== total;

  const handleSort = (column: string) => {
    let newSort = filters.sort;
    if (newSort.includes(column)) {
      if (newSort.startsWith("-")) {
        newSort = "-created_at";
      } else {
        newSort = "-" + column;
      }
    } else {
      newSort = column;
    }
    onFilterChange({
      sort: newSort,
    });
  };

  const handleToggleStatus = async (user: User, nextEnabled: boolean) => {
    setTogglingUsers((current) => ({ ...current, [user.username]: true }));
    try {
      await editUser(buildUserPayload(user, nextEnabled ? "active" : "disabled"));
      toast({
        title: nextEnabled ? "Subscription enabled" : "Subscription disabled",
        status: "success",
        duration: 1800,
        isClosable: true,
      });
    } catch (error) {
      toast({
        title: "Unable to update subscription",
        description: error instanceof Error ? error.message : undefined,
        status: "error",
        duration: 2500,
        isClosable: true,
      });
    } finally {
      setTogglingUsers((current) => {
        const nextState = { ...current };
        delete nextState[user.username];
        return nextState;
      });
    }
  };

  const statusHeaderLabel = useMemo(() => {
    const expiryLabel = translate("userDialog.expire");
    const resolvedExpiry =
      expiryLabel === "userDialog.expire" ? "Expiry" : expiryLabel;
    return `${translate("usersTable.status")} / ${resolvedExpiry} / State`;
  }, [translate]);

  return (
    <Box id="users-table" overflowX={{ base: "unset", md: "unset" }}>
      <MobileUsersList
        users={users || []}
        isFiltered={isFiltered}
        onNavigateToEdit={(user) =>
          navigate(`/subscription/${encodeURIComponent(user.username)}/`)
        }
        onToggleStatus={handleToggleStatus}
        togglingUsers={togglingUsers}
      />
      <Table
        orientation="vertical"
        display={{ base: "none", md: "table" }}
        {...props}
      >
        <Thead zIndex="docked" position="relative">
          <Tr>
            <Th
              position="sticky"
              top={{ base: "unset", md: top }}
              minW="230px"
              cursor="pointer"
              onClick={handleSort.bind(null, "username")}
            >
              <HStack>
                <span>{translate("username")}</span>
                <Sort sort={filters.sort} column="username" />
              </HStack>
            </Th>
            <Th
              position="sticky"
              top={{ base: "unset", md: top }}
              width="420px"
              minW="280px"
              cursor="pointer"
              onClick={handleSort.bind(null, "expire")}
            >
              <HStack>
                <Text>{statusHeaderLabel}</Text>
                <Sort sort={filters.sort} column="expire" />
              </HStack>
            </Th>
            <Th
              position="sticky"
              top={{ base: "unset", md: top }}
              width="350px"
              minW="230px"
              cursor="pointer"
              onClick={handleSort.bind(null, "used_traffic")}
            >
              <HStack>
                <span>{translate("usersTable.dataUsage")}</span>
                <Sort sort={filters.sort} column="used_traffic" />
              </HStack>
            </Th>
            <Th
              position="sticky"
              top={{ base: "unset", md: top }}
              width="210px"
              minW="190px"
            >
              Actions
            </Th>
          </Tr>
        </Thead>
        <Tbody>
          {useTable &&
            users?.map((user, i) => (
              <Tr
                key={user.username}
                className={classNames("interactive", {
                  "last-row": i === (users?.length || 0) - 1,
                })}
                onClick={() => onEditingUser(user)}
              >
                <Td minW="230px">
                  <DesktopUserCell user={user} />
                </Td>
                <Td width="420px" minW="280px">
                  <VStack align="flex-start" spacing={3}>
                    <StatusBadge expiryDate={user.expire} status={user.status} />
                    <StateSwitch
                      user={user}
                      isLoading={!!togglingUsers[user.username]}
                      onToggle={handleToggleStatus}
                    />
                  </VStack>
                </Td>
                <Td width="350px" minW="230px">
                  <UsageSlider
                    totalUsedTraffic={user.lifetime_used_traffic}
                    dataLimitResetStrategy={user.data_limit_reset_strategy}
                    used={user.used_traffic}
                    total={user.data_limit}
                    colorScheme={statusColors[user.status].bandWidthColor}
                  />
                </Td>
                <Td width="210px" minW="190px">
                  <ActionButtons user={user} />
                </Td>
              </Tr>
            ))}
          {(users?.length || 0) === 0 && (
            <Tr>
              <Td colSpan={4}>
                <EmptySection isFiltered={isFiltered} />
              </Td>
            </Tr>
          )}
        </Tbody>
      </Table>
      <Pagination />
    </Box>
  );
};

type ActionButtonsProps = {
  user: User;
};

const ActionButtons: FC<ActionButtonsProps> = ({ user }) => {
  const { setQRCode, setSubLink } = useDashboard();
  const proxyLinks = user.links.join("\r\n");
  const [copied, setCopied] = useState([-1, false] as [number, boolean]);

  useEffect(() => {
    if (copied[1]) {
      const timeoutId = window.setTimeout(() => {
        setCopied([-1, false]);
      }, 1000);
      return () => window.clearTimeout(timeoutId);
    }
    return undefined;
  }, [copied]);

  return (
    <HStack
      spacing={2}
      justifyContent="flex-start"
      className="user-action-group"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <CopyToClipboard
        text={
          user.subscription_url.startsWith("/")
            ? window.location.origin + user.subscription_url
            : user.subscription_url
        }
        onCopy={() => setCopied([0, true])}
      >
        <div>
          <Tooltip
            label={
              copied[0] === 0 && copied[1]
                ? t("usersTable.copied")
                : t("usersTable.copyLink")
            }
            placement="top"
          >
            <IconButton
              aria-label="copy subscription link"
              className="icon-btn"
              variant="ghost"
              size={{
                base: "sm",
                md: "md",
              }}
              icon={
                copied[0] === 0 && copied[1] ? <CopiedIcon /> : <SubscriptionLinkIcon />
              }
            />
          </Tooltip>
        </div>
      </CopyToClipboard>

      <CopyToClipboard text={proxyLinks} onCopy={() => setCopied([1, true])}>
        <div>
          <Tooltip
            label={
              copied[0] === 1 && copied[1]
                ? t("usersTable.copied")
                : t("usersTable.copyConfigs")
            }
            placement="top"
          >
            <IconButton
              aria-label="copy all configs"
              className="icon-btn"
              variant="ghost"
              size={{
                base: "sm",
                md: "md",
              }}
              icon={copied[0] === 1 && copied[1] ? <CopiedIcon /> : <ConfigsIcon />}
            />
          </Tooltip>
        </div>
      </CopyToClipboard>

      <Tooltip label="QR Code" placement="top">
        <IconButton
          aria-label="qr code"
          className="icon-btn"
          variant="ghost"
          size={{
            base: "sm",
            md: "md",
          }}
          icon={<QRIcon />}
          onClick={() => {
            setQRCode(user.links);
            setSubLink(user.subscription_url);
          }}
        />
      </Tooltip>
    </HStack>
  );
};

type EmptySectionProps = {
  isFiltered: boolean;
};

const EmptySection: FC<EmptySectionProps> = ({ isFiltered }) => {
  const { onCreateUser } = useDashboard();

  return (
    <Box
      padding="5"
      py="8"
      display="flex"
      alignItems="center"
      flexDirection="column"
      gap={4}
      w="full"
    >
      <EmptySectionIcon
        maxHeight="200px"
        maxWidth="200px"
        _dark={{
          'path[fill="#fff"]': {
            fill: "gray.800",
          },
          'path[fill="#f2f2f2"], path[fill="#e6e6e6"], path[fill="#ccc"]': {
            fill: "gray.700",
          },
          'circle[fill="#3182CE"]': {
            fill: "primary.300",
          },
        }}
        _light={{
          'path[fill="#f2f2f2"], path[fill="#e6e6e6"], path[fill="#ccc"]': {
            fill: "gray.300",
          },
          'circle[fill="#3182CE"]': {
            fill: "primary.500",
          },
        }}
      />
      <Text fontWeight="medium" color="gray.600" _dark={{ color: "gray.400" }}>
        {isFiltered ? t("usersTable.noUserMatched") : t("usersTable.noUser")}
      </Text>
      {!isFiltered && (
        <Button
          size="sm"
          colorScheme="primary"
          onClick={() => onCreateUser(true)}
        >
          {t("createUser")}
        </Button>
      )}
    </Box>
  );
};
