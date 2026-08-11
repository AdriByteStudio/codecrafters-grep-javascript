function isDigit(ch) {
  return ch >= "0" && ch <= "9";
}

function isWord(ch) {
  const isLower = ch >= "a" && ch <= "z";
  const isUpper = ch >= "A" && ch <= "Z";
  return isLower || isUpper || isDigit(ch) || ch === "_";
}

function parsePattern(pattern) {
  let isStartAnchored = false;
  let isEndAnchored = false;
  let rawPattern = pattern;

  if (rawPattern.startsWith("^")) {
    isStartAnchored = true;
    rawPattern = rawPattern.slice(1);
  }

  if (rawPattern.endsWith("$")) {
    isEndAnchored = true;
    rawPattern = rawPattern.slice(0, -1);
  }

  const tokens = [];

  function attachQuantifier(qchar) {
    if (tokens.length === 0 || tokens[tokens.length - 1].quantifier) {
      tokens.push({ type: "literal", value: qchar });
      return;
    }

    tokens[tokens.length - 1].quantifier = qchar;
  }

  for (let i = 0; i < rawPattern.length;) {
    const ch = rawPattern[i];

    if (ch === "+") {
      attachQuantifier("+");

      i += 1;
      continue;
    }

    if (ch === "?") {
      attachQuantifier("?");

      i += 1;
      continue;
    }

    if (ch === "\\") {
      const escaped = rawPattern[i + 1];
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
      const closeIndex = rawPattern.indexOf("]", i + 1);
      if (closeIndex === -1) {
        throw new Error(`Invalid pattern ${pattern}`);
      }

      const content = rawPattern.slice(i + 1, closeIndex);
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

  return { tokens, isStartAnchored, isEndAnchored };
}

function matchAt(inputLine, startIndex, tokens, isEndAnchored = false) {
  function tokenMatches(token, ch) {
    if (token.type === "digit") {
      return isDigit(ch);
    }

    if (token.type === "word") {
      return isWord(ch);
    }

    if (token.type === "posGroup") {
      return token.chars.has(ch);
    }

    if (token.type === "negGroup") {
      return !token.chars.has(ch);
    }

    return ch === token.value;
  }

  function matchFrom(inputIndex, tokenIndex) {
    if (tokenIndex === tokens.length) {
      return !isEndAnchored || inputIndex === inputLine.length;
    }

    const token = tokens[tokenIndex];

    if (token.quantifier !== "+" && token.quantifier !== "?") {
      if (inputIndex >= inputLine.length || !tokenMatches(token, inputLine[inputIndex])) {
        return false;
      }

      return matchFrom(inputIndex + 1, tokenIndex + 1);
    }

    if (token.quantifier === "?") {
      if (inputIndex < inputLine.length && tokenMatches(token, inputLine[inputIndex])) {
        if (matchFrom(inputIndex + 1, tokenIndex + 1)) {
          return true;
        }
      }

      return matchFrom(inputIndex, tokenIndex + 1);
    }

    let maxIndex = inputIndex;
    while (maxIndex < inputLine.length && tokenMatches(token, inputLine[maxIndex])) {
      maxIndex += 1;
    }

    // Require one or more matches, then backtrack from greedy to minimal.
    if (maxIndex === inputIndex) {
      return false;
    }

    for (let nextIndex = maxIndex; nextIndex > inputIndex; nextIndex -= 1) {
      if (matchFrom(nextIndex, tokenIndex + 1)) {
        return true;
      }
    }

    return false;
  }

  return matchFrom(startIndex, 0);
}

function matchPattern(inputLine, pattern) {
  const { tokens, isStartAnchored, isEndAnchored } = parsePattern(pattern);

  if (isStartAnchored) {
    return matchAt(inputLine, 0, tokens, isEndAnchored);
  }

  for (let startIndex = 0; startIndex <= inputLine.length; startIndex += 1) {
    if (matchAt(inputLine, startIndex, tokens, isEndAnchored)) {
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
