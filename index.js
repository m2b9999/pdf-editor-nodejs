const express = require("express");
const fs = require("fs");
const path = require("path");
const { Recipe } = require("muhammara");
const arabicReshaper = require("arabic-reshaper");
const cors = require("cors");
const axios = require("axios");

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "10mb" }));

// Arabic reshaping helper
function reshapeBidirectional(input) {
  const chunks = [];
  let current = "";
  let isArabic = null;

  for (let char of input) {
    const code = char.charCodeAt(0);
    const currArabic = code >= 0x0600 && code <= 0x06ff;

    if (isArabic === null || isArabic === currArabic) {
      current += char;
    } else {
      chunks.push({ text: current, isArabic });
      current = char;
    }
    isArabic = currArabic;
  }

  if (current) chunks.push({ text: current, isArabic });

  return chunks
    .map(({ text, isArabic }) =>
      isArabic
        ? arabicReshaper.convertArabic(text).split("").reverse().join("")
        : text
    )
    .reverse()
    .join("");
}

// Edit PDF logic
async function editPdfAndSend({ inputPath, res, textboxes }) {
  if (!fs.existsSync("output")) {
    fs.mkdirSync("output");
  }

  const outputPdfPath = path.join(
    __dirname,
    "output",
    `output-${Date.now()}.pdf`
  );
  const fontPath = path.join(__dirname, "fonts", "Janna.ttf");

  const pdfDoc = new Recipe(inputPath, outputPdfPath);
  pdfDoc.registerFont("Janna", fontPath);

  const pageMap = {};
  for (const box of textboxes) {
    const { text, x, y, fontSize, page } = box;
    if (!text || x == null || y == null || !fontSize || page == null) continue;

    if (!pageMap[page]) pageMap[page] = [];
    pageMap[page].push({ text, x, y, fontSize });
  }

  for (const [pageNum, items] of Object.entries(pageMap)) {
    pdfDoc.editPage(parseInt(pageNum));
    for (const { text, x, y, fontSize } of items) {
      const reshapedText = reshapeBidirectional(text);
      pdfDoc.text(reshapedText, x, y + 5, {
        font: "Janna",
        size: fontSize,
        color: "#000000",
      });
    }
    pdfDoc.endPage();
  }

  pdfDoc.endPDF(() => {
    res.download(outputPdfPath, "modified.pdf", (err) => {
      if (err) {
        console.error("Error sending file:", err);
        res.status(500).json({ error: "Failed to send file" });
      }

      fs.unlink(outputPdfPath, () => {});
      fs.unlink(inputPath, () => {});
    });
  });
}

app.get('/', (req, res) => {
  res.send('Working...');
});

// Route: overlay text on remote PDF via URL
app.post("/overlay-pdf", async (req, res) => {
  console.log(req.body);
  const { pdfUrl, textboxesJson } = req.body;

  if (!pdfUrl || !textboxesJson) {
    return res.status(400).json({ error: "Missing pdfUrl or textboxesJson" });
  }

  const textboxes = JSON.parse(textboxesJson || "[]");

  try {
    if (!fs.existsSync("uploads")) {
      fs.mkdirSync("uploads");
    }
    const tempPath = path.join(
      __dirname,
      "uploads",
      `remote-${Date.now()}.pdf`
    );
    const writer = fs.createWriteStream(tempPath);

    const response = await axios({
      method: "get",
      url: pdfUrl,
      responseType: "stream",
    });
    response.data.pipe(writer);

    writer.on("finish", () => {
      editPdfAndSend({ inputPath: tempPath, res, textboxes });
    });

    writer.on("error", (err) => {
      console.error("Download error:", err);
      res.status(500).json({ error: "Failed to download PDF from URL" });
    });
  } catch (err) {
    console.error("Failed to fetch PDF:", err.message);
    res.status(500).json({ error: "Invalid or unreachable PDF URL" });
  }
});

app.listen(8080, () => console.log("Server running on http://localhost:8080"));
