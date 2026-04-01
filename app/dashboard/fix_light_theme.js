const fs = require('fs');

const path = '/root/Flew/app/dashboard/chakra.config.ts';
let config = fs.readFileSync(path, 'utf8');

// The goal: For every occurrence of `.chakra-ui-dark`, append `, .chakra-ui-light` so the CSS applies to both modes.
// And change `_dark:` inside Chakra's JS object syntax to instead be `_light: { ... }, _dark: { ... }` ?
// Wait, `_light` is a valid CSS pseudo-prop selector in chakra-ui? Let's assume it might not be native. 
// Instead of messing with pseudo props, Chakra allows `_dark` and `_light`. 
// Let's replace `_dark: {` with `_dark: {`, but also duplicate it for `_light`.
// Actually, it's safer to just replace `_dark: {` with `baseStyle` properties if it's the only one, 
// BUT wait, we can just replace `.chakra-ui-dark ` with `.chakra-ui-dark, .chakra-ui-light `
// And for `_dark:` we can just replace `_dark: {` with `_light: { ... }, _dark: {`.

// Rather than parsing JS, let's just make `_dark:` apply to Light mode too. 
// A very clean approach: Since they want ONLY the background gradient to differ, 
// and the components should all look like dark glass, let's just use `.chakra-ui-dark, .chakra-ui-light` for the string selectors.
config = config.replace(/\.chakra-ui-dark /g, '.chakra-ui-dark, .chakra-ui-light ');

// For JS objects like `_dark: { bg: ... }`, we can replace `_dark:` with `_dark: { ... }, _light:`? It's tricky to duplicate balanced blocks with regex.
// Instead we'll use a replacer function:
function duplicateDarkForLight(content) {
  let result = content;
  let re = /_dark\s*:\s*\{/g;
  let match;
  while ((match = re.exec(result)) !== null) {
    let start = match.index;
    let blockStart = start + match[0].length;
    
    let braces = 1;
    let end = -1;
    for (let i = blockStart; i < result.length; i++) {
      if (result[i] === '{') braces++;
      if (result[i] === '}') braces--;
      if (braces === 0) {
        end = i;
        break;
      }
    }
    
    if (end !== -1) {
      let blockStr = result.substring(start, end + 1); // includes `_dark: { ... }`
      let lightBlockStr = blockStr.replace('_dark', '_light');
      
      let before = result.substring(0, start);
      let after = result.substring(end + 1);
      
      result = before + lightBlockStr + ',\n          ' + blockStr + after;
      re.lastIndex = before.length + lightBlockStr.length + 12 + blockStr.length; // move index past both
    } else {
      break;
    }
  }
  return result;
}

config = duplicateDarkForLight(config);

// Let's ensure the body bg has the proper gradient for light mode
// Find the body property and rewrite it completely
const bodyReplacement = `      body: {
        bg: "#8a8a8a",
        backgroundImage: "var(--bg)",
        backgroundAttachment: "fixed",
        color: "rgba(255,255,255,0.92)",
        _light: {
          bg: "#8a8a8a",
          backgroundImage: "var(--bg)",
          backgroundAttachment: "fixed",
          color: "rgba(255,255,255,0.92)",
        },
        _dark: {
          bg: "#1a1a2e",
          backgroundImage: "linear-gradient(135deg, #16213e 0%, #1a1a2e 50%, #0f3460 100%)",
          backgroundAttachment: "fixed",
          color: "rgba(255,255,255,0.92)",
        },
      },`;
      
// simple string replacement for body block
// We'll just replace from `body: {` up to `},` before `.chakra-card`
let bodyStart = config.indexOf('body: {');
let bodyEnd = config.indexOf('.chakra-card,', bodyStart);
if (bodyStart > -1 && bodyEnd > -1) {
    // Find the closing brace of body block
    let endBrace = config.lastIndexOf('},', bodyEnd);
    config = config.substring(0, bodyStart) + bodyReplacement + '\n        "' + config.substring(bodyEnd);
}

// Fix table th bg which was white in light mode:
config = config.replace(
  `th: {
          background: "#F9FAFB",`,
  `th: {
          background: "transparent",
          color: "rgba(255,255,255,0.92)",`
);

fs.writeFileSync(path, config, 'utf8');
console.log('Fixed chakra config for light theme!');
