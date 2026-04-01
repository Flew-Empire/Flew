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
        bg: "transparent",
        backgroundImage: "none",
        backgroundAttachment: "fixed",
        color: "var(--text)",
      },
      ".chakra-card, .chakra-modal__content, .chakra-drawer__content, .chakra-menu__menu-list, .chakra-alert": {
        position: "relative",
        overflow: "hidden",
        isolation: "isolate",
        borderColor: "var(--border) !important",
        boxShadow: "var(--panel-shadow)",
        bg: "var(--surface-elevated)",
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
        position: "relative",
        overflow: "hidden",
        isolation: "isolate",
        borderColor: "var(--border) !important",
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
        borderRadius: "14px",
        transition: "all .2s ease",
        _focusVisible: {
          boxShadow: "0 0 0 1px var(--blue)",
        },
      },
    },
    Card: {
      baseStyle: {
        container: {
          bg: "var(--surface-elevated)",
          border: "1px solid var(--border)",
          borderRadius: "18px",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          boxShadow: "var(--panel-shadow)",
        },
      },
    },
    Alert: {
      baseStyle: {
        container: {
          borderRadius: "14px",
          fontSize: "sm",
          bg: "var(--surface-elevated)",
          color: "var(--text)",
          border: "1px solid var(--border)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
        },
      },
    },
    Menu: {
      baseStyle: {
        list: {
          bg: "var(--surface-elevated)",
          borderColor: "var(--border)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          boxShadow: "var(--panel-shadow)",
        },
        item: {
          bg: "transparent",
          color: "var(--text)",
          _hover: {
            bg: "var(--hover)",
          },
          _focus: {
            bg: "var(--hover)",
          },
        },
      },
    },
    Modal: {
      baseStyle: {
        dialog: {
          bg: "var(--surface-elevated)",
          border: "1px solid var(--border)",
          borderRadius: "24px",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
        },
      },
    },
    Drawer: {
      baseStyle: {
        dialog: {
          bg: "var(--surface-elevated)",
          borderLeft: "1px solid var(--border)",
          borderRadius: "24px",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
        },
      },
    },
    Select: {
      baseStyle: {
        field: {
          borderRadius: "14px",
          bg: "var(--input-bg)",
          borderColor: "var(--border)",
          color: "var(--text)",
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
        color: "var(--muted)",
      },
    },
    Input: {
      baseStyle: {
        addon: {
          borderColor: "var(--border)",
          bg: "var(--input-bg)",
          color: "var(--text)",
        },
        field: {
          borderRadius: "14px",
          bg: "var(--input-bg)",
          borderColor: "var(--border)",
          color: "var(--text)",
          _focusVisible: {
            boxShadow: "none",
            borderColor: "var(--blue)",
            outlineColor: "var(--blue)",
          },
        },
      },
    },
    Textarea: {
      baseStyle: {
        borderRadius: "14px",
        bg: "var(--input-bg)",
        borderColor: "var(--border)",
        color: "var(--text)",
        _focusVisible: {
          boxShadow: "none",
          borderColor: "var(--blue)",
          outlineColor: "var(--blue)",
        },
      },
    },
    NumberInput: {
      baseStyle: {
        field: {
          borderRadius: "14px",
          bg: "var(--input-bg)",
          borderColor: "var(--border)",
          color: "var(--text)",
          _focusVisible: {
            boxShadow: "none",
            borderColor: "var(--blue)",
            outlineColor: "var(--blue)",
          },
        },
        stepperGroup: {
          bg: "var(--surface-soft)",
          borderColor: "var(--border)",
        },
        stepper: {
          borderColor: "var(--border)",
          color: "var(--text)",
          _hover: {
            bg: "var(--hover)",
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
          background: "var(--surface-soft)",
          borderColor: "var(--divider) !important",
          borderBottomColor: "var(--divider) !important",
          borderTop: "0px solid",
          borderTopColor: "transparent !important",
          color: "var(--muted)",
          _first: {
            borderLeft: "0px solid",
            borderColor: "transparent !important",
          },
          _last: {
            borderRight: "0px solid",
            borderColor: "transparent !important",
          },
        },
        td: {
          transition: "all .1s ease-out",
          borderColor: "var(--divider)",
          borderBottomColor: "var(--divider) !important",
          color: "var(--text)",
          _first: {
            borderLeft: "0px solid",
            borderColor: "transparent",
          },
          _last: {
            borderRight: "0px solid",
            borderColor: "transparent",
          },
        },
        tr: {
          "&.interactive": {
            cursor: "pointer",
            _hover: {
              "& > td": {
                bg: "var(--hover)",
                boxShadow: "none",
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
  config: {
    initialColorMode: "dark",
    useSystemColorMode: false,
  },
});
