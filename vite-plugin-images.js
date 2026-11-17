import { readdirSync, existsSync } from "fs";
import { resolve, join, basename, extname } from "path";
import sharp from "sharp";

const WIDTHS = [256, 384, 512, 768, 1024, 1536, 2048];
const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const VIRTUAL_ID = "virtual:image-sizes";
const RESOLVED_ID = "\0virtual:image-sizes";
const QUALITY = 75;

function imageFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => IMAGE_EXTS.has(extname(f).toLowerCase()))
    .map(f => ({ file: f, path: join(dir, f) }));
}

export default function imagesPlugin() {
  let srcDir = null;
  let sizesMap = null;
  const widths = new Map();

  async function widthOf(path) {
    if (!widths.has(path)) widths.set(path, (await sharp(path).metadata()).width);
    return widths.get(path);
  }

  async function buildSizesMap() {
    const map = {};
    for (const { file, path } of imageFiles(srcDir)) {
      map[`articles/${file}`] = await widthOf(path);
    }
    return map;
  }

  return {
    name: "vite-plugin-images",

    configResolved(config) {
      srcDir = resolve(config.publicDir, "articles");
    },

    async buildStart() {
      sizesMap = await buildSizesMap();
    },

    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID;
    },

    async load(id) {
      if (id !== RESOLVED_ID) return;
      if (!sizesMap) sizesMap = await buildSizesMap();
      return `export default ${JSON.stringify(sizesMap)};`;
    },

    async generateBundle() {
      for (const { file, path } of imageFiles(srcDir)) {
        const name = basename(file, extname(file));
        const origWidth = await widthOf(path);

        for (const w of WIDTHS) {
          if (w > origWidth) continue;
          const buffer = await sharp(path)
            .resize(w, null, { withoutEnlargement: true })
            .webp({ quality: QUALITY })
            .toBuffer();
          this.emitFile({ type: "asset", fileName: `articles/${name}-${w}.webp`, source: buffer });
        }
      }
    },

    configureServer(server) {
      const refresh = file => {
        if (!IMAGE_EXTS.has(extname(file).toLowerCase())) return;
        sizesMap = null;
        widths.delete(file);
        const mod = server.moduleGraph.getModuleById(RESOLVED_ID);
        if (mod) server.moduleGraph.invalidateModule(mod);
      };

      server.watcher.add(srcDir);
      server.watcher.on("add", refresh).on("change", refresh).on("unlink", refresh);
    },
  };
}
