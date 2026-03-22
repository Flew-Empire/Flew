import {
  Box,
  chakra,
  HStack,
  IconButton,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Text,
  useColorMode,
} from "@chakra-ui/react";
import {
  AdjustmentsHorizontalIcon,
  ArrowLeftOnRectangleIcon,
  Bars3Icon,
  ChartPieIcon,
  Cog6ToothIcon,
  CurrencyDollarIcon,
  DocumentMinusIcon,
  LinkIcon,
  MoonIcon,
  SquaresPlusIcon,
  SunIcon,
  ChartBarIcon,
  LockClosedIcon,
  ClipboardDocumentListIcon,
} from "@heroicons/react/24/outline";
import { DONATION_URL, REPO_URL } from "constants/Project";
import { useDashboard } from "contexts/DashboardContext";
import differenceInDays from "date-fns/differenceInDays";
import isValid from "date-fns/isValid";
import { FC, ReactNode, useState } from "react";
import GitHubButton from "react-github-btn";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { updateThemeColor } from "utils/themeColor";
import { Language } from "./Language";
import useGetUser from "hooks/useGetUser";

type HeaderProps = {
  actions?: ReactNode;
};
const iconProps = {
  baseStyle: {
    w: 4,
    h: 4,
  },
};

const DarkIcon = chakra(MoonIcon, iconProps);
const LightIcon = chakra(SunIcon, iconProps);
const CoreSettingsIcon = chakra(Cog6ToothIcon, iconProps);
const TrafficManagerIcon = chakra(ChartBarIcon, iconProps);
const CryptoLinkIcon = chakra(LockClosedIcon, iconProps);
const SettingsIcon = chakra(Bars3Icon, iconProps);
const LogoutIcon = chakra(ArrowLeftOnRectangleIcon, iconProps);
const DonationIcon = chakra(CurrencyDollarIcon, iconProps);
const HostsIcon = chakra(LinkIcon, iconProps);
const NodesIcon = chakra(SquaresPlusIcon, iconProps);
const NodesUsageIcon = chakra(ChartPieIcon, iconProps);
const ResetUsageIcon = chakra(DocumentMinusIcon, iconProps);
const AdminLimitsIcon = chakra(AdjustmentsHorizontalIcon, iconProps);
const AdminManagerIcon = chakra(ClipboardDocumentListIcon, iconProps);
const NotificationCircle = chakra(Box, {
  baseStyle: {
    bg: "yellow.500",
    w: "2",
    h: "2",
    rounded: "full",
    position: "absolute",
  },
});

const NOTIFICATION_KEY = "xpert-menu-notification";

export const shouldShowDonation = (): boolean => {
  const date = localStorage.getItem(NOTIFICATION_KEY);
  if (!date) return true;
  try {
    if (date && isValid(parseInt(date))) {
      if (differenceInDays(new Date(), new Date(parseInt(date))) >= 7)
        return true;
      return false;
    }
    return true;
  } catch (err) {
    return true;
  }
};

export const Header: FC<HeaderProps> = ({ actions }) => {
  const { userData, getUserIsSuccess, getUserIsPending } = useGetUser();

  const isSudo = () => {
    if (!getUserIsPending && getUserIsSuccess) {
      return userData.is_sudo;
    }
    return false;
  };

  const {
    onEditingHosts,
    onResetAllUsage,
    onEditingNodes,
    onShowingNodesUsage,
    onEditingAdminLimits,
    onEditingCrypto,
  } = useDashboard();
  const { t } = useTranslation();
  const { colorMode, toggleColorMode } = useColorMode();
  const [showDonationNotif, setShowDonationNotif] = useState(
    shouldShowDonation()
  );
  const gBtnColor = colorMode === "dark" ? "dark_dimmed" : colorMode;

  const handleOnClose = () => {
    localStorage.setItem(NOTIFICATION_KEY, new Date().getTime().toString());
    setShowDonationNotif(false);
  };

  return (
    <HStack
      gap={2}
      justifyContent="space-between"
      __css={{
        "& .menuList": {
          direction: "ltr",
        },
      }}
      position="relative"
    >
      <HStack>
        <Link to="/">
          <Text as="h1" fontWeight="semibold" fontSize="2xl" cursor="pointer" _hover={{ color: "primary.500" }}>
            {t("users")}
          </Text>
        </Link>
        {isSudo() && (
          <>
            <Text fontSize="2xl" color="gray.400">|</Text>
            <Link to="/xpert/">
              <Text
                as="h1"
                fontWeight="semibold"
                fontSize="2xl"
                cursor="pointer"
                _hover={{ color: "primary.500" }}
              >
                Xpert Panel
              </Text>
            </Link>
          </>
        )}
      </HStack>
      {showDonationNotif && (
        <NotificationCircle top="0" right="0" zIndex={9999} />
      )}
      <Box overflow="auto" css={{ direction: "rtl" }}>
        <HStack alignItems="center">
          <Menu>
            <MenuButton
              as={IconButton}
              size="sm"
              variant="outline"
              icon={
                <>
                  <SettingsIcon />
                </>
              }
              position="relative"
            ></MenuButton>
            <MenuList minW="170px" zIndex={99999} className="menuList">
              {isSudo() && (
                <>
                  <MenuItem
                    maxW="170px"
                    fontSize="sm"
                    icon={<HostsIcon />}
                    onClick={onEditingHosts.bind(null, true)}
                  >
                    {t("header.hostSettings")}
                  </MenuItem>
                  <MenuItem
                    maxW="170px"
                    fontSize="sm"
                    icon={<NodesIcon />}
                    onClick={onEditingNodes.bind(null, true)}
                  >
                    {t("header.nodeSettings")}
                  </MenuItem>
                  <MenuItem
                    maxW="170px"
                    fontSize="sm"
                    icon={<NodesUsageIcon />}
                    onClick={onShowingNodesUsage.bind(null, true)}
                  >
                    {t("header.nodesUsage")}
                  </MenuItem>
                  <MenuItem
                    maxW="170px"
                    fontSize="sm"
                    icon={<ResetUsageIcon />}
                    onClick={onResetAllUsage.bind(null, true)}
                  >
                    {t("resetAllUsage")}
                  </MenuItem>
                  <MenuItem
                    maxW="170px"
                    fontSize="sm"
                    icon={<AdminLimitsIcon />}
                    onClick={onEditingAdminLimits.bind(null, true)}
                  >
                    {t("adminLimits.menu")}
                  </MenuItem>
                  <Link to="/traffic/">
                    <MenuItem
                      maxW="170px"
                      fontSize="sm"
                      icon={<TrafficManagerIcon />}
                      onClick={handleOnClose}
                    >
                      {t("traffic.menu")}
                    </MenuItem>
                  </Link>
                  <Link to="/admin-manager/">
                    <MenuItem
                      maxW="170px"
                      fontSize="sm"
                      icon={<AdminManagerIcon />}
                      onClick={handleOnClose}
                    >
                      {t("adminManager.menu")}
                    </MenuItem>
                  </Link>
                </>
              )}
              <MenuItem
                maxW="170px"
                fontSize="sm"
                icon={<CryptoLinkIcon />}
                onClick={onEditingCrypto.bind(null, true)}
              >
                {t("cryptoLink.menu")}
              </MenuItem>
              <Link to={DONATION_URL} target="_blank">
                <MenuItem
                  maxW="170px"
                  fontSize="sm"
                  icon={<DonationIcon />}
                  position="relative"
                  onClick={handleOnClose}
                >
                  {t("header.donation")}{" "}
                  {showDonationNotif && (
                    <NotificationCircle top="3" right="2" />
                  )}
                </MenuItem>
              </Link>
              <Link to="/login">
                <MenuItem maxW="170px" fontSize="sm" icon={<LogoutIcon />}>
                  {t("header.logout")}
                </MenuItem>
              </Link>
            </MenuList>
          </Menu>

          {isSudo() && (
            <IconButton
              size="sm"
              variant="outline"
              aria-label="core settings"
              onClick={() => {
                useDashboard.setState({ isEditingCore: true });
              }}
            >
              <CoreSettingsIcon />
            </IconButton>
          )}

          <Language />

          <IconButton
            size="sm"
            variant="outline"
            aria-label="switch theme"
            onClick={() => {
              updateThemeColor(colorMode == "dark" ? "light" : "dark");
              toggleColorMode();
            }}
          >
            {colorMode === "light" ? <DarkIcon /> : <LightIcon />}
          </IconButton>

          <Box
            css={{ direction: "ltr" }}
            display="flex"
            alignItems="center"
            pr="2"
            __css={{
              "&  span": {
                display: "inline-flex",
              },
            }}
          >
            {/* Temporarily disabled GitHubButton due to private repo
            <GitHubButton
              href={REPO_URL}
              data-color-scheme={`no-preference: ${gBtnColor}; light: ${gBtnColor}; dark: ${gBtnColor};`}
              data-size="large"
              data-show-count="true"
              aria-label="Star Xpert Panel on GitHub"
            >
              Star
            </GitHubButton>
            */}
          </Box>
        </HStack>
      </Box>
    </HStack>
  );
};
