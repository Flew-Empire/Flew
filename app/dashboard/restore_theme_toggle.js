const fs = require('fs');

const path = '/root/Flew/app/dashboard/src/components/Header.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add back import:
if (!content.includes('import { updateThemeColor }')) {
  content = content.replace(
    'import { Language } from "./Language";',
    'import { updateThemeColor } from "utils/themeColor";\nimport { Language } from "./Language";\nimport { HeaderThemeToggle } from "./HeaderThemeToggle";'
  );
}

// 2. Add back HeaderThemeToggle definition correctly (if it doesn't exist)
// Wait, I created a component called HeaderThemeToggle? Or it was imported?
// Ah! In my `view_file` output from step 858, HeaderThemeToggle WAS defined IN Header.tsx! Wait!
// Let's look at step 863 replaced content:
// I removed:
// const ThemeDarkIcon = chakra(MoonIcon, plainHeaderIconProps);
// const ThemeLightIcon = chakra(SunIcon, plainHeaderIconProps);
// const HeaderThemeToggle = ...

// Let's add it back above `export const Header:`
const componentStr = `
const ThemeDarkIcon = chakra(MoonIcon, plainHeaderIconProps);
const ThemeLightIcon = chakra(SunIcon, plainHeaderIconProps);

const HeaderThemeToggle: FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { colorMode, toggleColorMode } = useColorMode();
  const isDark = colorMode === "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  const handleToggle = () => {
    const nextMode = isDark ? "light" : "dark";
    toggleColorMode();
    if (typeof updateThemeColor === 'function') {
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

export const Header: FC<HeaderProps> = ({ actions }) => {`;

if (!content.includes('const HeaderThemeToggle')) {
  content = content.replace('export const Header: FC<HeaderProps> = ({ actions }) => {', componentStr);
}

// 3. Add back rendering:
// Next to <Language />
content = content.replace(
  '<Language />\n\n            {showWorkspaceLinks && (',
  '<Language />\n            <HeaderThemeToggle />\n\n            {showWorkspaceLinks && ('
);

content = content.replace(
  '<Language compact />\n            <IconButton',
  '<Language compact />\n            <HeaderThemeToggle compact />\n            <IconButton'
);

fs.writeFileSync(path, content, 'utf8');
console.log("Restored HeaderThemeToggle");
