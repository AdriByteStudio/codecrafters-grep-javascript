function isDigit(ch) {
  return ch >= "0" && ch <= "9";
}

function isWord(ch) {
  const isLower = ch >= "a" && ch <= "z";
  const isUpper = ch >= "A" && ch <= "Z";
  return isLower || isUpper || isDigit(ch) || ch === "_";
}

function parsePattern(pattern) {
  const tokens = [];

  for (let i = 0; i < pattern.length;) {
    const ch = pattern[i];

    if (ch === "\\") {
      const escaped = pattern[i + 1];
      if (escaped === undefined) {
        throw new Error(`Invalid pattern ${pattern}`);
      }

      if (escaped === "d") {
        tokens.push({ type: "digit" });
      } else if (escaped === "w") {
        tokens.push({ type: "word" });
      } else {
        tokens.push({ type: "literal", value: escaped });
      }

      i += 2;
      continue;
    }

    if (ch === "[") {
      const closeIndex = pattern.indexOf("]", i + 1);
      if (closeIndex === -1) {
        throw new Error(`Invalid pattern ${pattern}`);
      }

      const content = pattern.slice(i + 1, closeIndex);
      if (content.startsWith("^")) {
        tokens.push({ type: "negGroup", chars: new Set(content.slice(1)) });
      } else {
        tokens.push({ type: "posGroup", chars: new Set(content) });
      }

      i = closeIndex + 1;
      continue;
    }

    tokens.push({ type: "literal", value: ch });
    i += 1;
  }

  return tokens;
}

function matchAt(inputLine, startIndex, tokens) {
  let inputIndex = startIndex;

  for (const token of tokens) {
    if (inputIndex >= inputLine.length) {
      return false;
    }

    const ch = inputLine[inputIndex];

    if (token.type === "digit" && !isDigit(ch)) {
      return false;
    }

    if (token.type === "word" && !isWord(ch)) {
      return false;
    }

    if (token.type === "posGroup" && !token.chars.has(ch)) {
      return false;
    }

    if (token.type === "negGroup" && token.chars.has(ch)) {
      return false;
    }

    if (token.type === "literal" && ch !== token.value) {
      return false;
    }

    inputIndex += 1;
  }

  return true;
}

function matchPattern(inputLine, pattern) {
  const tokens = parsePattern(pattern);

  for (let startIndex = 0; startIndex < inputLine.length; startIndex += 1) {
    if (matchAt(inputLine, startIndex, tokens)) {
      return true;
    }
  }

  return false;
}

function main() {
  const pattern = process.argv[3];
  let inputLine = require("fs").readFileSync(0, "utf-8");

  if (inputLine.endsWith("\n")) {
    inputLine = inputLine.slice(0, -1);
  }

  if (process.argv[2] !== "-E") {
    console.log("Expected first argument to be '-E'");
    process.exit(1);
  }

  // You can use print statements as follows for debugging, they'll be visible when running tests.
  console.error("Logs from your program will appear here");

  if (matchPattern(inputLine, pattern)) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

main();
