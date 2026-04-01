const fs = require('fs');

const path = '/root/Flew/app/dashboard/chakra.config.ts';
let config = fs.readFileSync(path, 'utf8');

// 1. Remove all ".chakra-ui-dark " occurrences (note the space)
config = config.replace(/\.chakra-ui-dark /g, '');

// 2. We also need to strip the `_dark: { ... }` wrappers from the chakra config objects so that those properties apply globally.
// A safe way to do this in JS is to match `_dark: {` and then find the matching closing `}`.
// Alternatively, since we are doing simple replacements, we can do a regex loop.
function removeKeyWrapper(content, key) {
  let result = content;
  let re = new RegExp(key + '\\s*:\\s*\\{', 'g');
  let match;
  while ((match = re.exec(result)) !== null) {
    let start = match.index;
    let blockStart = start + match[0].length;
    
    // find balancing brace
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
      // we remove the `_dark: {` and the trailing `},` or `}`
      let inside = result.substring(blockStart, end);
      // Let's outdent inside by one level (2 spaces typically)
      inside = inside.split('\n').map(line => line.replace(/^  /, '')).join('\n');
      
      let before = result.substring(0, start);
      let after = result.substring(end + 1);
      // clean up optional trailing comma
      if (after.startsWith(',')) after = after.substring(1);
      
      result = before + inside + after;
      re.lastIndex = 0; // reset regex
    } else {
      break;
    }
  }
  return result;
}

config = removeKeyWrapper(config, '_dark');

fs.writeFileSync(path, config, 'utf8');
console.log('Fixed chakra config!');
