# Spark

![Spark: hold fn, talk, let go](docs/spark.jpg)

Voice typing for Vietnamese developers. Hold **fn**, talk in Vietnamese with English words mixed in, let go, and the cleaned-up sentence is pasted where your cursor is: Cursor, VS Code, Terminal, Slack, anything.

**Install and docs (Vietnamese): https://vuongnm.github.io/spark/**

```bash
curl -fsSL https://vuongnm.github.io/spark/install.sh | bash
```

Apple Silicon Macs. A Windows build (hold Right Ctrl) is attached to each release but is still experimental.

## How it works

1. **Listen.** While you hold the key, the recording bubble streams audio to the main process, which re-reads the last 12 s every 300 ms with a 30M-parameter Vietnamese [Zipformer](https://github.com/k2-fsa/sherpa-onnx) (sherpa-onnx, CPU) so you see your words live. A small English model (Moonshine tiny) listens in parallel to catch English words the Vietnamese model can't spell.
2. **Clean up.** The transcript goes to Gemma 4 E2B on-device (node-llama-cpp, Metal) or Claude Haiku with your own API key. The prompt is in [`src/main/prompt.ts`](src/main/prompt.ts). Cleanup starts at pauses and at release, so the result is usually ready about 1 s after you let go.
3. **Check.** `checkDivergence` and `unspokenNumbers` in [`src/main/format.ts`](src/main/format.ts) reject output that adds words or changes numbers; Spark then falls back to Claude or to basic punctuation.
4. **Paste.** The text goes on the clipboard, Spark sends ⌘V (Ctrl+V), then restores your clipboard.

Audio never leaves the machine. With Claude, only the transcript text is sent to Anthropic.

## Develop

```bash
npm ci
npm run build:native   # the Fn key watcher (Swift), needs Xcode Command Line Tools
npm run dev
npm test
```

Self-tests run the real pipeline without the UI:

```bash
npx electron-vite build
npx electron . --selftest=a.wav,b.wav --cleanup=local --app=code
npx electron . --selftest-clean="phích cái bấc ở file index chấm ts"
```

## Release

```bash
bash scripts/release-mac.sh   # typecheck, test, build, sign, zip + dmg into dist/release
bash scripts/publish.sh       # GitHub release v<version>; CI then builds and attaches the Windows installer
```

Mac builds are signed with a self-signed identity (not notarized), so macOS keeps Spark's permissions across updates. Downloads made with `curl` are not quarantined; the `.dmg` needs "Open Anyway" once.

## License

MIT
