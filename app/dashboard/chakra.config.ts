import { extendTheme } from "@chakra-ui/react";
export const theme = extendTheme({
  shadows: { outline: "0 0 0 2px var(--chakra-colors-primary-200)" },
  fonts: {
    body: `Inter,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Oxygen,Ubuntu,Cantarell,Fira Sans,Droid Sans,Helvetica Neue,sans-serif`,
  },
  colors: {
    "light-border": "#d2d2d4",
    primary: {
      50: "#9cb7f2",
      100: "#88a9ef",
      200: "#749aec",
      300: "#618ce9",
      400: "#4d7de7",
      500: "#396fe4",
      600: "#3364cd",
      700: "#2e59b6",
      800: "#284ea0",
      900: "#224389",
    },
    gray: {
      700: "#040609",
      750: "#040609",
    },
  },
  styles: {
    global: {
      ":root": {
        "--lg-edge": "rgba(255,255,255,0.22)",
        "--lg-edge-soft": "rgba(191,219,254,0.18)",
      },
      body: {
        bg: "#8a8a8a",
        backgroundImage: "linear-gradient(135deg, #7a7a8a 0%, #8a8a8a 50%, #7a8090 100%)",
        backgroundAttachment: "fixed",
        _dark: {
          bg: "#1a1a2e",
          backgroundImage: "linear-gradient(135deg, #16213e 0%, #1a1a2e 50%, #0f3460 100%)",
          backgroundAttachment: "fixed",
        },
      },
        ".chakra-card, .chakra-modal__content, .chakra-drawer__content, .chakra-menu__menu-list, .chakra-alert": {
        _dark: {
          position: "relative",
          overflow: "hidden",
          isolation: "isolate",
          borderColor: "rgba(191, 219, 254, 0.28) !important",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(148,163,184,0.12), 0 8px 32px rgba(0,0,0,0.22)",
        },
      },
      ".chakra-card::before, .chakra-modal__content::before, .chakra-drawer__content::before, .chakra-menu__menu-list::before, .chakra-alert::before": {
        content: '""',
        position: "absolute",
        inset: "0",
        pointerEvents: "none",
        opacity: 0,
        transition: "opacity .25s ease",
      },
      ".chakra-card::after, .chakra-modal__content::after, .chakra-drawer__content::after, .chakra-menu__menu-list::after, .chakra-alert::after": {
        content: '""',
        position: "absolute",
        inset: "0",
        pointerEvents: "none",
        opacity: 0,
        transition: "opacity .25s ease",
      },
      ".chakra-ui-dark .chakra-card::before, .chakra-ui-dark .chakra-modal__content::before, .chakra-ui-dark .chakra-drawer__content::before, .chakra-ui-dark .chakra-menu__menu-list::before, .chakra-ui-dark .chakra-alert::before": {
        opacity: 1,
        background: "linear-gradient(145deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.02) 38%, rgba(191,219,254,0.08) 100%)",
      },
      ".chakra-ui-dark .chakra-card::after, .chakra-ui-dark .chakra-modal__content::after, .chakra-ui-dark .chakra-drawer__content::after, .chakra-ui-dark .chakra-menu__menu-list::after, .chakra-ui-dark .chakra-alert::after": {
        opacity: 1,
        boxShadow: "inset 1px 1px 0 rgba(255,255,255,0.18), inset -1px -1px 0 rgba(148,163,184,0.15), inset 0 0 6px rgba(255,255,255,0.10)",
      },
      ".chakra-button, .chakra-input, .chakra-select, .chakra-textarea": {
        _dark: {
          position: "relative",
          overflow: "hidden",
          isolation: "isolate",
          borderColor: "rgba(191, 219, 254, 0.28) !important",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -1px 0 rgba(148,163,184,0.12)",
        },
      },
      ".chakra-button::after, .chakra-input::after, .chakra-select::after, .chakra-textarea::after": {
        content: '""',
        position: "absolute",
        inset: "0",
        pointerEvents: "none",
        opacity: 0,
        transition: "opacity .2s ease",
      },
      ".chakra-ui-dark .chakra-input, .chakra-ui-dark .chakra-textarea, .chakra-ui-dark .chakra-select": {
        bg: "rgba(19, 24, 45, 0.5) !important",
        borderColor: "rgba(148, 163, 184, 0.5) !important",
        color: "#dbe7ff",
      },
      ".chakra-ui-dark .chakra-numberinput__field": {
        bg: "rgba(19, 24, 45, 0.5) !important",
        borderColor: "rgba(148, 163, 184, 0.5) !important",
        color: "#dbe7ff",
      },
        ".chakra-ui-dark .chakra-accordion__item": {
        bg: "rgba(13, 18, 36, 0.46)",
        border: "1px solid rgba(191, 219, 254, 0.2)",
        borderRadius: "10px",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -1px 0 rgba(148,163,184,0.08), 0 8px 20px rgba(0,0,0,0.18)",
      },
      ".chakra-ui-dark .chakra-accordion__button": {
        borderRadius: "10px",
      },
      ".chakra-ui-dark .chakra-accordion__panel": {
        borderTop: "1px solid rgba(191, 219, 254, 0.14)",
      },
      ".chakra-ui-dark .chakra-button::after, .chakra-ui-dark .chakra-input::after, .chakra-ui-dark .chakra-select::after, .chakra-ui-dark .chakra-textarea::after": {
        opacity: 1,
        boxShadow:
          "inset 1px 1px 0 rgba(255,255,255,0.14), inset -1px -1px 0 rgba(148,163,184,0.12)",
      },
      ".chakra-ui-dark .chakra-toast .chakra-alert::before, .chakra-ui-dark .chakra-toast .chakra-alert::after": {
        opacity: 0,
      },
      ".chakra-ui-dark .chakra-toast .chakra-alert": {
        border: "1px solid rgba(148, 163, 184, 0.4) !important",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 8px 28px rgba(0,0,0,0.28)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      },
      ".chakra-ui-dark .chakra-toast .chakra-alert[data-status='success']": {
        bg: "rgba(16, 185, 129, 0.18)",
        borderColor: "rgba(16, 185, 129, 0.55) !important",
        color: "#d1fae5",
      },
      ".chakra-ui-dark .chakra-toast .chakra-alert[data-status='error']": {
        bg: "rgba(244, 63, 94, 0.2)",
        borderColor: "rgba(251, 113, 133, 0.55) !important",
        color: "#ffe4e6",
      },
      ".chakra-ui-dark .chakra-toast .chakra-alert[data-status='warning']": {
        bg: "rgba(245, 158, 11, 0.22)",
        borderColor: "rgba(251, 191, 36, 0.55) !important",
        color: "#ffedd5",
      },
      ".chakra-ui-dark .chakra-toast .chakra-alert[data-status='info'], .chakra-ui-dark .chakra-toast .chakra-alert[data-status='loading']": {
        bg: "rgba(59, 130, 246, 0.22)",
        borderColor: "rgba(96, 165, 250, 0.55) !important",
        color: "#dbeafe",
      },
      ".chakra-ui-dark .chakra-toast .chakra-alert .chakra-alert__icon, .chakra-ui-dark .chakra-toast .chakra-alert .chakra-alert__title, .chakra-ui-dark .chakra-toast .chakra-alert .chakra-alert__desc": {
        color: "inherit",
      },
      ".chakra-ui-dark .chakra-toast .chakra-alert .chakra-close-button": {
        color: "inherit",
        opacity: 0.9,
      },
      ".chakra-ui-dark .chakra-toast .chakra-alert .chakra-close-button:hover": {
        bg: "rgba(15, 23, 42, 0.35)",
        opacity: 1,
      },
      ".flew-page-shift": {
        transition: "padding .25s ease",
        paddingRight: "0 !important",
        "@media (min-width: 1024px)": {
          paddingRight: "340px !important",
        },
      },
      "@media (min-width: 48em)": {
        ".flew-side-open main": {
          paddingRight:
            "calc(var(--flew-side-menu-width, 240px) + var(--flew-side-menu-right, 10px) + var(--flew-side-menu-content-gap, 16px))",
          transition: "padding-right .25s ease",
        },
        ".flew-side-open .flew-page-shift": {
          transform: "none",
        },
      },
    },
  },
  components: {
    Button: {
      baseStyle: {
        _dark: {
          bg: "rgba(23, 28, 52, 0.42)",
          color: "#dbe7ff",
          border: "1px solid rgba(191, 219, 254, 0.3)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(148,163,184,0.10), 0 8px 24px rgba(0,0,0,0.22)",
          transition: "all .2s ease",
          _hover: {
            bg: "rgba(30, 37, 67, 0.52)",
            borderColor: "rgba(96, 165, 250, 0.42)",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.24), 0 0 14px rgba(77,99,255,0.24)",
          },
          _active: {
            bg: "rgba(36, 43, 78, 0.58)",
          },
        },
      },
    },
    Card: {
      baseStyle: {
        container: {
          _dark: {
            bg: "rgba(15, 20, 40, 0.46)",
            border: "1px solid rgba(191, 219, 254, 0.28)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(148,163,184,0.10), 0 8px 28px rgba(0,0,0,0.22)",
          },
        },
      },
    },
    Alert: {
      baseStyle: {
        container: {
          borderRadius: "6px",
          fontSize: "sm",
          bg: "var(--chakra-alert-bg)",
          color: "var(--chakra-alert-fg)",
          _dark: {
            border: "1px solid rgba(191, 219, 254, 0.28)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
          },
        },
      },
    },
    Menu: {
      baseStyle: {
        list: {
          _dark: {
            bg: "rgba(11, 16, 31, 0.74)",
            borderColor: "rgba(191, 219, 254, 0.3)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(148,163,184,0.10), 0 8px 28px rgba(0,0,0,0.22)",
          },
        },
        item: {
          _dark: {
            bg: "transparent",
            _hover: {
              bg: "rgba(77, 99, 255, 0.18)",
            },
            _focus: {
              bg: "rgba(77, 99, 255, 0.2)",
            },
          },
        },
      },
    },
    Modal: {
      baseStyle: {
        dialog: {
          _dark: {
            bg: "rgba(11, 16, 31, 0.74)",
            border: "1px solid rgba(191, 219, 254, 0.3)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
          },
        },
      },
    },
    Drawer: {
      baseStyle: {
        dialog: {
          _dark: {
            bg: "rgba(11, 16, 31, 0.74)",
            borderLeft: "1px solid rgba(191, 219, 254, 0.3)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
          },
        },
      },
    },
    Select: {
      baseStyle: {
        field: {
          _dark: {
            borderRadius: "6px",
            bg: "rgba(19, 24, 45, 0.5)",
            borderColor: "rgba(148, 163, 184, 0.5)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          },
          _light: {
            borderRadius: "6px",
          },
        },
      },
    },
    FormHelperText: {
      baseStyle: {
        fontSize: "xs",
      },
    },
    FormLabel: {
      baseStyle: {
        fontSize: "sm",
        fontWeight: "medium",
        mb: "1",
        _dark: { color: "gray.300" },
      },
    },
    Input: {
      baseStyle: {
        addon: {
          _dark: {
            borderColor: "gray.600",
            _placeholder: {
              color: "gray.500",
            },
          },
        },
        field: {
          _focusVisible: {
            boxShadow: "none",
            borderColor: "primary.200",
            outlineColor: "primary.200",
          },
          _dark: {
            borderColor: "gray.600",
            bg: "rgba(19, 24, 45, 0.5)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            _disabled: {
              color: "gray.400",
              borderColor: "gray.500",
            },
            _placeholder: {
              color: "gray.500",
            },
          },
        },
      },
    },
    Textarea: {
      baseStyle: {
        _focusVisible: {
          boxShadow: "none",
          borderColor: "primary.200",
          outlineColor: "primary.200",
        },
        _dark: {
          borderColor: "gray.600",
          bg: "rgba(19, 24, 45, 0.5)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          _disabled: {
            color: "gray.400",
            borderColor: "gray.500",
          },
          _placeholder: {
            color: "gray.500",
          },
        },
      },
    },
    NumberInput: {
      baseStyle: {
        field: {
          _focusVisible: {
            boxShadow: "none",
            borderColor: "primary.200",
            outlineColor: "primary.200",
          },
          _dark: {
            borderColor: "gray.600",
            bg: "rgba(19, 24, 45, 0.5)",
            color: "#dbe7ff",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            _placeholder: {
              color: "gray.500",
            },
          },
        },
        stepperGroup: {
          _dark: {
            bg: "rgba(19, 24, 45, 0.35)",
            borderColor: "rgba(148, 163, 184, 0.45)",
          },
        },
        stepper: {
          _dark: {
            borderColor: "rgba(148, 163, 184, 0.35)",
            color: "#dbe7ff",
            _hover: {
              bg: "rgba(77, 99, 255, 0.18)",
            },
          },
        },
      },
    },
    Table: {
      baseStyle: {
        table: {
          borderCollapse: "separate",
          borderSpacing: 0,
        },
        thead: {
          borderBottomColor: "light-border",
        },
        th: {
          background: "#F9FAFB",
          borderColor: "light-border !important",
          borderBottomColor: "light-border !important",
          borderTop: "1px solid ",
          borderTopColor: "light-border !important",
          _first: {
            borderLeft: "1px solid",
            borderColor: "light-border !important",
          },
          _last: {
            borderRight: "1px solid",
            borderColor: "light-border !important",
          },
          _dark: {
            borderColor: "gray.600 !important",
            background: "gray.750",
          },
        },
        td: {
          transition: "all .1s ease-out",
          borderColor: "light-border",
          borderBottomColor: "light-border !important",
          _first: {
            borderLeft: "1px solid",
            borderColor: "light-border",
            _dark: {
              borderColor: "gray.600",
            },
          },
          _last: {
            borderRight: "1px solid",
            borderColor: "light-border",
            _dark: {
              borderColor: "gray.600",
            },
          },
          _dark: {
            borderColor: "gray.600",
            borderBottomColor: "gray.600 !important",
          },
        },
        tr: {
          "&.interactive": {
            cursor: "pointer",
            _hover: {
              "& > td": {
                bg: "gray.200",
              },
              _dark: {
                "& > td": {
                  bg: "rgba(37, 55, 112, 0.34)",
                  boxShadow: "none",
                },
              },
            },
          },
          _last: {
            "& > td": {
              _first: {
                borderBottomLeftRadius: "8px",
              },
              _last: {
                borderBottomRightRadius: "8px",
              },
            },
          },
        },
      },
    },
  },
});
