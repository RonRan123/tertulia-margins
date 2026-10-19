// Copies the browser-side files pdfjs and Tesseract.js load at runtime from node_modules into
// public/, so the app serves them itself (same origin, works offline) and they always match the
// installed versions. Runs before `dev` and `build`; the copies are gitignored.
//   public/pdfjs-wasm/  pdfjs's image decoders, for scanned pages (D55)
//   public/tesseract/   OCR worker, engine builds and English model, loaded only to OCR a scan (D55)
import { cpSync, mkdirSync, readdirSync } from "node:fs";

cpSync("node_modules/pdfjs-dist/wasm", "public/pdfjs-wasm", { recursive: true });

mkdirSync("public/tesseract/core", { recursive: true });
mkdirSync("public/tesseract/lang", { recursive: true });
cpSync("node_modules/tesseract.js/dist/worker.min.js", "public/tesseract/worker.min.js");
// Tesseract picks one of these by the browser's SIMD support; LSTM-only builds, as we OCR with the LSTM engine.
for (const file of readdirSync("node_modules/tesseract.js-core")) {
  if (file.endsWith("-lstm.wasm.js")) cpSync(`node_modules/tesseract.js-core/${file}`, `public/tesseract/core/${file}`);
}
cpSync("node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", "public/tesseract/lang/eng.traineddata.gz");
