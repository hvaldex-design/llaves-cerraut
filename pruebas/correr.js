// ============================================================
// pruebas/correr.js — corre todas las pruebas
// ============================================================
// Uso:  node pruebas/correr.js
//
// Copia los módulos reales a una carpeta temporal, reemplaza firebase.js,
// cloudinary.js y taller.js por versiones falsas en memoria, y corre los
// archivos *.test.js. No toca tu base de datos ni necesita internet.
import { execFileSync } from "node:child_process";
import { mkdtempSync, copyFileSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..");

const MODULOS_REALES = [
  "trabajos.js", "inventario.js", "helpers.js", "metricas.js",
  "espadines.js", "vehiculos.js", "dashboard.js"
];
const FALSOS = {
  "firebase.js": "_firebase-falso.js",
  "cloudinary.js": "_cloudinary-falso.js",
  "taller.js": "_taller-falso.js"
};

const dir = mkdtempSync(join(tmpdir(), "cerrauto-pruebas-"));
try {
  writeFileSync(join(dir, "package.json"), '{"type":"module"}');
  for (const m of MODULOS_REALES) copyFileSync(join(RAIZ, m), join(dir, m));
  for (const [destino, origen] of Object.entries(FALSOS)) copyFileSync(join(AQUI, origen), join(dir, destino));

  const pruebas = readdirSync(AQUI).filter((f) => f.endsWith(".test.js"));
  let fallaron = 0;

  for (const p of pruebas) {
    copyFileSync(join(AQUI, p), join(dir, p));
    try {
      const salida = execFileSync(process.execPath, [join(dir, p)], {
        encoding: "utf8",
        env: { ...process.env, TZ: "America/Santiago" }
      });
      process.stdout.write(salida);
    } catch (e) {
      process.stdout.write(e.stdout || "");
      process.stderr.write(e.stderr || "");
      fallaron++;
    }
  }

  console.log(fallaron ? `\n${fallaron} archivo(s) de prueba con fallos` : "");
  process.exit(fallaron ? 1 : 0);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
