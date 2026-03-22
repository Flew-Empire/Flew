import {
  Alert,
  AlertDescription,
  AlertIcon,
  Box,
  Button,
  chakra,
  FormControl,
  FormLabel,
  HStack,
  Text,
  VStack,
} from "@chakra-ui/react";
import { ArrowRightOnRectangleIcon } from "@heroicons/react/24/outline";
import { zodResolver } from "@hookform/resolvers/zod";
import { FC, useEffect, useRef, useState } from "react";
import { FieldValues, useForm } from "react-hook-form";
import { useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { Footer } from "components/Footer";
import { Input } from "components/Input";
import { fetch } from "service/http";
import { removeAuthToken, setAuthToken } from "utils/authStorage";
import { ReactComponent as Logo } from "assets/logo.svg";
import { useTranslation } from "react-i18next";
import { Language } from "components/Language";

const schema = z.object({
  username: z.string().min(1, "login.fieldRequired"),
  password: z.string().min(1, "login.fieldRequired"),
});

export const LogoIcon = chakra(Logo, {
  baseStyle: {
    strokeWidth: "10px",
    w: 12,
    h: 12,
  },
});

const LoginIcon = chakra(ArrowRightOnRectangleIcon, {
  baseStyle: {
    w: 5,
    h: 5,
    strokeWidth: "2px",
  },
});

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, any>) => string;
      reset: (widgetId?: string) => void;
    };
    hcaptcha?: {
      render: (container: HTMLElement, options: Record<string, any>) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

export const Login: FC = () => {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [captchaVendor, setCaptchaVendor] = useState("");
  const [captchaSiteKey, setCaptchaSiteKey] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaReady, setCaptchaReady] = useState(false);
  const [captchaError, setCaptchaError] = useState("");
  const captchaWidgetRef = useRef<string | null>(null);
  const captchaContainerId = "login-captcha";
  const navigate = useNavigate();
  const { t } = useTranslation();
  let location = useLocation();
  const {
    register,
    formState: { errors },
    handleSubmit,
  } = useForm({
    resolver: zodResolver(schema),
  });
  useEffect(() => {
    removeAuthToken();
    if (location.pathname !== "/login") {
      navigate("/login", { replace: true });
    }
  }, []);

  const loadCaptchaScript = (vendor: string) => {
    const lower = (vendor || "turnstile").toLowerCase();
    const src =
      lower === "hcaptcha"
        ? "https://js.hcaptcha.com/1/api.js?render=explicit"
        : "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    const id = `captcha-script-${lower}`;
    return new Promise<void>((resolve, reject) => {
      if (document.getElementById(id)) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.id = id;
      script.src = src;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject();
      document.head.appendChild(script);
    });
  };

  const renderCaptcha = () => {
    const container = document.getElementById(captchaContainerId);
    if (!container || !captchaSiteKey) return;
    container.innerHTML = "";
    const vendor = (captchaVendor || "turnstile").toLowerCase();
    const options = {
      sitekey: captchaSiteKey,
      callback: (token: string) => setCaptchaToken(token),
      "expired-callback": () => setCaptchaToken(""),
      "error-callback": () => setCaptchaToken(""),
    };
    if (vendor === "hcaptcha" && window.hcaptcha?.render) {
      captchaWidgetRef.current = window.hcaptcha.render(container, options);
      setCaptchaReady(true);
      return;
    }
    if (vendor === "turnstile" && window.turnstile?.render) {
      captchaWidgetRef.current = window.turnstile.render(container, options);
      setCaptchaReady(true);
      return;
    }
    setCaptchaError(t("login.captchaLoadFailed"));
  };

  useEffect(() => {
    if (!captchaRequired) {
      setCaptchaToken("");
      setCaptchaReady(false);
      setCaptchaError("");
      return;
    }
    if (!captchaSiteKey) {
      setCaptchaError(t("login.captchaNotConfigured"));
      return;
    }
    setCaptchaReady(false);
    setCaptchaError("");
    loadCaptchaScript(captchaVendor)
      .then(renderCaptcha)
      .catch(() => setCaptchaError(t("login.captchaLoadFailed")));
  }, [captchaRequired, captchaVendor, captchaSiteKey]);

  const login = (values: any) => {
    setError("");
    if (captchaRequired && !captchaToken) {
      setError(t("login.captchaRequired"));
      return;
    }
    const formData = new FormData();
    formData.append("username", values.username);
    formData.append("password", values.password);
    formData.append("grant_type", "password");
    if (captchaToken) {
      formData.append("captcha_token", captchaToken);
    }
    setLoading(true);
    fetch("/api/admin/token", { method: "post", body: formData })
      .then(({ access_token: token }) => {
        setAuthToken(token);
        // Добавляем небольшую задержку перед навигацией
        setTimeout(() => {
          navigate("/");
        }, 100);
      })
      .catch((err) => {
        console.error("Login failed:", err);
        const data = err?.response?._data;
        const detail = data?.detail;
        let message = "Login failed";
        if (typeof detail === "string") {
          message = detail;
        } else if (detail && typeof detail === "object") {
          message = detail.detail || detail.message || message;
        }
        setError(message);

        const captchaInfo = detail && typeof detail === "object" ? detail : data;
        if (captchaInfo?.captcha_required) {
          setCaptchaRequired(true);
          setCaptchaVendor(captchaInfo.captcha_vendor || "turnstile");
          setCaptchaSiteKey(captchaInfo.captcha_site_key || "");
          setCaptchaToken("");
          const widgetId = captchaWidgetRef.current || undefined;
          if (captchaInfo.captcha_vendor === "hcaptcha" && window.hcaptcha?.reset) {
            window.hcaptcha.reset(widgetId);
          } else if (window.turnstile?.reset) {
            window.turnstile.reset(widgetId);
          }
        }
      })
      .finally(() => {
        setLoading(false);
      });
  };
  return (
    <VStack justifyContent="space-between" minH="100vh" p="6" w="full">
      <Box w="full">
        <HStack justifyContent="end" w="full">
          <Language />
        </HStack>
        <HStack w="full" justifyContent="center" alignItems="center">
          <Box w="full" maxW="340px" mt="6">
            <VStack alignItems="center" w="full">
              <LogoIcon />
              <Text fontSize="2xl" fontWeight="semibold">
                {t("login.loginYourAccount")}
              </Text>
              <Text color="gray.600" _dark={{ color: "gray.400" }}>
                {t("login.welcomeBack")}
              </Text>
            </VStack>
            <Box w="full" maxW="300px" m="auto" pt="4">
              <form onSubmit={handleSubmit(login)}>
                <VStack mt={4} rowGap={2}>
                  <FormControl>
                    <Input
                      w="full"
                      placeholder={t("username")}
                      {...register("username")}
                      error={t(errors?.username?.message as string)}
                    />
                  </FormControl>
                  <FormControl>
                    <Input
                      w="full"
                      type="password"
                      placeholder={t("password")}
                      {...register("password")}
                      error={t(errors?.password?.message as string)}
                    />
                  </FormControl>
                  {captchaRequired && (
                    <FormControl>
                      <FormLabel>{t("login.captcha")}</FormLabel>
                      <Box id={captchaContainerId} minH="64px" />
                      {!captchaReady && !captchaError && (
                        <Text fontSize="sm" color="gray.500">
                          {t("login.captchaLoading")}
                        </Text>
                      )}
                      {captchaError && (
                        <Text fontSize="sm" color="red.500">
                          {captchaError}
                        </Text>
                      )}
                    </FormControl>
                  )}
                  {error && (
                    <Alert status="error" rounded="md">
                      <AlertIcon />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                  <Button
                    isLoading={loading}
                    type="submit"
                    w="full"
                    colorScheme="primary"
                  >
                    {<LoginIcon marginRight={1} />}
                    {t("login")}
                  </Button>
                </VStack>
              </form>
            </Box>
          </Box>
        </HStack>
      </Box>
      <Footer />
    </VStack>
  );
};

export default Login;
