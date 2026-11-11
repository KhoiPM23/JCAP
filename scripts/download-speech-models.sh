#!/usr/bin/env bash
# Tải mô hình nhận dạng âm vị tiếng Nhật cho Shadowing vào models/phoneme (không đưa vào git vì nặng ~123 MB).
# Chạy một lần sau khi clone: bash scripts/download-speech-models.sh
# Thiếu mô hình thì backend vẫn chạy bình thường, chỉ tắt phần nhận dạng âm vị.
#
# Nguồn: prj-beatrice/japanese-hubert-base-phoneme-ctc (Apache-2.0), bản ONNX lượng tử hoá từ mnaoizyyy/charsiu-js-models.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
target="$root/models/phoneme"
mkdir -p "$target"

download() {
  local name="$1" url="$2" sha="$3" path="$target/$1"
  if [ -f "$path" ] && [ "$(sha256sum "$path" | cut -d' ' -f1 | tr a-f A-F)" = "$sha" ]; then
    echo "Đã có $name, bỏ qua."
    return
  fi
  echo "Đang tải $name..."
  curl -fL "$url" -o "$path"
  local got
  got="$(sha256sum "$path" | cut -d' ' -f1 | tr a-f A-F)"
  if [ "$got" != "$sha" ]; then
    rm -f "$path"
    echo "Mã băm của $name không khớp (nhận $got). Tệp đã bị xoá." >&2
    exit 1
  fi
}

download model_quantized.onnx \
  https://huggingface.co/mnaoizyyy/charsiu-js-models/resolve/main/japanese-hubert-base-phoneme-ctc/model_quantized.onnx \
  AD29E980CB0F50044854BF25324506ACE4FF0C48B98B4D194953028236C3AB6F
download vocab.json \
  https://huggingface.co/prj-beatrice/japanese-hubert-base-phoneme-ctc/resolve/main/vocab.json \
  58BA6EB59CB2C953EF3F61D7D60EC64CC25CFBEB80E94FE7B4226899C50D7A07

echo "Xong. Mô hình nằm ở $target"
