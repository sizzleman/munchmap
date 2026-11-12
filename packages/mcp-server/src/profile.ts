/** Local-only profile storage: ~/.munchmap/profile.json (override with MUNCHMAP_HOME). Never uploaded. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Profile } from "@munchmap/core";

const dir = () => process.env.MUNCHMAP_HOME ?? join(homedir(), ".munchmap");
const file = () => join(dir(), "profile.json");

export function readProfile(): Profile {
  try {
    return Profile.parse(JSON.parse(readFileSync(file(), "utf8")));
  } catch {
    return Profile.parse({});
  }
}

export function writeProfile(update: Partial<Profile>): Profile {
  const next = Profile.parse({ ...readProfile(), ...update });
  mkdirSync(dir(), { recursive: true, mode: 0o700 });
  writeFileSync(file(), JSON.stringify(next, null, 2), { mode: 0o600 });
  return next;
}
