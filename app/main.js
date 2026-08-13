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

  function attachExactQuantifier(count) {
    if (tokens.length === 0 || tokens[tokens.length - 1].quantifier || tokens[tokens.length - 1].exactCount !== undefined) {
      tokens.push({ type: "literal", value: "{" });
      for (const digit of String(count)) {
        tokens.push({ type: "literal", value: digit });
      }
      tokens.push({ type: "literal", value: "}" });
      return;
    }

    tokens[tokens.length - 1].exactCount = count;
  }

  function attachAtLeastQuantifier(minCount) {
    if (
      tokens.length === 0 ||
      tokens[tokens.length - 1].quantifier ||
      tokens[tokens.length - 1].exactCount !== undefined ||
      tokens[tokens.length - 1].atLeastCount !== undefined
    ) {
      tokens.push({ type: "literal", value: "{" });
      for (const digit of String(minCount)) {
        tokens.push({ type: "literal", value: digit });
      }
      tokens.push({ type: "literal", value: "," });
      tokens.push({ type: "literal", value: "}" });
      return;
    }

    tokens[tokens.length - 1].atLeastCount = minCount;
  }

  function attachRangeQuantifier(minCount, maxCount) {
    if (
      tokens.length === 0 ||
      tokens[tokens.length - 1].quantifier ||
      tokens[tokens.length - 1].exactCount !== undefined ||
      tokens[tokens.length - 1].atLeastCount !== undefined ||
      tokens[tokens.length - 1].rangeCount !== undefined
    ) {
      tokens.push({ type: "literal", value: "{" });
      for (const digit of String(minCount)) {
        tokens.push({ type: "literal", value: digit });
      }
      tokens.push({ type: "literal", value: "," });
      for (const digit of String(maxCount)) {
        tokens.push({ type: "literal", value: digit });
      }
      tokens.push({ type: "literal", value: "}" });
      return;
    }

    tokens[tokens.length - 1].rangeCount = { minCount, maxCount };
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

    if (ch === "*") {
      attachQuantifier("*");

      i += 1;
      continue;
    }

    if (ch === "{") {
      const closeIndex = rawPattern.indexOf("}", i + 1);
      if (closeIndex !== -1) {
        const content = rawPattern.slice(i + 1, closeIndex);
        if (/^\d+$/.test(content)) {
          attachExactQuantifier(Number(content));
          i = closeIndex + 1;
          continue;
        }

        if (/^\d+,$/.test(content)) {
          attachAtLeastQuantifier(Number(content.slice(0, -1)));
          i = closeIndex + 1;
          continue;
        }

        if (/^\d+,\d+$/.test(content)) {
          const [minText, maxText] = content.split(",");
          const minCount = Number(minText);
          const maxCount = Number(maxText);

          if (minCount <= maxCount) {
            attachRangeQuantifier(minCount, maxCount);
            i = closeIndex + 1;
            continue;
          }
        }
      }
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

    if (token.exactCount !== undefined) {
      let nextIndex = inputIndex;

      for (let count = 0; count < token.exactCount; count += 1) {
        if (nextIndex >= inputLine.length || !tokenMatches(token, inputLine[nextIndex])) {
          return null;
        }
        nextIndex += 1;
      }

      return matchFrom(nextIndex, tokenIndex + 1);
    }

    if (token.atLeastCount !== undefined) {
      let maxIndex = inputIndex;
      while (maxIndex < inputLine.length && tokenMatches(token, inputLine[maxIndex])) {
        maxIndex += 1;
      }

      if (maxIndex < inputIndex + token.atLeastCount) {
        return null;
      }

      for (let nextIndex = maxIndex; nextIndex >= inputIndex + token.atLeastCount; nextIndex -= 1) {
        const result = matchFrom(nextIndex, tokenIndex + 1);
        if (result !== null) {
          return result;
        }
      }

      return null;
    }

    if (token.rangeCount !== undefined) {
      const { minCount, maxCount } = token.rangeCount;
      let maxIndex = inputIndex;
      let matchedCount = 0;

      while (maxIndex < inputLine.length && matchedCount < maxCount && tokenMatches(token, inputLine[maxIndex])) {
        maxIndex += 1;
        matchedCount += 1;
      }

      if (matchedCount < minCount) {
        return null;
      }

      for (let nextIndex = maxIndex; nextIndex >= inputIndex + minCount; nextIndex -= 1) {
        const result = matchFrom(nextIndex, tokenIndex + 1);
        if (result !== null) {
          return result;
        }
      }

      return null;
    }

    if (token.quantifier !== "+" && token.quantifier !== "?" && token.quantifier !== "*") {
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

    const minMatches = token.quantifier === "+" ? 1 : 0;

    let maxIndex = inputIndex;
    while (maxIndex < inputLine.length && tokenMatches(token, inputLine[maxIndex])) {
      maxIndex += 1;
    }

    // Require minimum matches for the quantifier, then backtrack from greedy to minimal.
    if (maxIndex < inputIndex + minMatches) {
      return null;
    }

    for (let nextIndex = maxIndex; nextIndex >= inputIndex + minMatches; nextIndex -= 1) {
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
  const parsedPatterns = expandAlternationPatterns(pattern, inputLine.length).map((concretePattern) => {
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

function expandAlternationPatterns(pattern, maxInputLength = null) {
  function parseGroupQuantifierAt(text, index) {
    if (index >= text.length || text[index] !== "{") {
      return null;
    }

    const closeIndex = text.indexOf("}", index + 1);
    if (closeIndex === -1) {
      return null;
    }

    const content = text.slice(index + 1, closeIndex);
    if (/^\d+$/.test(content)) {
      return {
        exactCount: Number(content),
        endIndex: closeIndex + 1,
      };
    }

    if (/^\d+,$/.test(content)) {
      return {
        atLeastCount: Number(content.slice(0, -1)),
        endIndex: closeIndex + 1,
      };
    }

    if (/^\d+,\d+$/.test(content)) {
      const [minText, maxText] = content.split(",");
      const minCount = Number(minText);
      const maxCount = Number(maxText);

      if (minCount <= maxCount) {
        return {
          minCount,
          maxCount,
          endIndex: closeIndex + 1,
        };
      }
    }

    return null;
  }

  function expandRepeatedAlternatives(alternatives, count) {
    if (count === 0) {
      return [""];
    }

    let combinations = [""];
    for (let i = 0; i < count; i += 1) {
      const nextCombinations = [];
      for (const prefix of combinations) {
        for (const alt of alternatives) {
          nextCombinations.push(prefix + alt);
        }
      }
      combinations = nextCombinations;
    }

    return combinations;
  }

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
  let suffix = pattern.slice(closeIndex + 1);
  let alternatives = splitAlternatives(groupContent);

  const expanded = [];
  const groupQuantifier = parseGroupQuantifierAt(pattern, closeIndex + 1);

  if (groupQuantifier !== null && groupQuantifier.exactCount !== undefined) {
    alternatives = expandRepeatedAlternatives(alternatives, groupQuantifier.exactCount);
    suffix = pattern.slice(groupQuantifier.endIndex);

    for (const alt of alternatives) {
      const combined = `${prefix}${alt}${suffix}`;
      expanded.push(...expandAlternationPatterns(combined, maxInputLength));
    }

    return expanded;
  }

  if (groupQuantifier !== null && groupQuantifier.atLeastCount !== undefined) {
    const minAltLength = Math.min(...alternatives.map((alt) => alt.length));
    const safeMinAltLength = minAltLength <= 0 ? 1 : minAltLength;
    const lineBound = maxInputLength === null ? groupQuantifier.atLeastCount : maxInputLength;
    const maxRepeatCount = Math.max(groupQuantifier.atLeastCount, Math.floor(lineBound / safeMinAltLength));

    suffix = pattern.slice(groupQuantifier.endIndex);

    for (let repeatCount = groupQuantifier.atLeastCount; repeatCount <= maxRepeatCount; repeatCount += 1) {
      const repeatedAlternatives = expandRepeatedAlternatives(alternatives, repeatCount);
      for (const alt of repeatedAlternatives) {
        const combined = `${prefix}${alt}${suffix}`;
        expanded.push(...expandAlternationPatterns(combined, maxInputLength));
      }
    }

    return expanded;
  }

  if (groupQuantifier !== null && groupQuantifier.minCount !== undefined && groupQuantifier.maxCount !== undefined) {
    const minAltLength = Math.min(...alternatives.map((alt) => alt.length));
    const safeMinAltLength = minAltLength <= 0 ? 1 : minAltLength;
    const lineBound = maxInputLength === null ? groupQuantifier.maxCount : maxInputLength;
    const maxRepeatByLength = Math.floor(lineBound / safeMinAltLength);
    const upperRepeatCount = Math.min(groupQuantifier.maxCount, maxRepeatByLength);

    suffix = pattern.slice(groupQuantifier.endIndex);

    for (let repeatCount = groupQuantifier.minCount; repeatCount <= upperRepeatCount; repeatCount += 1) {
      const repeatedAlternatives = expandRepeatedAlternatives(alternatives, repeatCount);
      for (const alt of repeatedAlternatives) {
        const combined = `${prefix}${alt}${suffix}`;
        expanded.push(...expandAlternationPatterns(combined, maxInputLength));
      }
    }

    return expanded;
  }

  for (const alt of alternatives) {
    const combined = `${prefix}${alt}${suffix}`;
    expanded.push(...expandAlternationPatterns(combined, maxInputLength));
  }

  return expanded;
}

function matchPattern(inputLine, pattern) {
  return findMatchInLine(inputLine, pattern) !== null;
}

function highlightAllMatchesInLine(inputLine, pattern) {
  const highlightOpen = "\u001b[01;31m";
  const highlightClose = "\u001b[m";

  let highlighted = "";
  let trailingStart = 0;
  let searchIndex = 0;
  let foundAny = false;

  while (searchIndex <= inputLine.length) {
    const match = findMatchInLine(inputLine, pattern, searchIndex);
    if (match === null) {
      break;
    }

    foundAny = true;
    highlighted += inputLine.slice(trailingStart, match.startIndex);
    highlighted += highlightOpen;
    highlighted += inputLine.slice(match.startIndex, match.endIndex);
    highlighted += highlightClose;

    trailingStart = match.endIndex;

    // Prevent infinite loops on zero-length matches.
    if (match.endIndex === searchIndex) {
      searchIndex += 1;
    } else {
      searchIndex = match.endIndex;
    }
  }

  if (!foundAny) {
    return null;
  }

  highlighted += inputLine.slice(trailingStart);
  return highlighted;
}

function main() {
  const args = process.argv.slice(2);
  let onlyMatching = false;
  let colorAlways = false;
  let colorAuto = false;
  let colorNever = false;
  let recursiveSearch = false;
  let pattern = null;

  let inputFilePaths = [];

  if (args.length >= 2 && args[0] === "-E") {
    pattern = args[1];
    inputFilePaths = args.slice(2);
  } else if (args.length >= 3 && args[0] === "-r" && args[1] === "-E") {
    recursiveSearch = true;
    pattern = args[2];
    inputFilePaths = args.slice(3);
  } else if (args.length >= 3 && args[0] === "-o" && args[1] === "-E") {
    onlyMatching = true;
    pattern = args[2];
    inputFilePaths = args.slice(3);
  } else if (args.length >= 3 && args[0] === "--color=always" && args[1] === "-E") {
    colorAlways = true;
    pattern = args[2];
    inputFilePaths = args.slice(3);
  } else if (args.length >= 3 && args[0] === "--color=auto" && args[1] === "-E") {
    colorAuto = true;
    pattern = args[2];
    inputFilePaths = args.slice(3);
  } else if (args.length >= 3 && args[0] === "--color=never" && args[1] === "-E") {
    colorNever = true;
    pattern = args[2];
    inputFilePaths = args.slice(3);
  }

  const fs = require("fs");
  const path = require("path");

  function collectFilesRecursively(rootDir) {
    const files = [];

    function walk(currentPath) {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = path.join(currentPath, entry.name);
        if (entry.isDirectory()) {
          walk(entryPath);
        } else if (entry.isFile()) {
          files.push(entryPath);
        }
      }
    }

    walk(rootDir);
    return files;
  }

  function toInputLines(text) {
    let normalized = text;

    if (normalized.endsWith("\n")) {
      normalized = normalized.slice(0, -1);
    }

    return normalized.split("\n").map((line) => {
      if (line.endsWith("\r")) {
        return line.slice(0, -1);
      }
      return line;
    });
  }

  const inputs = [];
  if (recursiveSearch) {
    for (const rootDir of inputFilePaths) {
      const filePaths = collectFilesRecursively(rootDir);
      for (const filePath of filePaths) {
        const fileText = fs.readFileSync(filePath, "utf-8");
        const displayPath = path.relative(process.cwd(), filePath);
        inputs.push({ filePath: displayPath, lines: toInputLines(fileText) });
      }
    }
  } else if (inputFilePaths.length === 0) {
    const stdinText = fs.readFileSync(0, "utf-8");
    inputs.push({ filePath: null, lines: toInputLines(stdinText) });
  } else {
    for (const filePath of inputFilePaths) {
      const fileText = fs.readFileSync(filePath, "utf-8");
      inputs.push({ filePath, lines: toInputLines(fileText) });
    }
  }

  if (pattern === null) {
    console.log("Expected arguments to be '-E <pattern>', '-r -E <pattern> <dir>', '-o -E <pattern>', '--color=always -E <pattern>', '--color=auto -E <pattern>', or '--color=never -E <pattern>'");
    process.exit(1);
  }

  // You can use print statements as follows for debugging, they'll be visible when running tests.
  console.error("Logs from your program will appear here");

  if (onlyMatching) {
    const matchingTexts = [];

    for (const input of inputs) {
      for (const line of input.lines) {
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
    }

    if (matchingTexts.length > 0) {
      process.stdout.write(matchingTexts.join("\n"));
      process.exit(0);
    }

    process.exit(1);
  }

  if (colorAlways) {
    const highlightedLines = [];

    for (const input of inputs) {
      for (const line of input.lines) {
        const highlighted = highlightAllMatchesInLine(line, pattern);
        if (highlighted !== null) {
          highlightedLines.push(highlighted);
        }
      }
    }

    if (highlightedLines.length > 0) {
      process.stdout.write(highlightedLines.join("\n"));
      process.exit(0);
    }

    process.exit(1);
  }

  if (colorAuto) {
    if (process.stdout.isTTY) {
      const highlightedLines = [];

      for (const input of inputs) {
        for (const line of input.lines) {
          const highlighted = highlightAllMatchesInLine(line, pattern);
          if (highlighted !== null) {
            highlightedLines.push(highlighted);
          }
        }
      }

      if (highlightedLines.length > 0) {
        process.stdout.write(highlightedLines.join("\n"));
        process.exit(0);
      }

      process.exit(1);
    }

    const matchingLines = [];
    const shouldPrefixFilenames = recursiveSearch || inputFilePaths.length > 1;

    for (const input of inputs) {
      for (const line of input.lines) {
        if (matchPattern(line, pattern)) {
          matchingLines.push(shouldPrefixFilenames ? `${input.filePath}:${line}` : line);
        }
      }
    }

    if (matchingLines.length > 0) {
      process.stdout.write(matchingLines.join("\n"));
      process.exit(0);
    }

    process.exit(1);
  }

  // --color=never is plain text output (same as non-color mode).
  if (colorNever) {
    const matchingLines = [];
    const shouldPrefixFilenames = recursiveSearch || inputFilePaths.length > 1;

    for (const input of inputs) {
      for (const line of input.lines) {
        if (matchPattern(line, pattern)) {
          matchingLines.push(shouldPrefixFilenames ? `${input.filePath}:${line}` : line);
        }
      }
    }

    if (matchingLines.length > 0) {
      process.stdout.write(matchingLines.join("\n"));
      process.exit(0);
    }

    process.exit(1);
  }

  const matchingLines = [];
  const shouldPrefixFilenames = recursiveSearch || inputFilePaths.length > 1;

  for (const input of inputs) {
    for (const line of input.lines) {
      if (matchPattern(line, pattern)) {
        matchingLines.push(shouldPrefixFilenames ? `${input.filePath}:${line}` : line);
      }
    }
  }

  if (matchingLines.length > 0) {
    process.stdout.write(matchingLines.join("\n"));
    process.exit(0);
  }

  process.exit(1);
}

main();
