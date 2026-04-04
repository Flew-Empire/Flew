import {
  Box,
  BoxProps,
  Button,
  IconButton,
  Input,
  InputGroup,
  InputLeftElement,
  InputRightElement,
  Select,
  Spinner,
  chakra,
} from "@chakra-ui/react";
import {
  ArrowPathIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import classNames from "classnames";
import { PrefetchLink } from "components/PrefetchLink";
import { useDashboard } from "contexts/DashboardContext";
import useGetUser from "hooks/useGetUser";
import { useFeatures } from "hooks/useFeatures";
import debounce from "lodash.debounce";
import React, { FC, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetch } from "service/http";

const iconProps = {
  baseStyle: {
    w: 4,
    h: 4,
  },
};

const SearchIcon = chakra(MagnifyingGlassIcon, iconProps);
const ClearIcon = chakra(XMarkIcon, iconProps);
export const ReloadIcon = chakra(ArrowPathIcon, iconProps);

type AdminItem = {
  username: string;
  is_sudo: boolean;
};

export type FilterProps = {} & BoxProps;

export const Filters: FC<FilterProps> = ({ ...props }) => {
  const { loading, filters, onFilterChange, refetchUsers } = useDashboard();
  const { t } = useTranslation();
  const { hasFeature } = useFeatures();
  const { userData, getUserIsSuccess } = useGetUser();
  const [search, setSearch] = useState(filters.search ?? "");
  const [applySearch] = useState(() =>
    debounce((value: string) => {
      useDashboard.getState().onFilterChange({
        ...useDashboard.getState().filters,
        offset: 0,
        search: value,
      });
    }, 300)
  );
  const [admins, setAdmins] = useState<AdminItem[]>([]);
  const [isScrollBlurActive, setIsScrollBlurActive] = useState(false);

  useEffect(() => {
    const updateBlurState = () => {
      setIsScrollBlurActive(window.scrollY > 0);
    };

    updateBlurState();
    window.addEventListener("scroll", updateBlurState, { passive: true });
    return () => {
      window.removeEventListener("scroll", updateBlurState);
    };
  }, []);

  useEffect(() => {
    setSearch(filters.search ?? "");
  }, [filters.search]);

  useEffect(() => {
    return () => {
      applySearch.cancel();
    };
  }, [applySearch]);

  useEffect(() => {
    if (!getUserIsSuccess || !userData?.username) {
      return;
    }

    let alive = true;
    const currentAdmin = {
      username: userData.username,
      is_sudo: !!userData.is_sudo,
    };

    if (!currentAdmin.is_sudo) {
      setAdmins([currentAdmin]);
      return;
    }

    (async () => {
      try {
        const all = await fetch("/admins");
        if (!alive) return;
        const list = Array.isArray(all) ? all : [];
        const hasMe = list.some((a) => a?.username === currentAdmin.username);
        setAdmins(
          hasMe
            ? list
            : [currentAdmin, ...list]
        );
      } catch {
        if (!alive) return;
        setAdmins([currentAdmin]);
      }
    })();

    return () => {
      alive = false;
    };
  }, [getUserIsSuccess, userData?.username, userData?.is_sudo]);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    applySearch(e.target.value);
  };

  const clear = () => {
    applySearch.cancel();
    setSearch("");
    onFilterChange({
      ...filters,
      offset: 0,
      search: "",
    });
  };

  const onAdminFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    onFilterChange({
      ...filters,
      offset: 0,
      admin: value === "__all__" ? undefined : value,
    });
  };

  const onStatusFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    onFilterChange({
      ...filters,
      offset: 0,
      status: value.length > 0 ? (value as typeof filters.status) : undefined,
    });
  };

  const canUseAdminFilter = hasFeature("admin_filter");
  const me =
    getUserIsSuccess && userData?.username
      ? { username: userData.username, is_sudo: !!userData.is_sudo }
      : null;
  const canShowAdminFilter = !!me?.is_sudo && canUseAdminFilter;
  const selectedValue =
    filters.admin === me?.username ? "__sudo_self__" : filters.admin || "__all__";
  const searchPlaceholder =
    t("search") === "search" ? "Search users..." : t("search");
  const allStatusLabel =
    t("filters.statusAll") === "filters.statusAll"
      ? "All Status"
      : t("filters.statusAll");
  const allAdminLabel =
    t("filters.adminAll") === "filters.adminAll"
      ? "All Admins"
      : t("filters.adminAll");
  const desktopColumns = canShowAdminFilter
    ? "minmax(0, 1.6fr) minmax(0, 0.92fr) minmax(0, 0.92fr) 52px auto"
    : "minmax(0, 1.8fr) minmax(0, 1fr) 52px auto";

  return (
    <Box
      id="filters"
      className="filters-shell"
      px="24px"
      py="18px"
      borderBottom="1px solid var(--divider)"
      position="relative"
      zIndex={6}
      isolation="isolate"
      {...props}
    >
      <Box
        display="grid"
        gridTemplateColumns={{ base: "repeat(2, minmax(0, 1fr))", lg: desktopColumns }}
        gap={3}
        alignItems="center"
      >
        <Box
          gridColumn={{ base: "1", lg: canShowAdminFilter ? "4" : "3" }}
          gridRow={{ base: "1", lg: "1" }}
        >
          <IconButton
            aria-label="refresh users"
            disabled={loading}
            onClick={refetchUsers}
            size="sm"
            variant="outline"
            className="icon-btn"
            w={{ base: "full", lg: "52px" }}
            icon={
              <ReloadIcon
                className={classNames({
                  "animate-spin": loading,
                })}
              />
            }
          />
        </Box>

        <Box
          gridColumn={{ base: "2", lg: canShowAdminFilter ? "5" : "4" }}
          gridRow={{ base: "1", lg: "1" }}
        >
          <Button
            size="sm"
            as={PrefetchLink}
            to="/subscription/new/"
            preload="subscriptionEditor"
            onClick={() => {
              useDashboard.getState().onEditingUser(null);
              useDashboard.getState().onCreateUser(true);
            }}
            px={6}
            py={5}
            borderRadius="12px"
            bg="var(--active)"
            color="var(--blue)"
            border="1px solid var(--blue-border)"
            fontWeight="600"
            fontSize="13px"
            boxShadow="0 6px 16px rgba(37, 99, 235, 0.1)"
            _hover={{
              bg: "var(--blue-soft)",
              transform: "translateY(-1px)",
              boxShadow: "0 8px 18px rgba(37, 99, 235, 0.12)",
            }}
            _active={{
              transform: "translateY(0)",
            }}
            transition="all 0.3s ease"
            w="full"
          >
            {t("createUser")}
          </Button>
        </Box>

        <Box
          gridColumn={{ base: "1 / -1", lg: "1" }}
          gridRow={{ base: "2", lg: "1" }}
          minW={0}
        >
          <InputGroup w="full">
            <InputLeftElement pointerEvents="none">
              <SearchIcon />
            </InputLeftElement>
            <Input
              placeholder={searchPlaceholder}
              value={search}
              borderColor="light-border"
              _dark={{ bg: "gray.750", borderColor: "gray.600" }}
              onChange={onChange}
            />

            <InputRightElement>
              {loading && <Spinner size="xs" />}
              {filters.search && filters.search.length > 0 && (
                <IconButton
                  onClick={clear}
                  aria-label="clear"
                  size="xs"
                  variant="ghost"
                  icon={<ClearIcon />}
                />
              )}
            </InputRightElement>
          </InputGroup>
        </Box>

        {canShowAdminFilter && (
          <Box
            gridColumn={{ base: "1 / -1", lg: "2" }}
            gridRow={{ base: "3", lg: "1" }}
          >
          <Select
            className="admin-filter-select filters-theme-select"
            size="md"
            borderColor="light-border"
            _dark={{ bg: "gray.750", borderColor: "gray.600" }}
            value={selectedValue}
            onChange={onAdminFilterChange}
            w="full"
            position="relative"
            zIndex={2}
          >
              <option value="__all__">{allAdminLabel}</option>
              <option value="__sudo_self__">{me?.username} (sudo)</option>
              {admins
                .filter((a) => a.username !== me?.username)
                .map((a) => (
                  <option key={a.username} value={a.username}>
                    {a.username}
                    {a.is_sudo ? " (sudo)" : ""}
                  </option>
                ))}
            </Select>
          </Box>
        )}

        <Box
          gridColumn={{
            base: "1 / -1",
            lg: canShowAdminFilter ? "3" : "2",
          }}
          gridRow={{ base: canShowAdminFilter ? "4" : "3", lg: "1" }}
        >
          <Select
            className="admin-filter-select filters-theme-select"
            size="md"
            borderColor="light-border"
            _dark={{ bg: "gray.750", borderColor: "gray.600" }}
            value={filters.status || ""}
            onChange={onStatusFilterChange}
            w="full"
            position="relative"
            zIndex={2}
          >
            <option value="">{allStatusLabel}</option>
            <option value="active">{t("status.active")}</option>
            <option value="on_hold">{t("status.on_hold")}</option>
            <option value="disabled">{t("status.disabled")}</option>
            <option value="limited">{t("status.limited")}</option>
            <option value="expired">{t("status.expired")}</option>
          </Select>
        </Box>
      </Box>
    </Box>
  );
};
