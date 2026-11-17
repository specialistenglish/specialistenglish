import { globSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import matter from "gray-matter";
import { preview } from "vite";
import puppeteer from "puppeteer";
import { PDFDocument } from "pdf-lib";

const SITE_URL = "https://specialistenglish.github.io/specialistenglish/";
const MARGIN = { top: "18mm", right: "16mm", bottom: "20mm", left: "16mm" };

const base64 = path => readFileSync(path).toString("base64");
const logo = `data:image/svg+xml;base64,${base64("public/media/sjo-logo.svg")}`;
const font = `data:font/ttf;base64,${base64("public/fonts/Rubik-VariableFont_wght.ttf")}`;

const footer = (url, numbered) => `
  <style>@font-face { font-family: Rubik; src: url(${font}); }</style>
  <div style="display: flex; align-items: center; gap: 2mm; box-sizing: border-box; width: 100%; padding: 0 ${MARGIN.right} 0 ${MARGIN.left}; font: 7pt Rubik, sans-serif; color: #504d48;">
    <img src="${logo}" style="height: 6mm;">
    <a href="${url}" style="color: inherit; text-decoration: none;">${url.replace(/^https:\/\//, "")}</a>
    ${numbered ? `<span class="pageNumber" style="margin-left: auto;"></span>` : ""}
  </div>`;

const slugs = globSync("**/*.mdx", { cwd: "articles" })
  .filter(file => matter(readFileSync(join("articles", file))).data.pdf !== false)
  .map(file => file.replaceAll("\\", "/").replace(/(\/index)?\.mdx$/, ""));

const server = await preview({ logLevel: "warn" });
const browser = await puppeteer.launch();
const failed = [];

for (const slug of slugs) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewport({ width: 680, height: 960, deviceScaleFactor: 2 });
  await page.emulateMediaType("print");
  await page.goto(`${server.resolvedUrls.local[0]}#/articles/${slug}`, { waitUntil: "networkidle0" });

  if (errors.length) {
    failed.push(`${slug}: ${errors[0]}`);
    await page.close();
    continue;
  }

  await page.waitForSelector("#Article .content h1");
  await page.evaluate(() => document.fonts.ready);

  const render = numbered => page.pdf({
    format: "A4",
    margin: MARGIN,
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: "<span></span>",
    footerTemplate: footer(`${SITE_URL}#/articles/${slug}`, numbered),
  });

  let pdf = await render(true);
  if ((await PDFDocument.load(pdf)).getPageCount() === 1) pdf = await render(false);

  const out = `dist/pdf/${slug}.pdf`;
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, pdf);
  console.log(out);
  await page.close();
}

await browser.close();
await server.close();

if (failed.length) {
  console.error(`\nCould not render ${failed.length} article(s):\n${failed.join("\n")}`);
  process.exitCode = 1;
}
