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

    if (ch === ".") {
      tokens.push({ type: "wildcard" });
      i += 1;
      continue;
    }

    tokens.push({ type: "literal", value: ch });
    i += 1;
  }

  return { tokens, isStartAnchored, isEndAnchored };
}

function matchAtEndIndex(inputLine, startIndex, tokens, isEndAnchored = false) {
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

    if (token.type === "wildcard") {
      return ch !== "\n";
    }

    return ch === token.value;
  }

  function matchFrom(inputIndex, tokenIndex) {
    if (tokenIndex === tokens.length) {
      if (!isEndAnchored || inputIndex === inputLine.length) {
        return inputIndex;
      }

      return null;
    }

    const token = tokens[tokenIndex];

    if (token.quantifier !== "+" && token.quantifier !== "?") {
      if (inputIndex >= inputLine.length || !tokenMatches(token, inputLine[inputIndex])) {
        return null;
      }

      return matchFrom(inputIndex + 1, tokenIndex + 1);
    }

    if (token.quantifier === "?") {
      if (inputIndex < inputLine.length && tokenMatches(token, inputLine[inputIndex])) {
        const consumeResult = matchFrom(inputIndex + 1, tokenIndex + 1);
        if (consumeResult !== null) {
          return consumeResult;
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
      return null;
    }

    for (let nextIndex = maxIndex; nextIndex > inputIndex; nextIndex -= 1) {
      const result = matchFrom(nextIndex, tokenIndex + 1);
      if (result !== null) {
        return result;
      }
    }

    return null;
  }

  return matchFrom(startIndex, 0);
}

function findMatchInLine(inputLine, pattern, startSearchIndex = 0) {
  const parsedPatterns = expandAlternationPatterns(pattern).map((concretePattern) => {
    return parsePattern(concretePattern);
  });

  for (let startIndex = startSearchIndex; startIndex <= inputLine.length; startIndex += 1) {
    for (const parsedPattern of parsedPatterns) {
      const { tokens, isStartAnchored, isEndAnchored } = parsedPattern;

      if (isStartAnchored && startIndex !== 0) {
        continue;
      }

      const endIndex = matchAtEndIndex(inputLine, startIndex, tokens, isEndAnchored);
      if (endIndex !== null) {
        return {
          startIndex,
          endIndex,
          text: inputLine.slice(startIndex, endIndex),
        };
      }
    }
  }

  return null;
}

function findClosingParen(pattern, openIndex) {
  let depth = 0;
  let inCharClass = false;

  for (let i = openIndex; i < pattern.length; i += 1) {
    const ch = pattern[i];

    if (ch === "\\") {
      i += 1;
      continue;
    }

    if (!inCharClass && ch === "[") {
      inCharClass = true;
      continue;
    }

    if (inCharClass) {
      if (ch === "]") {
        inCharClass = false;
      }
      continue;
    }

    if (ch === "(") {
      depth += 1;
      continue;
    }

    if (ch === ")") {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }

  return -1;
}

function splitAlternatives(groupContent) {
  const alternatives = [];
  let start = 0;
  let depth = 0;
  let inCharClass = false;

  for (let i = 0; i < groupContent.length; i += 1) {
    const ch = groupContent[i];

    if (ch === "\\") {
      i += 1;
      continue;
    }

    if (!inCharClass && ch === "[") {
      inCharClass = true;
      continue;
    }

    if (inCharClass) {
      if (ch === "]") {
        inCharClass = false;
      }
      continue;
    }

    if (ch === "(") {
      depth += 1;
      continue;
    }

    if (ch === ")") {
      depth -= 1;
      continue;
    }

    if (ch === "|" && depth === 0) {
      alternatives.push(groupContent.slice(start, i));
      start = i + 1;
    }
  }

  alternatives.push(groupContent.slice(start));
  return alternatives;
}

function expandAlternationPatterns(pattern) {
  let openIndex = -1;
  let inCharClass = false;

  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];

    if (ch === "\\") {
      i += 1;
      continue;
    }

    if (!inCharClass && ch === "[") {
      inCharClass = true;
      continue;
    }

    if (inCharClass) {
      if (ch === "]") {
        inCharClass = false;
      }
      continue;
    }

    if (ch === "(") {
      openIndex = i;
      break;
    }
  }

  if (openIndex === -1) {
    return [pattern];
  }

  const closeIndex = findClosingParen(pattern, openIndex);
  if (closeIndex === -1) {
    throw new Error(`Invalid pattern ${pattern}`);
  }

  const prefix = pattern.slice(0, openIndex);
  const groupContent = pattern.slice(openIndex + 1, closeIndex);
  const suffix = pattern.slice(closeIndex + 1);
  const alternatives = splitAlternatives(groupContent);

  const expanded = [];
  for (const alt of alternatives) {
    const combined = `${prefix}${alt}${suffix}`;
    expanded.push(...expandAlternationPatterns(combined));
  }

  return expanded;
}

function matchPattern(inputLine, pattern) {
  return findMatchInLine(inputLine, pattern) !== null;
}

function highlightFirstMatchInLine(inputLine, pattern) {
  const match = findMatchInLine(inputLine, pattern);
  if (match === null) {
    return null;
  }

  const highlightOpen = "\u001b[01;31m";
  const highlightClose = "\u001b[m";

  return (
    inputLine.slice(0, match.startIndex) +
    highlightOpen +
    inputLine.slice(match.startIndex, match.endIndex) +
    highlightClose +
    inputLine.slice(match.endIndex)
  );
}

function main() {
  const args = process.argv.slice(2);
  let onlyMatching = false;
  let colorAlways = false;
  let pattern = null;

  if (args.length === 2 && args[0] === "-E") {
    pattern = args[1];
  } else if (args.length === 3 && args[0] === "-o" && args[1] === "-E") {
    onlyMatching = true;
    pattern = args[2];
  } else if (args.length === 3 && args[0] === "--color=always" && args[1] === "-E") {
    colorAlways = true;
    pattern = args[2];
  }

  let input = require("fs").readFileSync(0, "utf-8");

  if (input.endsWith("\n")) {
    input = input.slice(0, -1);
  }

  const inputLines = input.split("\n").map((line) => {
    if (line.endsWith("\r")) {
      return line.slice(0, -1);
    }
    return line;
  });

  if (pattern === null) {
    console.log("Expected arguments to be '-E <pattern>', '-o -E <pattern>', or '--color=always -E <pattern>'");
    process.exit(1);
  }

  // You can use print statements as follows for debugging, they'll be visible when running tests.
  console.error("Logs from your program will appear here");

  if (onlyMatching) {
    const matchingTexts = [];

    for (const line of inputLines) {
      let searchIndex = 0;

      while (searchIndex <= line.length) {
        const match = findMatchInLine(line, pattern, searchIndex);
        if (match === null) {
          break;
        }

        matchingTexts.push(match.text);

        // Prevent infinite loops on zero-length matches.
        if (match.endIndex === searchIndex) {
          searchIndex += 1;
        } else {
          searchIndex = match.endIndex;
        }
      }
    }

    if (matchingTexts.length > 0) {
      process.stdout.write(matchingTexts.join("\n"));
      process.exit(0);
    }

    process.exit(1);
  }

  if (colorAlways) {
    const highlightedLines = [];

    for (const line of inputLines) {
      const highlighted = highlightFirstMatchInLine(line, pattern);
      if (highlighted !== null) {
        highlightedLines.push(highlighted);
      }
    }

    if (highlightedLines.length > 0) {
      process.stdout.write(highlightedLines.join("\n"));
      process.exit(0);
    }

    process.exit(1);
  }

  const matchingLines = [];
  for (const line of inputLines) {
    if (matchPattern(line, pattern)) {
      matchingLines.push(line);
    }
  }

  if (matchingLines.length > 0) {
    process.stdout.write(matchingLines.join("\n"));
    process.exit(0);
  }

  process.exit(1);
}

main();
