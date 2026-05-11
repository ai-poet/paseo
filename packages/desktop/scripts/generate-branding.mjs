#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveDesktopBrandingFromEnv } from "../branding.cjs";

const brand = resolveDesktopBrandingFromEnv(process.env);
const outputPath = resolve(import.meta.dirname, "../dist/desktop-branding.json");

writeFileSync(outputPath, `${JSON.stringify(brand, null, 2)}\n`);
