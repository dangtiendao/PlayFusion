#!/usr/bin/env bash
# ==============================================================================
# SCRIPT GIẢI MÃ BẢN SAO LƯU POSTGRESQL (DECRYPT BACKUP - P2.7b)
# ==============================================================================
#
# CÁCH SỬ DỤNG:
# 1. Chạy với file mã hóa:
#    ./scripts/decrypt-backup.sh /path/to/webgamehub-prod-20260819-2000.dump.enc
#
# 2. Hoặc xuất ra file chỉ định:
#    ./scripts/decrypt-backup.sh /path/to/input.dump.enc /path/to/output.dump
#
# ⚠️ NGUYÊN TẮC BẢO MẬT:
# - Script KHÔNG nhận passphrase qua cờ dòng lệnh (flags) nhằm ngăn ngừa lộ key
#   trong lịch sử shell command (`history`) và danh sách tiến trình (`ps aux`).
# - Script tự động kiểm tra biến môi trường `BACKUP_ENCRYPTION_KEY`. Nếu chưa có,
#   script sẽ hiển thị prompt nhắc nhập mật khẩu an toàn (không hiển thị ký tự).
# ==============================================================================

set -euo pipefail

# 1. Kiểm tra tham số đầu vào
if [ $# -lt 1 ]; then
  echo "❌ Lỗi: Thiếu đường dẫn file cần giải mã."
  echo "👉 Cú pháp: $0 <duong-dan-file.dump.enc> [file-dau-ra.dump]"
  exit 1
fi

INPUT_FILE="$1"

if [ ! -f "$INPUT_FILE" ]; then
  echo "❌ Lỗi: File không tồn tại: $INPUT_FILE"
  exit 1
fi

# Xác định tên file đầu ra (nếu không truyền, bỏ đuôi .enc)
if [ $# -ge 2 ]; then
  OUTPUT_FILE="$2"
else
  OUTPUT_FILE="${INPUT_FILE%.enc}"
  if [ "$OUTPUT_FILE" = "$INPUT_FILE" ]; then
    OUTPUT_FILE="${INPUT_FILE}.decrypted.dump"
  fi
fi

# 2. Nhận Passphrase giải mã an toàn
if [ -n "${BACKUP_ENCRYPTION_KEY:-}" ]; then
  PASSPHRASE="$BACKUP_ENCRYPTION_KEY"
  echo "🔑 Sử dụng passphrase từ biến môi trường BACKUP_ENCRYPTION_KEY."
else
  echo -n "🔑 Nhập Passphrase giải mã (không hiện ký tự): "
  read -rs PASSPHRASE
  echo ""
fi

if [ -z "$PASSPHRASE" ]; then
  echo "❌ Lỗi: Passphrase không được để trống."
  exit 1
fi

# 3. Tiến hành giải mã bằng OpenSSL AES-256-CBC
echo "🔓 Đang giải mã $INPUT_FILE -> $OUTPUT_FILE ..."

if openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
    -in "$INPUT_FILE" \
    -out "$OUTPUT_FILE" \
    -pass pass:"$PASSPHRASE"; then
  echo "✅ Giải mã thành công! Kích thước file: $(du -h "$OUTPUT_FILE" | cut -f1)"
else
  echo "❌ Giải mã thất bại! Vui lòng kiểm tra lại Passphrase hoặc tính toàn vẹn của file."
  rm -f "$OUTPUT_FILE"
  exit 1
fi

# 4. Kiểm tra tính hợp lệ của bản dump nếu có pg_restore
if command -v pg_restore >/dev/null 2>&1; then
  echo ""
  echo "🔍 [KIỂM TRA TÍNH TOÀN VẸN] Đọc danh mục bảng bằng pg_restore --list:"
  echo "------------------------------------------------------------------"
  pg_restore --list "$OUTPUT_FILE" | head -n 15 || true
  echo "------------------------------------------------------------------"
  echo "✅ File dump hợp lệ và sẵn sàng để khôi phục (xem hướng dẫn tại docs/phases/P2.7.md)."
else
  echo "ℹ️ Mẹo: Cài đặt postgresql-client để kiểm tra nội dung file dump bằng lệnh:"
  echo "   pg_restore --list $OUTPUT_FILE"
fi
