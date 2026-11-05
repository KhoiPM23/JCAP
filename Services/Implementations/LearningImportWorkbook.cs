using System.IO.Compression;
using System.Security.Cryptography;
using ClosedXML.Excel;
using JCAP.DTOs.Learning;

namespace JCAP.Services.Implementations;

/// <summary>Versioned, text-only workbook contract. Parsing never evaluates formulas.</summary>
public static class LearningImportWorkbook
{
    public const int MaxBytes = 5 * 1024 * 1024;
    public const int MaxRows = 3000;
    public static readonly IReadOnlyDictionary<string, string[]> Columns = new Dictionary<string, string[]>
    {
        ["Topics"] = ["Code", "Name", "JLPTLevel", "Description"],
        ["Vocabularies"] = ["Key", "Word", "Reading", "Meaning", "JLPTLevel", "PartOfSpeech", "Explanation", "UsageNotes", "TopicCodes", "SourceKey", "ExternalId"],
        ["Grammars"] = ["Key", "Pattern", "Reading", "Meaning", "JLPTLevel", "Formation", "Explanation", "UsageNotes", "TopicCodes", "SourceKey", "ExternalId"],
        ["Examples"] = ["Kind", "ContentKey", "JapaneseText", "VietnameseTranslation", "Furigana", "SourceKey", "ExternalId"],
        ["Sources"] = ["Key", "Name", "Version", "SourceUrl", "License", "LicenseUrl", "Attribution"]
    };
    public sealed record Row(string Sheet, int Number, Dictionary<string, string> Cells)
    {
        public string this[string name] => Cells.GetValueOrDefault(name, "");
        public string? Optional(string name) => this[name] is { Length: > 0 } value ? value : null;
    }
    public sealed record Document(List<Row> Rows, LearningImportReport Report);

    public static Document Read(byte[] bytes, string fileName)
    {
        var report = new LearningImportReport { FileHash = Convert.ToHexString(SHA256.HashData(bytes)) };
        var rows = new List<Row>();
        void Error(string message) => report.Issues.Add(new("File", 0, "", message));
        if (!fileName.EndsWith(".xlsx", StringComparison.OrdinalIgnoreCase) || bytes.Length == 0 || bytes.Length > MaxBytes)
        { Error("Chỉ nhận file .xlsx không rỗng, tối đa 5 MB."); return new(rows, report); }
        try
        {
            using var stream = new MemoryStream(bytes, false);
            using (var zip = new ZipArchive(stream, ZipArchiveMode.Read, true))
            {
                if (zip.Entries.Count > 1000 || zip.Entries.Sum(e => e.Length) > 25L * 1024 * 1024)
                { Error("File giải nén quá lớn. Hãy chia thành nhiều file nhỏ hơn."); return new(rows, report); }
                if (zip.Entries.Any(e => e.FullName.Contains("vbaProject", StringComparison.OrdinalIgnoreCase)
                    || e.FullName.StartsWith("xl/externalLinks/", StringComparison.OrdinalIgnoreCase)))
                { Error("Không nhận macro hoặc liên kết đến workbook bên ngoài."); return new(rows, report); }
            }
            stream.Position = 0;
            using var workbook = new XLWorkbook(stream);
            foreach (var sheet in workbook.Worksheets)
            {
                if (sheet.Name == "Guide") continue;
                if (!Columns.TryGetValue(sheet.Name, out var expected))
                { report.Issues.Add(new(sheet.Name, 1, "", "Tên sheet không hợp lệ. Dùng đúng mẫu tải từ hệ thống.")); continue; }
                var last = sheet.LastRowUsed(XLCellsUsedOptions.Contents)?.RowNumber() ?? 1;
                if (last > MaxRows + 1 || (sheet.LastColumnUsed(XLCellsUsedOptions.Contents)?.ColumnNumber() ?? 0) > expected.Length)
                { report.Issues.Add(new(sheet.Name, 1, "", "Quá nhiều dòng/cột; tối đa 3.000 dòng dữ liệu trên toàn file.")); continue; }
                var headers = Enumerable.Range(1, expected.Length).Select(i => sheet.Cell(1, i).HasFormula ? "" : sheet.Cell(1, i).GetString().Trim()).ToArray();
                if (headers.Distinct().Count() != expected.Length || expected.Except(headers).Any())
                { report.Issues.Add(new(sheet.Name, 1, "", "Sai tiêu đề cột. Cần đủ: " + string.Join(", ", expected))); continue; }
                for (var number = 1; number <= last; number++)
                {
                    var cells = new Dictionary<string, string>();
                    for (var col = 1; col <= expected.Length; col++)
                    {
                        var cell = sheet.Cell(number, col);
                        if (cell.HasFormula || cell.DataType == XLDataType.Error)
                            report.Issues.Add(new(sheet.Name, number, headers[col - 1], "Chỉ nhận giá trị tĩnh, không nhận công thức hoặc ô lỗi."));
                        cells[headers[col - 1]] = cell.HasFormula ? "" : cell.GetString().Trim();
                    }
                    if (number > 1 && cells.Values.Any(v => v.Length > 0)) rows.Add(new(sheet.Name, number, cells));
                }
            }
            if (rows.Count > MaxRows) Error("Tối đa 3.000 dòng dữ liệu trên toàn file.");
            foreach (var name in new[] { "Topics", "Vocabularies", "Grammars" })
                if (rows.Count(r => r.Sheet == name) > 500) Error($"Sheet {name} tối đa 500 mục mỗi lần nhập.");
            if (!rows.Any(r => r.Sheet is "Topics" or "Vocabularies" or "Grammars")) Error("File phải có ít nhất một chủ đề, từ vựng hoặc ngữ pháp.");
        }
        catch (Exception e) when (e is not OutOfMemoryException and not OperationCanceledException)
        { Error("Không đọc được Excel. File có thể bị hỏng, có mật khẩu hoặc không đúng định dạng .xlsx."); }
        return new(rows, report);
    }

    public static byte[] Template()
    {
        using var workbook = new XLWorkbook();
        var guide = workbook.Worksheets.Add("Guide");
        string[] instructions = [
            "JCAP — Mẫu nhập kho học liệu v1",
            "Chỉ .xlsx, tối đa 5 MB; 500 mục mỗi sheet Topics/Vocabularies/Grammars, 3.000 dòng toàn file.",
            "XÓA các dòng minh họa trước khi nhập dữ liệu thật. Có thể xóa sheet không dùng; giữ đúng tên sheet và đủ tiêu đề cột của sheet dùng.",
            "Topics: bắt buộc Code, Name, JLPTLevel. Code: chữ Latin/số/_/-; duy nhất; tối đa 50 ký tự. Level N5..N1.",
            "Vocabularies: bắt buộc Key, Word, Meaning, JLPTLevel. Grammars: bắt buộc Key, Pattern, Meaning, JLPTLevel.",
            "Key là mã trong file (tối đa 100 ký tự), duy nhất trong từng sheet. Các cột khác có thể trống.",
            "TopicCodes: mã chủ đề đã có hoặc có trong Topics; nhiều mã ngăn bằng dấu ;. Nội dung và chủ đề phải cùng level.",
            "Sources: bắt buộc tất cả cột. Name + Version nhận diện nguồn; URL phải là http/https. Giữ giấy phép và ghi công đúng nguồn.",
            "SourceKey tham chiếu Sources.Key trong file. Nội dung dẫn nguồn cần cả SourceKey và ExternalId (mã bản ghi gốc).",
            "Examples: Kind = vocabulary hoặc grammar; ContentKey = Key ở sheet tương ứng. JapaneseText bắt buộc.",
            "Mỗi nội dung tối đa 50 ví dụ, theo thứ tự dòng; ví dụ đầu ngữ pháp tối đa 500 ký tự. Các ví dụ khác tối đa 2.000.",
            "Furigana tùy chọn, ví dụ {猫|ねこ}. SourceKey/ExternalId của ví dụ tùy chọn; ExternalId cần SourceKey.",
            "Mục đã có: giữ nội dung, trạng thái, nguồn và ví dụ; chỉ thêm chủ đề còn thiếu. Không ghi đè hoặc khôi phục mục đã ẩn.",
            "Trùng từ + cách đọc hoặc mẫu ngữ pháp: dùng mục có sẵn nếu xác định duy nhất và cùng level. Nhiều mục giống nhau: sửa thủ công trước.",
            "Mã chủ đề đã có phải đúng tên/level; giữ mô tả và trạng thái hiện tại. Không tạo bản sao theo chủ đề.",
            "Không công thức, macro, link workbook ngoài. Kiểm tra trước rồi xác nhận; có lỗi sẽ không lưu bất kỳ dòng nào.",
            "Giới hạn: Word/Pattern 100; Reading từ 100/ngữ pháp 200; Meaning/Formation 1.000; Explanation/UsageNotes 20.000 ký tự.",
            "Có thể dùng AI để chuẩn bị file theo mẫu; admin phải kiểm tra nội dung, bản dịch, level, quyền sử dụng và ghi công trước khi nhập."
        ];
        for (var i = 0; i < instructions.Length; i++) guide.Cell(i + 1, 1).Value = instructions[i];
        guide.Column(1).Width = 115; guide.Column(1).Style.Alignment.WrapText = true;
        guide.Rows(1, instructions.Length).Height = 34; guide.Row(1).Style.Font.Bold = true;
        var examples = new Dictionary<string, string[][]>
        {
            ["Topics"] = [["PETS_N5", "Thú cưng", "N5", "Chủ đề minh họa — hãy xóa dòng này"]],
            ["Vocabularies"] = [["V001", "猫", "ねこ", "Con mèo", "N5", "Danh từ", "Tên một loài vật nuôi.", "", "PETS_N5", "", ""]],
            ["Grammars"] = [["G001", "〜がいます", "がいます", "Có (người, động vật)", "N5", "N + がいます", "Diễn tả sự tồn tại của người hoặc động vật.", "", "PETS_N5", "", ""]],
            ["Examples"] = [["vocabulary", "V001", "猫がいます。", "Có một con mèo.", "{猫|ねこ}がいます。", "", ""], ["grammar", "G001", "犬がいます。", "Có một con chó.", "{犬|いぬ}がいます。", "", ""]],
            ["Sources"] = []
        };
        foreach (var (name, columns) in Columns)
        {
            var sheet = workbook.Worksheets.Add(name);
            for (var col = 0; col < columns.Length; col++) sheet.Cell(1, col + 1).Value = columns[col];
            for (var row = 0; row < examples[name].Length; row++)
                for (var col = 0; col < columns.Length; col++) sheet.Cell(row + 2, col + 1).Value = examples[name][row][col];
            var header = sheet.Range(1, 1, 1, columns.Length);
            header.Style.Fill.BackgroundColor = XLColor.FromHtml("#0878EE"); header.Style.Font.FontColor = XLColor.White; header.Style.Font.Bold = true;
            sheet.Columns(1, columns.Length).Width = 24;
            sheet.Columns(1, columns.Length).Style.NumberFormat.Format = "@";
            sheet.Columns(1, columns.Length).Style.Alignment.WrapText = true;
            sheet.SheetView.FreezeRows(1); sheet.Row(1).Height = 28;
            sheet.Range(1, 1, Math.Max(2, examples[name].Length + 1), columns.Length).SetAutoFilter();
        }
        using var output = new MemoryStream(); workbook.SaveAs(output); return output.ToArray();
    }
}
