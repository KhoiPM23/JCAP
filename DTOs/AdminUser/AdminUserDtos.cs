namespace JCAP.DTOs.AdminUser;

public class AdminUserSearchFilterRequest
{
    public string? Search { get; set; }
    public string? Status { get; set; } // "all" | "active" | "banned"
    public string? JlptLevel { get; set; } // "all" | "N5" | "N4" | "N3"
    public string? Role { get; set; } // "all" | "Learner" | "Admin"
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 10;
}

public class AdminUserListItemDto
{
    public string Id { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string Role { get; set; } = "Learner";
    public string JlptLevel { get; set; } = "N5";
    public int CreditBalance { get; set; }
    public bool IsActive { get; set; }
    public bool EmailConfirmed { get; set; }
    public string? ProfilePictureUrl { get; set; }
    public DateTime CreatedAt { get; set; }
    public int TotalRoleplaySessions { get; set; }
}

public class AdminUserPagedResponseDto
{
    public List<AdminUserListItemDto> Items { get; set; } = [];
    public int TotalCount { get; set; }
    public int ActiveCount { get; set; }
    public int BannedCount { get; set; }
    public int LearnerCount { get; set; }
    public int Page { get; set; }
    public int PageSize { get; set; }
    public int TotalPages { get; set; }
}

public class ChangeUserAccountStatusDto
{
    public bool IsActive { get; set; }
    public string? Reason { get; set; }
}

