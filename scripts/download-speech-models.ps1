# Tải mô hình nhận dạng âm vị tiếng Nhật cho Shadowing vào models/phoneme (không đưa vào git vì nặng ~123 MB).
# Chạy một lần sau khi clone: powershell -ExecutionPolicy Bypass -File scripts/download-speech-models.ps1
# Thiếu mô hình thì backend vẫn chạy bình thường, chỉ tắt phần nhận dạng âm vị.
#
# Nguồn: prj-beatrice/japanese-hubert-base-phoneme-ctc (Apache-2.0), bản ONNX lượng tử hoá từ mnaoizyyy/charsiu-js-models.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$target = Join-Path $root 'models\phoneme'
New-Item -ItemType Directory -Force $target | Out-Null

$files = @(
    @{
        Name = 'model_quantized.onnx'
        Url  = 'https://huggingface.co/mnaoizyyy/charsiu-js-models/resolve/main/japanese-hubert-base-phoneme-ctc/model_quantized.onnx'
        Sha  = 'AD29E980CB0F50044854BF25324506ACE4FF0C48B98B4D194953028236C3AB6F'
    },
    @{
        Name = 'vocab.json'
        Url  = 'https://huggingface.co/prj-beatrice/japanese-hubert-base-phoneme-ctc/resolve/main/vocab.json'
        Sha  = '58BA6EB59CB2C953EF3F61D7D60EC64CC25CFBEB80E94FE7B4226899C50D7A07'
    }
)

foreach ($f in $files) {
    $path = Join-Path $target $f.Name
    if ((Test-Path $path) -and ((Get-FileHash $path -Algorithm SHA256).Hash -eq $f.Sha)) {
        Write-Host "Đã có $($f.Name), bỏ qua."
        continue
    }
    Write-Host "Đang tải $($f.Name)..."
    Invoke-WebRequest $f.Url -OutFile $path
    $hash = (Get-FileHash $path -Algorithm SHA256).Hash
    if ($hash -ne $f.Sha) {
        Remove-Item $path
        throw "Mã băm của $($f.Name) không khớp (nhận $hash). Tệp đã bị xoá; kiểm tra lại kết nối hoặc nguồn tải."
    }
}

Write-Host "Xong. Mô hình nằm ở $target"
