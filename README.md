# Spark

![Spark: giữ fn, nói, thả ra là có chữ](docs/spark.jpg)

Gõ bằng giọng nói tiếng Việt cho dân code. Giữ **fn**, nói tiếng Việt lẫn từ tiếng Anh như lúc làm việc, thả ra. Câu đã sửa được dán ngay chỗ con trỏ: Cursor, VS Code, Terminal, Slack, app nào cũng được.

**Hướng dẫn cài đặt: https://vuongnm.github.io/spark/**

```bash
curl -fsSL https://vuongnm.github.io/spark/install.sh | bash
```

Chạy trên Mac chip Apple. Mỗi bản phát hành có kèm bản Windows (giữ Ctrl phải để nói), nhưng bản này vẫn đang thử nghiệm.

## Cách Spark hoạt động

1. **Nghe.** Trong lúc bạn giữ phím, bong bóng ghi âm gửi âm thanh về tiến trình chính. Cứ 300 ms, Spark đọc lại 12 giây gần nhất bằng [Zipformer](https://github.com/k2-fsa/sherpa-onnx) tiếng Việt 30 triệu tham số (sherpa-onnx, chạy trên CPU), nên chữ hiện ngay khi bạn nói. Hotwords giúp nó viết đúng chính tả tiếng Anh của khoảng 30 từ dân code hay dùng (commit, deploy, staging…) và các từ trong Từ điển của bạn. Một mô hình tiếng Anh nhỏ (Moonshine tiny) nghe song song để bắt những từ tiếng Anh mà mô hình tiếng Việt không viết được.
2. **Viết lại.** Bản nghe được chuyển cho Gemma 4 E2B chạy trên máy (node-llama-cpp, Metal) hoặc Claude Haiku bằng khoá API của bạn. Prompt nằm ở [`src/main/prompt.ts`](src/main/prompt.ts). Spark bắt đầu viết lại ngay khi bạn ngừng nói và khi thả phím, nên thường chỉ khoảng 1 giây sau khi thả là có chữ.
3. **Kiểm tra.** `checkDivergence` và `unspokenNumbers` trong [`src/main/format.ts`](src/main/format.ts) loại kết quả nào thêm chữ hoặc đổi con số. Khi đó Spark nhờ Claude làm lại hoặc chỉ dọn cơ bản.
4. **Dán.** Spark chép chữ vào clipboard, gửi ⌘V (Ctrl+V), rồi trả lại clipboard cũ cho bạn.

Âm thanh không rời máy. Khi dùng Claude, Spark chỉ gửi phần chữ đã nghe được tới Anthropic.

## Phát triển

```bash
npm ci
npm run build:native   # bộ đọc phím fn (Swift), cần Xcode Command Line Tools
npm run dev
npm test
```

Self-test chạy toàn bộ pipeline thật, không cần giao diện:

```bash
npx electron-vite build
npx electron . --selftest=a.wav,b.wav --cleanup=local --app=code
npx electron . --selftest-clean="phích cái bấc ở file index chấm ts"
```

Chụp màn hình từ dữ liệu mẫu (không lộ lịch sử thật của bạn):

```bash
SPARK_DATA_DIR=/đường/dẫn/dữ-liệu-mẫu npx electron . --screenshots=/thư/mục/ảnh
```

## Phát hành

```bash
bash scripts/release-mac.sh                      # typecheck, test, build, ký, đóng zip + dmg vào dist/release
bash scripts/publish.sh "Ghi chú cho bản này"    # tạo bản phát hành v<version> trên GitHub; CI build rồi gắn bản Windows
```

Bản Mac được ký bằng chứng chỉ tự tạo (chưa notarize với Apple), nên macOS giữ quyền đã cấp cho Spark qua các lần cập nhật. File tải bằng `curl` không bị macOS gắn cờ quarantine. File `.dmg` tải bằng trình duyệt thì cần bấm "Vẫn mở" một lần.

## Giấy phép

MIT
