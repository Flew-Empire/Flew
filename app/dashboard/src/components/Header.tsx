import {
  Badge,
  Box,
  Button,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerHeader,
  DrawerOverlay,
  HStack,
  IconButton,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Text,
  VStack,
  chakra,
  useBreakpointValue,
  useColorMode,
  useDisclosure,
} from "@chakra-ui/react";
import {
  AdjustmentsHorizontalIcon,
  ArrowLeftOnRectangleIcon,
  Bars3Icon,
  BanknotesIcon,
  ChartPieIcon,
  ChatBubbleLeftRightIcon,
  ClipboardDocumentListIcon,
  DocumentMinusIcon,
  LinkIcon,
  LockClosedIcon,
  MoonIcon,
  RectangleStackIcon,
  SquaresPlusIcon,
  SunIcon,
  UserPlusIcon,
} from "@heroicons/react/24/outline";
import useGetUser from "hooks/useGetUser";
import { useAdminChatSummary } from "hooks/useAdminChatSummary";
import { useFeatures } from "hooks/useFeatures";
import { FC, ReactElement, ReactNode, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import { useDashboard } from "contexts/DashboardContext";
import { updateThemeColor } from "utils/themeColor";
import { removeAuthToken } from "utils/authStorage";
import { PrefetchLink } from "./PrefetchLink";
import { Language } from "./Language";

type HeaderProps = {
  actions?: ReactNode;
};

type SidebarActionKey =
  | "nodesUsage"
  | "resetAllUsage";

const neonHostIconProps = {
  baseStyle: {
    w: "20px",
    h: "20px",
    color: "currentColor",
  },
};
const neonInboundsIconProps = {
  baseStyle: {
    w: "20px",
    h: "20px",
    color: "currentColor",
  },
};
const neonNodesIconProps = {
  baseStyle: {
    w: "20px",
    h: "20px",
    color: "currentColor",
  },
};
const neonNodesUsageIconProps = {
  baseStyle: {
    w: "20px",
    h: "20px",
    color: "currentColor",
  },
};
const neonResetIconProps = {
  baseStyle: {
    w: "20px",
    h: "20px",
    color: "currentColor",
  },
};
const neonAdminLimitsIconProps = {
  baseStyle: {
    w: "20px",
    h: "20px",
    color: "currentColor",
  },
};
const neonAdminAccountsIconProps = {
  baseStyle: {
    w: "20px",
    h: "20px",
    color: "currentColor",
  },
};
const neonAdminManagerIconProps = {
  baseStyle: {
    w: "20px",
    h: "20px",
    color: "currentColor",
  },
};
const neonCryptoIconProps = {
  baseStyle: {
    w: "20px",
    h: "20px",
    color: "currentColor",
  },
};
const neonLogoutIconProps = {
  baseStyle: {
    w: "20px",
    h: "20px",
    color: "currentColor",
  },
};
const plainHeaderIconProps = {
  baseStyle: {
    w: "20px",
    h: "20px",
  },
};

const InboundsIcon = chakra(RectangleStackIcon, neonInboundsIconProps);
const HostsIcon = chakra(LinkIcon, neonHostIconProps);
const NodesIcon = chakra(SquaresPlusIcon, neonNodesIconProps);
const NodesUsageIcon = chakra(ChartPieIcon, neonNodesUsageIconProps);
const ResetUsageIcon = chakra(DocumentMinusIcon, neonResetIconProps);
const AdminAccountsIcon = chakra(UserPlusIcon, neonAdminAccountsIconProps);
const AdminLimitsIcon = chakra(AdjustmentsHorizontalIcon, neonAdminLimitsIconProps);
const AdminManagerIcon = chakra(
  ClipboardDocumentListIcon,
  neonAdminManagerIconProps
);
const AdminBillingIcon = chakra(BanknotesIcon, neonAdminManagerIconProps);
const CryptoLinkIcon = chakra(LockClosedIcon, neonCryptoIconProps);
const CryptoSettingsIcon = chakra(AdjustmentsHorizontalIcon, neonCryptoIconProps);
const AdminChatIcon = chakra(ChatBubbleLeftRightIcon, neonCryptoIconProps);
const LogoutIcon = chakra(ArrowLeftOnRectangleIcon, neonLogoutIconProps);
const MenuIcon = chakra(Bars3Icon, plainHeaderIconProps);

const ThemeDarkIcon = chakra(MoonIcon, plainHeaderIconProps);
const ThemeLightIcon = chakra(SunIcon, plainHeaderIconProps);

const SUPPORT_POPUP_STORAGE_KEY = "flew-support-popup-v1";
const SUPPORT_POPUP_MAX_PER_WEEK = 3;
const SUPPORT_POPUP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const SUPPORT_POPUP_MIN_GAP_MS = 48 * 60 * 60 * 1000;

const getSupportPopupTimestamps = (): number[] => {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(SUPPORT_POPUP_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));
  } catch {
    return [];
  }
};

const persistSupportPopupTimestamps = (timestamps: number[]) => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      SUPPORT_POPUP_STORAGE_KEY,
      JSON.stringify(timestamps)
    );
  } catch {
    // Ignore storage failures; the support inbox should still work.
  }
};

const HeaderThemeToggle: FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { colorMode, setColorMode } = useColorMode();
  const isDark = colorMode === "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  const handleToggle = () => {
    const nextMode = isDark ? "light" : "dark";
    setColorMode(nextMode);
    if (typeof updateThemeColor === "function") {
      updateThemeColor(nextMode);
    }
  };

  return (
    <IconButton
      aria-label={label}
      size="sm"
      variant="ghost"
      className={compact ? "icon-btn header-icon-btn" : "nav-link header-icon-btn"}
      icon={isDark ? <ThemeLightIcon /> : <ThemeDarkIcon />}
      onClick={handleToggle}
    />
  );
};

export const Header: FC<HeaderProps> = ({ actions }) => {
  const { userData, getUserIsSuccess, getUserIsPending } = useGetUser();
  const { hasFeature, edition } = useFeatures();
  const { totalUnread, isEnabled: adminChatEnabled } = useAdminChatSummary();
  const location = useLocation();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const {
    isOpen: isSupportOpen,
    onOpen: onSupportOpen,
    onClose: onSupportClose,
  } = useDisclosure();
  const isMobile = useBreakpointValue({ base: true, md: false }) ?? false;

  const isSudo = () => {
    if (!getUserIsPending && getUserIsSuccess) {
      return userData.is_sudo;
    }
    return false;
  };
  const canLogout = !getUserIsPending && getUserIsSuccess;
  const showAdminChat = adminChatEnabled && canLogout;
  const canManageAdminAccounts = isSudo() && hasFeature("admin_accounts");
  const canManageSubscriptionSettings =
    isSudo() && hasFeature("subscription_settings");

  const {
    onResetAllUsage,
    onShowingNodesUsage,
  } = useDashboard();

  const { t } = useTranslation();
  const brandName = edition === "free" ? "Free" : "Flew";
  const isFreeEdition = edition === "free";

  useEffect(() => {
    if (typeof window === "undefined" || !isFreeEdition) return undefined;

    const now = Date.now();
    const recentTimestamps = getSupportPopupTimestamps().filter(
      (timestamp) => now - timestamp < SUPPORT_POPUP_WINDOW_MS
    );
    const lastTimestamp = recentTimestamps[recentTimestamps.length - 1] ?? 0;

    persistSupportPopupTimestamps(recentTimestamps);

    if (
      recentTimestamps.length >= SUPPORT_POPUP_MAX_PER_WEEK ||
      now - lastTimestamp < SUPPORT_POPUP_MIN_GAP_MS
    ) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      onSupportOpen();
      persistSupportPopupTimestamps([...recentTimestamps, Date.now()]);
    }, 2200);

    return () => window.clearTimeout(timer);
  }, [isFreeEdition, onSupportOpen]);

  const handleSidebarAction = (key: SidebarActionKey) => {
    if (key === "nodesUsage") onShowingNodesUsage(true);
    else if (key === "resetAllUsage") onResetAllUsage(true);
  };

  const isActive = (navKey: string) => {
    if (navKey === "inbounds") return location.pathname.startsWith("/inbounds");
    if (navKey === "flew") return location.pathname === "/flew/";
    if (navKey === "nodes") return location.pathname.startsWith("/nodes");
    if (navKey === "hosts") return location.pathname.startsWith("/hosts");
    if (navKey === "adminLimits")
      return location.pathname.startsWith("/admin-limits");
    if (navKey === "adminAccounts")
      return location.pathname.startsWith("/admin-accounts");
    if (navKey === "adminBilling")
      return location.pathname.startsWith("/admin-billing");
    if (navKey === "adminChat")
      return location.pathname.startsWith("/admin-chat");
    if (navKey === "subscriptionSettings")
      return (
        location.pathname.startsWith("/subscription-settings") ||
        location.pathname.startsWith("/happ-crypto/settings")
      );
    if (navKey === "happyCrypto")
      return location.pathname === "/happ-crypto/" || location.pathname === "/happ-crypto";
    return false;
  };

  const showSidebar = location.pathname === "/";
  const showXpanel = isSudo() && hasFeature("xpanel");
  const showWorkspaceLinks = isSudo();

  const baseMobileNavLinks = [
    showAdminChat && !isSudo()
      ? {
          key: "adminChat",
          to: "/admin-chat/",
          label: t("header.adminChat"),
          icon: <AdminChatIcon />,
          active: isActive("adminChat"),
          preload: "adminChat" as const,
        }
      : null,
    showXpanel
      ? {
          key: "flew",
          to: "/flew/",
          label: "XPanel",
          icon: undefined,
          active: isActive("flew"),
          preload: "flew" as const,
        }
      : null,
    showAdminChat && isSudo()
      ? {
          key: "adminChat",
          to: "/admin-chat/",
          label: t("header.adminChat"),
          icon: <AdminChatIcon />,
          active: isActive("adminChat"),
          preload: "adminChat" as const,
        }
      : null,
    showWorkspaceLinks
      ? {
          key: "inbounds",
          to: "/inbounds/",
          label: t("header.inbounds"),
          icon: <InboundsIcon />,
          active: isActive("inbounds"),
          preload: "inbounds" as const,
        }
      : null,
    showWorkspaceLinks
      ? {
          key: "nodes",
          to: "/nodes/",
          label: t("header.nodes"),
          icon: <NodesIcon />,
          active: isActive("nodes"),
          preload: "nodes" as const,
        }
      : null,
    showWorkspaceLinks
      ? {
          key: "hosts",
          to: "/hosts/",
          label: t("header.hosts"),
          icon: <HostsIcon />,
          active: isActive("hosts"),
          preload: "hosts" as const,
        }
      : null,
  ];

  const mobileNavLinks = baseMobileNavLinks.filter(Boolean) as {
    key: string;
    to: string;
    label: string;
    icon?: ReactElement;
    active: boolean;
    preload?: "adminChat" | "flew" | "inbounds" | "nodes" | "hosts";
  }[];

  const mobileSidebarButtons = [
    hasFeature("admin_billing")
      ? {
          key: "adminBillingLink",
          to: "/admin-billing/",
          label: t("sidebar.adminBilling"),
          icon: <AdminBillingIcon />,
          active: isActive("adminBilling"),
          preload: "adminBilling" as const,
        }
      : null,
    canManageAdminAccounts
      ? {
          key: "adminAccountsLink",
          to: "/admin-accounts/",
          label: t("sidebar.adminAccounts"),
          icon: <AdminAccountsIcon />,
          active: isActive("adminAccounts"),
          preload: "adminAccounts" as const,
        }
      : null,
    canManageSubscriptionSettings
      ? {
          key: "subscriptionSettingsLink",
          to: "/subscription-settings/",
          label: t("sidebar.subscriptionSettings"),
          icon: <CryptoSettingsIcon />,
          active: isActive("subscriptionSettings"),
          preload: "cryptoLinkSettings" as const,
        }
      : null,
    isSudo() && hasFeature("admin_limits")
      ? {
          key: "adminLimitsLink",
          to: "/admin-limits/",
          label: t("sidebar.adminLimits"),
          icon: <AdminLimitsIcon />,
          active: isActive("adminLimits"),
          preload: "adminLimits" as const,
        }
      : null,
    isSudo() && hasFeature("admin_manager")
      ? {
          key: "adminManagerLink",
          to: "/admin-manager/",
          label: t("sidebar.adminManager"),
          icon: <AdminManagerIcon />,
          preload: "adminManager" as const,
        }
      : null,
    hasFeature("happ_crypto")
      ? {
          key: "happyCryptoLink",
          to: "/happ-crypto/",
          label: t("sidebar.happyCrypto"),
          icon: <CryptoLinkIcon />,
          active: isActive("happyCrypto"),
          preload: "cryptoLink" as const,
        }
      : null,
    isSudo()
      ? {
          key: "nodesUsage" as const,
          label: t("sidebar.nodesUsage"),
          icon: <NodesUsageIcon />,
        }
      : null,
    isSudo()
      ? {
          key: "resetAllUsage" as const,
          label: t("sidebar.resetAllUsages"),
          icon: <ResetUsageIcon />,
          danger: true,
        }
      : null,
  ].filter(Boolean) as Array<{
    key:
      | SidebarActionKey
      | "adminAccountsLink"
      | "adminBillingLink"
      | "adminManagerLink"
      | "adminLimitsLink"
      | "happyCryptoLink"
      | "subscriptionSettingsLink";
    label: string;
    icon: ReactElement;
    to?: string;
    danger?: boolean;
    active?: boolean;
    preload?:
      | "adminAccounts"
      | "adminBilling"
      | "adminManager"
      | "adminLimits"
      | "cryptoLink"
      | "cryptoLinkSettings";
  }>;

  const renderSupportButton = () => (
    <Box position="relative" display="inline-flex">
      <IconButton
        aria-label={t("supportInbox.open")}
        size="sm"
        variant="ghost"
        className="icon-btn header-icon-btn"
        icon={
          <Box
            as="span"
            display="inline-flex"
            alignItems="center"
            justifyContent="center"
            fontSize="18px"
            lineHeight="1"
          >
            @
          </Box>
        }
        onClick={onSupportOpen}
      />
      <Box
        position="absolute"
        top="6px"
        right="6px"
        w="8px"
        h="8px"
        borderRadius="full"
        bg="rgba(59, 130, 246, 0.95)"
        boxShadow="0 0 0 3px rgba(59, 130, 246, 0.18), 0 0 18px rgba(96, 165, 250, 0.75)"
        pointerEvents="none"
      />
    </Box>
  );

  const renderAdminChatButton = (compact = false) => (
    <Box position="relative" display="inline-flex">
      <PrefetchLink to="/admin-chat/" preload="adminChat">
        <IconButton
          aria-label={t("header.adminChat")}
          size="sm"
          variant="ghost"
          className={compact ? "icon-btn header-icon-btn" : "nav-link header-icon-btn"}
          icon={<AdminChatIcon />}
        />
      </PrefetchLink>
      {totalUnread > 0 ? (
        <Badge
          position="absolute"
          top="-4px"
          right="-4px"
          minW="18px"
          h="18px"
          px="5px"
          borderRadius="full"
          colorScheme="red"
          display="inline-flex"
          alignItems="center"
          justifyContent="center"
          pointerEvents="none"
        >
          {totalUnread > 99 ? "99+" : totalUnread}
        </Badge>
      ) : null}
    </Box>
  );

  const handleLogout = () => {
    removeAuthToken();
    onClose();
  };

  return (
    <>
      <Box
        className="glass-header"
        position="relative"
        top="auto"
        zIndex={1000}
        mb={6}
        px={{ base: 3, md: 6 }}
        py={{ base: 3, md: 4 }}
      >
        <HStack justifyContent="space-between" alignItems="center" gap={3}>
          <Link to="/" style={{ minWidth: 0 }}>
            <HStack gap={{ base: 2, md: 4 }} minW={0}>
              <Box
                as="img"
                src="/logo.svg"
                alt={`${brandName} logo`}
                w={{ base: "40px", md: "45px" }}
                h={{ base: "40px", md: "45px" }}
                flexShrink={0}
                display="block"
              />
              <Box minW={0}>
                <Text
                  as="span"
                  display={{ base: "none", sm: "inline" }}
                  fontSize={{ sm: "lg", md: "2xl" }}
                  fontWeight="700"
                  letterSpacing="-0.5px"
                  className="logo-text"
                >
                  {brandName}
                </Text>
                <Text
                  as="span"
                  display={{ base: "inline", sm: "none" }}
                  fontSize="sm"
                  fontWeight="700"
                  letterSpacing="-0.3px"
                  lineHeight="1"
                  whiteSpace="nowrap"
                  className="logo-text"
                >
                  {brandName}
                </Text>
              </Box>
            </HStack>
          </Link>

          {/* CENTER: Nav links — XPanel, Inbounds, Nodes, Hosts */}
          <HStack
            gap={2}
            display={{ base: "none", md: "flex" }}
            className="nav-links"
            flex="1"
            justifyContent="center"
          >
            {showXpanel && (
              <PrefetchLink to="/flew/" preload="flew">
                <Button
                  size="sm"
                  variant="ghost"
                  className={`nav-link ${isActive("flew") ? "active" : ""}`}
                >
                  XPanel
                </Button>
              </PrefetchLink>
            )}

            {showWorkspaceLinks && (
              <>
                <PrefetchLink to="/inbounds/" preload="inbounds">
                  <Button
                    size="sm"
                    variant="ghost"
                    className={`nav-link ${isActive("inbounds") ? "active" : ""}`}
                    leftIcon={<InboundsIcon />}
                  >
                    {t("header.inbounds")}
                  </Button>
                </PrefetchLink>

                <PrefetchLink to="/nodes/" preload="nodes">
                  <Button
                    size="sm"
                    variant="ghost"
                    className={`nav-link ${isActive("nodes") ? "active" : ""}`}
                    leftIcon={<NodesIcon />}
                  >
                    {t("header.nodes")}
                  </Button>
                </PrefetchLink>

                <PrefetchLink to="/hosts/" preload="hosts">
                  <Button
                    size="sm"
                    variant="ghost"
                    className={`nav-link ${isActive("hosts") ? "active" : ""}`}
                    leftIcon={<HostsIcon />}
                  >
                    {t("header.hosts")}
                  </Button>
                </PrefetchLink>
              </>
            )}
          </HStack>

          {/* RIGHT: Language, theme toggle, logout */}
          <HStack
            gap={2}
            display={{ base: "none", md: "flex" }}
            flexShrink={0}
          >
            {showAdminChat ? renderAdminChatButton() : null}
            <Language />
            {isFreeEdition ? renderSupportButton() : null}
            <HeaderThemeToggle />

            {canLogout && (
              <Link to="/login/" onClick={handleLogout}>
                <Button
                  size="sm"
                  variant="ghost"
                  className="nav-link"
                  leftIcon={<LogoutIcon />}
                >
                  {t("header.logout")}
                </Button>
              </Link>
            )}

            {actions}
          </HStack>

          <HStack gap={2} display={{ base: "flex", md: "none" }}>
            <Language compact />
            {isFreeEdition ? renderSupportButton() : null}
            <HeaderThemeToggle compact />
            <IconButton
              aria-label="Open menu"
              size="sm"
              variant="ghost"
              className="icon-btn header-icon-btn"
              icon={<MenuIcon />}
              onClick={onOpen}
            />
          </HStack>
        </HStack>
      </Box>

      <Drawer
        isOpen={isOpen}
        placement="right"
        onClose={onClose}
        size="xs"
        autoFocus={!isMobile}
        returnFocusOnClose={!isMobile}
        preserveScrollBarGap={!isMobile}
        blockScrollOnMount={!isMobile}
      >
        <DrawerOverlay
          className={isMobile ? "mobile-header-menu-overlay" : undefined}
          backdropFilter={isMobile ? "none" : "blur(8px)"}
          bg={isMobile ? "blackAlpha.500" : undefined}
        />
        <DrawerContent
          className={
            isMobile
              ? "header-menu-drawer mobile-header-menu-drawer"
              : "glass-header header-menu-drawer"
          }
          bg="var(--surface-elevated)"
          borderLeft="1px solid var(--border)"
          mt={2}
          mr={2}
          mb={2}
          borderRadius="24px"
          maxH="calc(100vh - 16px)"
        >
          <DrawerCloseButton top={4} right={4} />
          <DrawerHeader borderBottomWidth="1px" borderColor="var(--divider)">
            <HStack spacing={3}>
              <Box
                as="img"
                src="/logo.svg"
                alt={`${brandName} logo`}
                w="38px"
                h="38px"
                flexShrink={0}
              />
              <Text fontWeight="700">{brandName}</Text>
            </HStack>
          </DrawerHeader>
          <DrawerBody px={4} py={5}>
            <Box display="flex" flexDirection="column" minH="full">
              <VStack align="stretch" spacing={5} flex="1">
                {actions}

                <Box>
                  <Text className="header-drawer-caption">Navigation</Text>
                  <VStack align="stretch" spacing={2} mt={3}>
                    {mobileNavLinks.map((item) => (
                      <PrefetchLink
                        key={item.key}
                        to={item.to}
                        preload={item.preload}
                        onClick={onClose}
                        style={{ display: "block" }}
                      >
                        <Button
                          size="sm"
                          h="50px"
                          w="full"
                          px={4}
                          textAlign="left"
                          justifyContent="flex-start"
                          leftIcon={item.icon}
                          className={`sidebar-btn header-drawer-link ${
                            item.active ? "active" : ""
                          }`}
                        >
                          {item.label}
                        </Button>
                      </PrefetchLink>
                    ))}
                  </VStack>
                </Box>

                <Box>
                  <Text className="header-drawer-caption">Tools</Text>
                  <VStack align="stretch" spacing={2} mt={3}>
                    {mobileSidebarButtons.map((item) =>
                      item.to ? (
                        <PrefetchLink
                          key={item.key}
                          to={item.to}
                          preload={item.preload}
                          onClick={onClose}
                          style={{ display: "block" }}
                        >
                          <Button
                            size="sm"
                            h="50px"
                            w="full"
                            px={4}
                            textAlign="left"
                            justifyContent="flex-start"
                            leftIcon={item.icon}
                            className="sidebar-btn"
                          >
                            {item.label}
                          </Button>
                        </PrefetchLink>
                      ) : (
                        <Button
                          key={item.key}
                          size="sm"
                          h="50px"
                          w="full"
                          px={4}
                          textAlign="left"
                          justifyContent="flex-start"
                          leftIcon={item.icon}
                          className={item.danger ? "sidebar-btn sidebar-btn-danger" : "sidebar-btn"}
                          onClick={() => {
                            handleSidebarAction(item.key as SidebarActionKey);
                            onClose();
                          }}
                        >
                          {item.label}
                        </Button>
                      )
                    )}
                  </VStack>
                </Box>
              </VStack>

              {canLogout && (
                <Box mt={6} pt={4} borderTop="1px solid var(--divider)">
                  <Link to="/login/" onClick={handleLogout} style={{ display: "block" }}>
                    <Button
                      size="sm"
                      h="50px"
                      w="full"
                      px={4}
                      textAlign="left"
                      justifyContent="flex-start"
                      leftIcon={<LogoutIcon />}
                      className="sidebar-btn"
                    >
                      {t("header.logout")}
                    </Button>
                  </Link>
                </Box>
              )}
            </Box>
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      {isFreeEdition ? (
        <Modal
          isOpen={isSupportOpen}
          onClose={onSupportClose}
          size={isMobile ? "xl" : "2xl"}
          isCentered
          motionPreset="slideInBottom"
          scrollBehavior="inside"
        >
          <ModalOverlay bg="blackAlpha.420" backdropFilter="blur(8px)" />
          <ModalContent
            bg="var(--surface-elevated)"
            border="1px solid var(--border)"
            borderRadius="26px"
            overflow="hidden"
            w={{ base: "calc(100vw - 20px)", md: "100%" }}
            maxW={{ base: "calc(100vw - 20px)", md: "2xl" }}
            my={{ base: 2, md: 6 }}
            maxH={{ base: "calc(100dvh - 20px)", md: "calc(100vh - 48px)" }}
          >
            <ModalHeader px={{ base: 4, md: 6 }} pt={{ base: 5, md: 7 }} pb={{ base: 2, md: 2 }}>
              <VStack spacing={{ base: 2.5, md: 3 }} align="center">
                <Box
                  as="img"
                  src="/logo.svg"
                  alt="Flew logo"
                  w={{ base: "60px", md: "88px" }}
                  h={{ base: "60px", md: "88px" }}
                  objectFit="contain"
                />
                <VStack spacing={1}>
                  <Text fontSize={{ base: "lg", md: "2xl" }} fontWeight="800" textAlign="center">
                    {t("supportInbox.title")}
                  </Text>
                  <Text
                    fontSize={{ base: "xs", md: "sm" }}
                    color="var(--muted)"
                    textAlign="center"
                    maxW={{ base: "100%", md: "560px" }}
                  >
                    {t("supportInbox.subtitle")}
                  </Text>
                </VStack>
              </VStack>
            </ModalHeader>
            <ModalCloseButton top={{ base: 3, md: 5 }} right={{ base: 3, md: 5 }} />
            <ModalBody px={{ base: 4, md: 6 }} pb={{ base: 5, md: 7 }} overflowY="auto">
              <VStack spacing={{ base: 3, md: 4 }} align="stretch">
                <Box
                  p={{ base: 3.5, md: 4 }}
                  borderRadius={{ base: "16px", md: "18px" }}
                  border="1px solid var(--border)"
                  bg="var(--surface-soft)"
                >
                  <Text fontSize="xs" fontWeight="700" letterSpacing="0.08em" textTransform="uppercase" color="var(--muted)">
                    {t("supportInbox.emailLabel")}
                  </Text>
                  <Text mt={2} fontSize={{ base: "md", md: "lg" }} fontWeight="700" wordBreak="break-word">
                    flewempire@gmail.com
                  </Text>
                  <Text mt={1} fontSize={{ base: "xs", md: "sm" }} color="var(--muted)">
                    {t("supportInbox.emailDescription")}
                  </Text>
                  <Button
                    as="a"
                    href="mailto:flewempire@gmail.com"
                    size="sm"
                    mt={3}
                    className="nav-link"
                    leftIcon={
                      <Box
                        as="span"
                        display="inline-flex"
                        alignItems="center"
                        justifyContent="center"
                        fontSize="16px"
                        lineHeight="1"
                      >
                        @
                      </Box>
                    }
                    w={{ base: "100%", md: "auto" }}
                  >
                    {t("supportInbox.emailAction")}
                  </Button>
                </Box>

                <Box
                  p={{ base: 3.5, md: 4 }}
                  borderRadius={{ base: "16px", md: "18px" }}
                  border="1px solid var(--border)"
                  bg="var(--surface-soft)"
                >
                  <Text fontSize="xs" fontWeight="700" letterSpacing="0.08em" textTransform="uppercase" color="var(--muted)">
                    {t("supportInbox.telegramLabel")}
                  </Text>

                  <VStack spacing={{ base: 2.5, md: 3 }} mt={3} align="stretch">
                    <Box
                      as="a"
                      href="https://t.me/flewempire"
                      target="_blank"
                      rel="noreferrer"
                      display="block"
                      p={{ base: 3, md: 3 }}
                      borderRadius="16px"
                      border="1px solid var(--border)"
                      bg="var(--surface-elevated)"
                      _hover={{ transform: "translateY(-1px)", bg: "var(--hover)" }}
                      transition="all 0.2s ease"
                    >
                      <Text fontWeight="700">@flewempire</Text>
                      <Text mt={1} fontSize={{ base: "xs", md: "sm" }} color="var(--muted)">
                        {t("supportInbox.companyDescription")}
                      </Text>
                    </Box>

                    <Box
                      as="a"
                      href="https://t.me/flewfree"
                      target="_blank"
                      rel="noreferrer"
                      display="block"
                      p={{ base: 3, md: 3 }}
                      borderRadius="16px"
                      border="1px solid var(--border)"
                      bg="var(--surface-elevated)"
                      _hover={{ transform: "translateY(-1px)", bg: "var(--hover)" }}
                      transition="all 0.2s ease"
                    >
                      <Text fontWeight="700">@flewfree</Text>
                      <Text mt={1} fontSize={{ base: "xs", md: "sm" }} color="var(--muted)">
                        {t("supportInbox.freeDescription")}
                      </Text>
                    </Box>

                    <Box
                      as="a"
                      href="https://t.me/flewpremium"
                      target="_blank"
                      rel="noreferrer"
                      display="block"
                      p={{ base: 3, md: 3 }}
                      borderRadius="16px"
                      border="1px solid var(--border)"
                      bg="var(--surface-elevated)"
                      _hover={{ transform: "translateY(-1px)", bg: "var(--hover)" }}
                      transition="all 0.2s ease"
                    >
                      <Text fontWeight="700">@flewpremium</Text>
                      <Text mt={1} fontSize={{ base: "xs", md: "sm" }} color="var(--muted)">
                        {t("supportInbox.premiumDescription")}
                      </Text>
                    </Box>
                  </VStack>
                </Box>
              </VStack>
            </ModalBody>
          </ModalContent>
        </Modal>
      ) : null}

      {/* Sidebar is now rendered in Dashboard.tsx as part of the grid layout */}
    </>
  );
};

export default Header;
