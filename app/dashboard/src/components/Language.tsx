import {
  Button,
  Icon,
  IconButton,
  IconProps,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
} from "@chakra-ui/react";
import { FC } from "react";
import { useTranslation } from "react-i18next";

type LanguageProps = {
  compact?: boolean;
};

const TranslateIcon: FC<IconProps> = (props) => (
  <Icon
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M5.75 5.5A1.75 1.75 0 0 1 7.5 3.75h6A1.75 1.75 0 0 1 15.25 5.5v6A1.75 1.75 0 0 1 13.5 13.25h-6A1.75 1.75 0 0 1 5.75 11.5Z" />
    <path d="M10.5 20.25h6A1.75 1.75 0 0 0 18.25 18.5v-6A1.75 1.75 0 0 0 16.5 10.75h-1.25" />
    <path d="m8 10.75 2-5 2 5" />
    <path d="M8.75 8.8h2.5" />
    <path d="M14.25 12.75h3.5" />
    <path d="M16 12.75c0 2.15-1 4.1-2.75 5.5" />
    <path d="M14.5 15.75c1.2-.15 2.75-.85 3.75-2.25" />
  </Icon>
);

export const Language: FC<LanguageProps> = ({ compact = false }) => {
  const { i18n } = useTranslation();
  const currentLanguage = (i18n.resolvedLanguage || i18n.language || "en").toLowerCase();
  const currentLabel = currentLanguage.startsWith("fa")
    ? "FA"
    : currentLanguage.startsWith("ru")
      ? "RU"
      : currentLanguage.startsWith("zh")
        ? "ZH"
        : "EN";

  var changeLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
  };

  return (
    <Menu placement="bottom-end">
      {compact ? (
        <MenuButton
          as={IconButton}
          aria-label="Change language"
          size="sm"
          variant="ghost"
          className="icon-btn header-icon-btn"
          icon={<TranslateIcon boxSize="18px" />}
        />
      ) : (
        <MenuButton
          as={Button}
          size="sm"
          variant="ghost"
          className="nav-link"
          leftIcon={<TranslateIcon boxSize="22px" />}
        >
          {currentLabel}
        </MenuButton>
      )}
      <MenuList minW="100px" zIndex={9999}>
        <MenuItem
          maxW="100px"
          fontSize="sm"
          onClick={() => changeLanguage("en")}
        >
          English
        </MenuItem>
        <MenuItem
          maxW="100px"
          fontSize="sm"
          onClick={() => changeLanguage("fa")}
        >
          فارسی
        </MenuItem>
        <MenuItem
          maxW="100px"
          fontSize="sm"
          onClick={() => changeLanguage("zh-cn")}
        >
          简体中文
        </MenuItem>
        <MenuItem
          maxW="100px"
          fontSize="sm"
          onClick={() => changeLanguage("ru")}
        >
          Русский
        </MenuItem>
      </MenuList>
    </Menu>
  );
};
