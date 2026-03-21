const segmentDigits = {
  "0": [" ___ ", "|   |", "|   |", "|   |", "|___|"],
  "1": ["     ", "    |", "    |", "    |", "    |"],
  "2": [" ___ ", "    |", " ___|", "|    ", "|___ "],
  "3": [" ___ ", "    |", " ___|", "    |", " ___|"],
  "4": ["     ", "|   |", "|___|", "    |", "    |"],
  "5": [" ___ ", "|    ", "|___ ", "    |", " ___|"],
  "6": [" ___ ", "|    ", "|___ ", "|   |", "|___|"],
  "7": [" ___ ", "    |", "    |", "    |", "    |"],
  "8": [" ___ ", "|   |", "|___|", "|   |", "|___|"],
  "9": [" ___ ", "|   |", "|___|", "    |", " ___|"],
  "/": ["    /", "   / ", "  /  ", " /   ", "/    "],
};

function toSegmentDisplay(value) {
  const text = String(value);
  const rows = ["", "", "", "", ""];

  for (const char of text) {
    const glyph = segmentDigits[char] ?? ["     ", "     ", "  ?  ", "     ", "     "];
    rows[0] += glyph[0];
    rows[1] += glyph[1];
    rows[2] += glyph[2];
    rows[3] += glyph[3];
    rows[4] += glyph[4];
  }

  return rows.map((row) => row.trimEnd()).join("\n");
}

module.exports = {
  toSegmentDisplay,
};
