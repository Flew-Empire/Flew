import re

with open('/root/Flew/app/dashboard/chakra.config.ts', 'r') as f:
    content = f.read()

# Replace `.chakra-ui-dark .something` with `.something`
content = content.replace('.chakra-ui-dark ', '')

# Specifically replace `_dark: {` with nothing, but we have to unindent the block inside and remove its closing `},`.
# Actually simpler: just find all `_dark: {` and remove it and the matching `}`.
# Since python regex for balanced braces is tricky, let's just use string replacement if we know the indentation.
# Instead of complex regex, let's just make `_dark` identical to the root by removing `_dark: { ... }` and dumping its content to the parent.
# Wait, it's easier to just do: `_light: { ... }` ? No, `baseStyle` just needs the properties directly.
# Let's just do a manual replace or regex for the specific lines.
