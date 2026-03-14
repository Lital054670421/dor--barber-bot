import { readJsonFile, writeJsonFile } from "./json-file.js";

export class StateStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.state = null;
  }

  async load() {
    if (this.state === null) {
      this.state = await readJsonFile(this.filePath, {});
    }

    return this.state;
  }

  async save() {
    await writeJsonFile(this.filePath, this.state ?? {});
  }

  async merge(patch) {
    const state = await this.load();
    Object.assign(state, patch);
    await this.save();
    return state;
  }
}
