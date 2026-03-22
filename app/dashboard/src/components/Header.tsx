import {
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
  Text,
  VStack,
  chakra,
  useColorMode,
  useDisclosure,
} from "@chakra-ui/react";
import {
  AdjustmentsHorizontalIcon,
  ArrowLeftOnRectangleIcon,
  Bars3Icon,
  ChartPieIcon,
  ClipboardDocumentListIcon,
  DocumentMinusIcon,
  LinkIcon,
  LockClosedIcon,
  MoonIcon,
  RectangleStackIcon,
  SquaresPlusIcon,
  SunIcon,
} from "@heroicons/react/24/outline";
import useGetUser from "hooks/useGetUser";
import { useFeatures } from "hooks/useFeatures";
import { FC, ReactElement, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import { useDashboard } from "contexts/DashboardContext";
import { updateThemeColor } from "utils/themeColor";
import { Language } from "./Language";

type HeaderProps = {
  actions?: ReactNode;
};

type SidebarActionKey =
  | "nodesUsage"
  | "adminLimits"
  | "happyCrypto"
  | "resetAllUsage";

const neonHostIconProps = {
  baseStyle: {
    w: "20px",
    h: "20px",
    color: "#67e8f9",
    filter: "drop-shadow(0 0 2px rgba(103,232,249,0.85))",
  },
};
const neonInboundsIconProps = {
  baseStyle: {
    w: "20px",
    h: "20px",
    color: "#818cf8",
    filter: "drop-shadow(0 0 2px rgba(129,140,248,0.85))",
  },
};
const neonNodesIconProps = {
  baseStyle: {
    w: "20px",
    h: "20px",
    color: "#a78bfa",
    filter: "drop-shadow(0 0 2px rgba(167,139,250,0.85))",
  },
};
const neonNodesUsageIconProps = {
  baseStyle: {
    w: "20px",
    h: "20px",
    color: "#f472b6",
    filter: "drop-shadow(0 0 2px rgba(244,114,182,0.85))",
  },
};
const neonResetIconProps = {
  baseStyle: {
    w: "20px",
    h: "20px",
    color: "#fb7185",
    filter: "drop-shadow(0 0 2px rgba(251,113,133,0.85))",
  },
};
const neonAdminLimitsIconProps = {
  baseStyle: {
    w: "20px",
    h: "20px",
    color: "#facc15",
    filter: "drop-shadow(0 0 2px rgba(250,204,21,0.85))",
  },
};
const neonAdminManagerIconProps = {
  baseStyle: {
    w: "20px",
    h: "20px",
    color: "#34d399",
    filter: "drop-shadow(0 0 2px rgba(52,211,153,0.85))",
  },
};
const neonCryptoIconProps = {
  baseStyle: {
    w: "20px",
    h: "20px",
    color: "#22d3ee",
    filter: "drop-shadow(0 0 2px rgba(34,211,238,0.85))",
  },
};
const neonLogoutIconProps = {
  baseStyle: {
    w: "20px",
    h: "20px",
    color: "#60a5fa",
    filter: "drop-shadow(0 0 2px rgba(96,165,250,0.85))",
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
const AdminLimitsIcon = chakra(AdjustmentsHorizontalIcon, neonAdminLimitsIconProps);
const AdminManagerIcon = chakra(
  ClipboardDocumentListIcon,
  neonAdminManagerIconProps
);
const CryptoLinkIcon = chakra(LockClosedIcon, neonCryptoIconProps);
const LogoutIcon = chakra(ArrowLeftOnRectangleIcon, neonLogoutIconProps);
const MenuIcon = chakra(Bars3Icon, plainHeaderIconProps);
const ThemeDarkIcon = chakra(MoonIcon, plainHeaderIconProps);
const ThemeLightIcon = chakra(SunIcon, plainHeaderIconProps);

const HeaderThemeToggle: FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { colorMode, toggleColorMode } = useColorMode();
  const isDark = colorMode === "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  const handleToggle = () => {
    const nextMode = isDark ? "light" : "dark";
    toggleColorMode();
    updateThemeColor(nextMode);
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
  const { hasFeature } = useFeatures();
  const location = useLocation();
  const { isOpen, onOpen, onClose } = useDisclosure();

  const isSudo = () => {
    if (!getUserIsPending && getUserIsSuccess) {
      return userData.is_sudo;
    }
    return false;
  };

  const {
    onResetAllUsage,
    onShowingNodesUsage,
    onEditingAdminLimits,
    onEditingCrypto,
  } = useDashboard();

  const { t } = useTranslation();

  const handleSidebarAction = (key: SidebarActionKey) => {
    if (key === "nodesUsage") onShowingNodesUsage(true);
    else if (key === "adminLimits") onEditingAdminLimits(true);
    else if (key === "happyCrypto") onEditingCrypto(true);
    else if (key === "resetAllUsage") onResetAllUsage(true);
  };

  const isActive = (navKey: string) => {
    if (navKey === "inbounds") return location.pathname.startsWith("/inbounds");
    if (navKey === "flew") return location.pathname === "/flew/";
    if (navKey === "nodes") return location.pathname.startsWith("/nodes");
    if (navKey === "hosts") return location.pathname.startsWith("/hosts");
    return false;
  };

  const showSidebar = location.pathname === "/";
  const showXpanel = isSudo() && hasFeature("flew");
  const showWorkspaceLinks = isSudo();

  const mobileNavLinks = [
    showXpanel
      ? {
          key: "flew",
          to: "/flew/",
          label: "XPanel",
          icon: undefined,
          active: isActive("flew"),
        }
      : null,
    showWorkspaceLinks
      ? {
          key: "inbounds",
          to: "/inbounds/",
          label: t("header.inbounds"),
          icon: <InboundsIcon />,
          active: isActive("inbounds"),
        }
      : null,
    showWorkspaceLinks
      ? {
          key: "nodes",
          to: "/nodes/",
          label: t("header.nodes"),
          icon: <NodesIcon />,
          active: isActive("nodes"),
        }
      : null,
    showWorkspaceLinks
      ? {
          key: "hosts",
          to: "/hosts/",
          label: t("header.hosts"),
          icon: <HostsIcon />,
          active: isActive("hosts"),
        }
      : null,
    showWorkspaceLinks
      ? {
          key: "logout",
          to: "/login/",
          label: t("header.logout"),
          icon: <LogoutIcon />,
          active: false,
        }
      : null,
  ].filter(Boolean) as {
    key: string;
    to: string;
    label: string;
    icon?: ReactElement;
    active: boolean;
  }[];

  const mobileSidebarButtons = [
    isSudo() && hasFeature("admin_limits")
      ? {
          key: "adminLimits" as const,
          label: t("sidebar.adminLimits"),
          icon: <AdminLimitsIcon />,
        }
      : null,
    isSudo() && hasFeature("admin_manager")
      ? {
          key: "adminManagerLink",
          to: "/admin-manager/",
          label: t("sidebar.adminManager"),
          icon: <AdminManagerIcon />,
        }
      : null,
    hasFeature("happ_crypto")
      ? {
          key: "happyCrypto" as const,
          label: t("sidebar.happyCrypto"),
          icon: <CryptoLinkIcon />,
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
    key: SidebarActionKey | "adminManagerLink";
    label: string;
    icon: ReactElement;
    to?: string;
    danger?: boolean;
  }>;

  return (
    <>
      <Box
        className="glass-header"
        position="sticky"
        top={0}
        zIndex={1000}
        mb={6}
        px={{ base: 3, md: 6 }}
        py={{ base: 3, md: 4 }}
      >
        <HStack justifyContent="space-between" alignItems="center" gap={3}>
          <Link to="/" style={{ minWidth: 0 }}>
            <HStack gap={{ base: 3, md: 4 }} minW={0}>
              <Box
                as="img"
                src="/logo.svg"
                alt="Flew logo"
                w="45px"
                h="45px"
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
                  Flew
                </Text>
                <Text
                  as="span"
                  display={{ base: "inline", sm: "none" }}
                  fontSize="sm"
                  fontWeight="700"
                  letterSpacing="-0.3px"
                  className="logo-text"
                >
                  XPanel
                </Text>
              </Box>
            </HStack>
          </Link>

          <HStack
            gap={2}
            display={{ base: "none", md: "flex" }}
            className="nav-links"
            flexWrap="wrap"
            justifyContent="flex-end"
          >
            {showXpanel && (
              <Link to="/flew/">
                <Button
                  size="sm"
                  variant="ghost"
                  className={`nav-link ${isActive("flew") ? "active" : ""}`}
                >
                  XPanel
                </Button>
              </Link>
            )}

            <Language />
            <HeaderThemeToggle />

            {showWorkspaceLinks && (
              <>
                <Link to="/inbounds/">
                  <Button
                    size="sm"
                    variant="ghost"
                    className={`nav-link ${isActive("inbounds") ? "active" : ""}`}
                    leftIcon={<InboundsIcon />}
                  >
                    {t("header.inbounds")}
                  </Button>
                </Link>

                <Link to="/nodes/">
                  <Button
                    size="sm"
                    variant="ghost"
                    className={`nav-link ${isActive("nodes") ? "active" : ""}`}
                    leftIcon={<NodesIcon />}
                  >
                    {t("header.nodes")}
                  </Button>
                </Link>

                <Link to="/hosts/">
                  <Button
                    size="sm"
                    variant="ghost"
                    className={`nav-link ${isActive("hosts") ? "active" : ""}`}
                    leftIcon={<HostsIcon />}
                  >
                    {t("header.hosts")}
                  </Button>
                </Link>

                <Link to="/login/">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="nav-link"
                    leftIcon={<LogoutIcon />}
                  >
                    {t("header.logout")}
                  </Button>
                </Link>
              </>
            )}

            {actions}
          </HStack>

          <HStack gap={2} display={{ base: "flex", md: "none" }}>
            <Language compact />
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

      <Drawer isOpen={isOpen} placement="right" onClose={onClose} size="xs">
        <DrawerOverlay backdropFilter="blur(8px)" />
        <DrawerContent
          className="glass-header header-menu-drawer"
          bg="rgba(25, 35, 50, 0.97)"
          borderLeft="1px solid rgba(255,255,255,0.12)"
          mt={2}
          mr={2}
          mb={2}
          borderRadius="24px"
          maxH="calc(100vh - 16px)"
        >
          <DrawerCloseButton top={4} right={4} />
          <DrawerHeader borderBottomWidth="1px" borderColor="rgba(255,255,255,0.08)">
            <HStack spacing={3}>
              <Box
                as="img"
                src="/logo.svg"
                alt="Flew logo"
                w="38px"
                h="38px"
                flexShrink={0}
              />
              <Text fontWeight="700">XPanel</Text>
            </HStack>
          </DrawerHeader>
          <DrawerBody px={4} py={5}>
            <VStack align="stretch" spacing={5}>
              {actions}

              <Box>
                <Text className="header-drawer-caption">Navigation</Text>
                <VStack align="stretch" spacing={2} mt={3}>
                  {mobileNavLinks.map((item) => (
                    <Link
                      key={item.key}
                      to={item.to}
                      onClick={onClose}
                      style={{ display: "block" }}
                    >
                      <Button
                        w="full"
                        justifyContent="flex-start"
                        size="sm"
                        variant="ghost"
                        className={`nav-link header-drawer-link ${
                          item.active ? "active" : ""
                        }`}
                        leftIcon={item.icon}
                      >
                        {item.label}
                      </Button>
                    </Link>
                  ))}
                </VStack>
              </Box>

              <Box>
                <Text className="header-drawer-caption">Tools</Text>
                <VStack align="stretch" spacing={2} mt={3}>
                  {mobileSidebarButtons.map((item) =>
                    item.to ? (
                      <Link
                        key={item.key}
                        to={item.to}
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
                      </Link>
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
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      <Box
        className="glass-sidebar"
        display={showSidebar ? { base: "none", lg: "block" } : "none"}
        position="fixed"
        top="112px"
        right="20px"
        w="300px"
        maxH="calc(100vh - 150px)"
        overflowY="auto"
        zIndex={900}
        p={5}
        sx={{
          "&::-webkit-scrollbar": { width: "4px" },
          "&::-webkit-scrollbar-track": { bg: "transparent" },
          "&::-webkit-scrollbar-thumb": {
            bg: "rgba(255,255,255,0.1)",
            borderRadius: "2px",
          },
        }}
      >
        <Box className="server-status">
          <Box className="pulse-dot" />
          <Box>
            <Text fontWeight="600" fontSize="sm">
              Server Online
            </Text>
            <Text fontSize="xs" opacity={0.7}>
              All systems operational
            </Text>
          </Box>
        </Box>

        <Box className="sidebar-divider" />

        <VStack gap={2} align="stretch" pb={4}>
          {isSudo() && (
            <>
              {hasFeature("admin_limits") && (
                <Button
                  size="sm"
                  h="52px"
                  w="full"
                  px={4}
                  textAlign="left"
                  justifyContent="flex-start"
                  leftIcon={<AdminLimitsIcon />}
                  className="sidebar-btn"
                  onClick={() => handleSidebarAction("adminLimits")}
                >
                  {t("sidebar.adminLimits")}
                </Button>
              )}

              {hasFeature("admin_manager") && (
                <Link to="/admin-manager/" style={{ display: "block", width: "100%" }}>
                  <Button
                    size="sm"
                    h="52px"
                    px={4}
                    w="full"
                    textAlign="left"
                    justifyContent="flex-start"
                    leftIcon={<AdminManagerIcon />}
                    className="sidebar-btn"
                  >
                    {t("sidebar.adminManager")}
                  </Button>
                </Link>
              )}
            </>
          )}

          {hasFeature("happ_crypto") && (
            <Button
              size="sm"
              h="52px"
              w="full"
              px={4}
              textAlign="left"
              justifyContent="flex-start"
              leftIcon={<CryptoLinkIcon />}
              className="sidebar-btn"
              onClick={() => handleSidebarAction("happyCrypto")}
            >
              {t("sidebar.happyCrypto")}
            </Button>
          )}

          {isSudo() && (
            <>
              <Button
                size="sm"
                h="52px"
                w="full"
                px={4}
                textAlign="left"
                justifyContent="flex-start"
                leftIcon={<NodesUsageIcon />}
                className="sidebar-btn"
                onClick={() => handleSidebarAction("nodesUsage")}
              >
                {t("sidebar.nodesUsage")}
              </Button>

              <Button
                size="sm"
                h="52px"
                w="full"
                px={4}
                textAlign="left"
                justifyContent="flex-start"
                leftIcon={<ResetUsageIcon />}
                className="sidebar-btn sidebar-btn-danger"
                onClick={() => handleSidebarAction("resetAllUsage")}
              >
                {t("sidebar.resetAllUsages")}
              </Button>
            </>
          )}
        </VStack>
      </Box>
    </>
  );
};

export default Header;
