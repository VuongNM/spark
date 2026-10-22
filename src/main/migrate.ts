import { app } from 'electron'
import { existsSync, mkdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Spark used to be called mike. On the first launch after the rename, mike's settings, history,
 * dictionary, recordings and downloaded models (3 GB with Gemma) move into Spark's folder, so
 * nothing is downloaded or set up twice. A rename on the same disk is instant. Browser caches stay
 * behind. Imported before anything reads the data folder.
 */
const KEEP = ['settings.json', 'history.json', 'dictionary.json', 'recordings', 'models']

// SPARK_DATA_DIR runs Spark on another data folder, e.g. demo data for screenshots.
const custom = process.env.SPARK_DATA_DIR
if (custom) app.setPath('userData', custom)

const from = join(app.getPath('appData'), 'mike')
const to = app.getPath('userData')
if (!custom && from !== to && existsSync(from) && !existsSync(join(to, 'settings.json'))) {
  mkdirSync(to, { recursive: true })
  for (const name of KEEP) {
    if (!existsSync(join(from, name)) || existsSync(join(to, name))) continue
    try {
      renameSync(join(from, name), join(to, name))
    } catch (e) {
      console.error(`[spark] could not move ${name} from mike:`, e)
    }
  }
}
