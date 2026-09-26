namespace JCAP.DTOs.Roleplay;

public class StartRoleplaySessionRequestDto
{
    /// <summary>
    /// Nếu true: Sẽ hủy phiên dở dang hiện tại (nếu có, không hoàn credit cũ) và tạo phiên mới với lần trừ credit mới.
    /// Nếu false: Nếu có phiên dở dang thì trả về phiên dở dang đó mà không trừ thêm credit.
    /// </summary>
    public bool ForceRestart { get; set; } = false;
}
