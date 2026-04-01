export const copyToClipboard = async (text: string): Promise<boolean> => {
  if (
    typeof navigator !== "undefined" &&
    typeof window !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function" &&
    window.isSecureContext
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return fallbackCopy(text);
    }
  }
  return fallbackCopy(text);
};

const fallbackCopy = (text: string): boolean => {
  if (typeof document === 'undefined') {
    return false;
  }
  
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  textArea.style.top = "-9999px";
  textArea.style.opacity = "0";
  
  document.body.appendChild(textArea);
  
  try {
    textArea.focus();
    textArea.select();
    const result = document.execCommand("copy");
    return result;
  } catch (error) {
    return false;
  } finally {
    if (document.body.contains(textArea)) {
      document.body.removeChild(textArea);
    }
  }
};

export const readFromClipboard = async (
  promptMessage = "Paste text here"
): Promise<string | null> => {
  if (
    typeof navigator !== "undefined" &&
    typeof window !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.readText === "function" &&
    window.isSecureContext
  ) {
    try {
      return await navigator.clipboard.readText();
    } catch {
      // Fall through to manual paste fallback.
    }
  }

  if (typeof window === "undefined" || typeof window.prompt !== "function") {
    return null;
  }

  const value = window.prompt(promptMessage, "");
  if (value === null) {
    return null;
  }
  return value;
};
