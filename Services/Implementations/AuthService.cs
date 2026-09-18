using JCAP.Data.Static;
using JCAP.DTOs.Auth;
using JCAP.DTOs.Common;
using JCAP.Services.Interfaces;
using Microsoft.AspNetCore.Identity;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using System.Net.Http.Headers;
using JCAP.Models;

namespace JCAP.Services.Implementations
{
    public class AuthService : Interfaces.IAuthService
    {
        private readonly UserManager<ApplicationUser> _userManager;
        private readonly RoleManager<IdentityRole> _roleManager;
        private readonly IConfiguration _configuration;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly IEmailService _emailService;

        public AuthService(
            UserManager<ApplicationUser> userManager,
            RoleManager<IdentityRole> roleManager,
            IConfiguration configuration,
            IHttpClientFactory httpClientFactory,
            IEmailService emailService)
        {
            _userManager = userManager;
            _roleManager = roleManager;
            _configuration = configuration;
            _httpClientFactory = httpClientFactory;
            _emailService = emailService;
        }

        public async Task<ApiResponse<RegisterResponseDto>> RegisterAsync(RegisterDto dto)
        {
            var existingUser = await _userManager.FindByEmailAsync(dto.Email);
            if (existingUser != null)
            {
                return ApiResponse<RegisterResponseDto>.Fail(
                    existingUser.EmailConfirmed
                        ? "Email này đã được sử dụng."
                        : "Email này đã được đăng ký nhưng chưa xác minh.");
            }

            // Ràng buộc bảo mật: Người dùng đăng ký công khai chỉ được phép mang vai trò Learner
            if (!string.IsNullOrWhiteSpace(dto.Role) && !string.Equals(dto.Role, UserRoles.Learner, StringComparison.OrdinalIgnoreCase))
            {
                return ApiResponse<RegisterResponseDto>.Fail($"Không thể đăng ký với vai trò '{dto.Role}'. Hệ thống chỉ cho phép đăng ký tài khoản với vai trò '{UserRoles.Learner}'.");
            }

            var role = UserRoles.Learner;
            if (!await _roleManager.RoleExistsAsync(role))
            {
                await _roleManager.CreateAsync(new IdentityRole(role));
            }

            var user = new ApplicationUser
            {
                UserName = dto.Email,
                Email = dto.Email,
                FullName = dto.FullName,
                Role = role,
                EmailConfirmed = false
            };

            var result = await _userManager.CreateAsync(user, dto.Password);
            if (!result.Succeeded)
            {
                var errors = result.Errors.Select(e => e.Description).ToList();
                return ApiResponse<RegisterResponseDto>.Fail("Tạo tài khoản thất bại.", errors);
            }

            await _userManager.AddToRoleAsync(user, role);

            var confirmationToken = await _userManager.GenerateEmailConfirmationTokenAsync(user);
            var backendUrl = _configuration["BackendUrl"] ?? "http://localhost:5254";
            var confirmationUrl = $"{backendUrl.TrimEnd('/')}/api/auth/confirm-email" +
                $"?userId={Uri.EscapeDataString(user.Id)}" +
                $"&token={Uri.EscapeDataString(confirmationToken)}";

            var fullName = System.Net.WebUtility.HtmlEncode(user.FullName ?? user.Email);
            var encodedConfirmationUrl = System.Net.WebUtility.HtmlEncode(confirmationUrl);
            var emailBody = $"""
                <p>Xin chào {fullName},</p>
                <p>Cảm ơn bạn đã đăng ký tài khoản JCAP.</p>
                <p>Vui lòng nhấn vào liên kết bên dưới để xác minh email:</p>
                <p><a href="{encodedConfirmationUrl}">Xác minh email</a></p>
                <p>Nếu bạn không thực hiện đăng ký này, bạn có thể bỏ qua email.</p>
                <p>Trân trọng,<br/>JCAP</p>
                """;

            try
            {
                await _emailService.SendAsync(
                    user.Email!,
                    "Xác minh email tài khoản JCAP",
                    emailBody);
            }
            catch
            {
                await _userManager.DeleteAsync(user);
                return ApiResponse<RegisterResponseDto>.Fail(
                    "Không thể gửi email xác minh. Vui lòng thử lại sau.");
            }

            return ApiResponse<RegisterResponseDto>.Ok(
                new RegisterResponseDto { Email = user.Email! },
                "Đăng ký thành công. Vui lòng kiểm tra email để xác minh tài khoản.");
        }

        public async Task<ApiResponse<bool>> ConfirmEmailAsync(string userId, string token)
        {
            if (string.IsNullOrWhiteSpace(userId) || string.IsNullOrWhiteSpace(token))
            {
                return ApiResponse<bool>.Fail("Liên kết xác minh email không hợp lệ.");
            }

            var user = await _userManager.FindByIdAsync(userId);
            if (user == null)
            {
                return ApiResponse<bool>.Fail("Không tìm thấy tài khoản cần xác minh.");
            }

            if (user.EmailConfirmed)
            {
                return ApiResponse<bool>.Ok(true, "Email đã được xác minh trước đó.");
            }

            var result = await _userManager.ConfirmEmailAsync(user, token);
            if (!result.Succeeded)
            {
                var errors = result.Errors.Select(e => e.Description).ToList();
                return ApiResponse<bool>.Fail("Liên kết xác minh email không hợp lệ hoặc đã hết hạn.", errors);
            }

            return ApiResponse<bool>.Ok(true, "Xác minh email thành công.");
        }

        public async Task<ApiResponse<AuthResponseDto>> LoginAsync(LoginDto dto)
        {
            var user = await _userManager.FindByEmailAsync(dto.Email);
            if (user == null)
            {
                return ApiResponse<AuthResponseDto>.Fail("Email hoặc mật khẩu không chính xác.");
            }

            if (!user.IsActive)
            {
                return ApiResponse<AuthResponseDto>.Fail("Tài khoản của bạn đã bị khóa.");
            }

            if (!user.EmailConfirmed)
            {
                return ApiResponse<AuthResponseDto>.Fail("Email chưa được xác minh. Vui lòng kiểm tra email của bạn.");
            }

            var isPasswordValid = await _userManager.CheckPasswordAsync(user, dto.Password);
            if (!isPasswordValid)
            {
                return ApiResponse<AuthResponseDto>.Fail("Email hoặc mật khẩu không chính xác.");
            }

            var roles = await _userManager.GetRolesAsync(user);
            var role = roles.FirstOrDefault() ?? user.Role;

            var (token, expiresAt) = GenerateJwtToken(user, role);

            var response = new AuthResponseDto
            {
                Token = token,
                UserId = user.Id,
                Email = user.Email!,
                FullName = user.FullName ?? string.Empty,
                Role = role,
                ExpiresAt = expiresAt
            };

            return ApiResponse<AuthResponseDto>.Ok(response, "Đăng nhập thành công.");
        }

        public async Task<ApiResponse<AuthResponseDto>> GetCurrentUserAsync(string userId)
        {
            var user = await _userManager.FindByIdAsync(userId);
            if (user == null)
            {
                return ApiResponse<AuthResponseDto>.Fail("Không tìm thấy thông tin người dùng.");
            }

            var roles = await _userManager.GetRolesAsync(user);
            var role = roles.FirstOrDefault() ?? user.Role;

            var response = new AuthResponseDto
            {
                Token = string.Empty,
                UserId = user.Id,
                Email = user.Email!,
                FullName = user.FullName ?? string.Empty,
                Role = role,
                ExpiresAt = DateTime.UtcNow
            };

            return ApiResponse<AuthResponseDto>.Ok(response, "Lấy thông tin người dùng thành công.");
        }

        public string GetGoogleAuthUrl()
        {
            var clientId = _configuration["Authentication:Google:ClientId"]
                ?? throw new InvalidOperationException("Google ClientId chưa được cấu hình.");
            var redirectUri = _configuration["Authentication:Google:RedirectUri"]
                ?? "http://localhost:5254/api/auth/google/callback";
            var scope = Uri.EscapeDataString("openid email profile");
            var encodedRedirectUri = Uri.EscapeDataString(redirectUri);

            return $"https://accounts.google.com/o/oauth2/v2/auth?client_id={clientId}&redirect_uri={encodedRedirectUri}&response_type=code&scope={scope}&access_type=offline&prompt=select_account";
        }

        public async Task<ApiResponse<AuthResponseDto>> ProcessGoogleCallbackAsync(string code)
        {
            try
            {
                var client = _httpClientFactory.CreateClient();
                var clientId = _configuration["Authentication:Google:ClientId"]
                    ?? throw new InvalidOperationException("Google ClientId chưa được cấu hình.");
                var clientSecret = _configuration["Authentication:Google:ClientSecret"]
                    ?? throw new InvalidOperationException("Google ClientSecret chưa được cấu hình.");
                var redirectUri = _configuration["Authentication:Google:RedirectUri"]
                    ?? "http://localhost:5254/api/auth/google/callback";

                var tokenParams = new Dictionary<string, string>
                {
                    ["code"] = code,
                    ["client_id"] = clientId,
                    ["client_secret"] = clientSecret,
                    ["redirect_uri"] = redirectUri,
                    ["grant_type"] = "authorization_code"
                };

                var tokenResponse = await client.PostAsync("https://oauth2.googleapis.com/token", new FormUrlEncodedContent(tokenParams));
                if (!tokenResponse.IsSuccessStatusCode)
                {
                    var err = await tokenResponse.Content.ReadAsStringAsync();
                    return ApiResponse<AuthResponseDto>.Fail($"Không thể trao đổi mã xác thực với Google: {err}");
                }

                var tokenJson = await tokenResponse.Content.ReadAsStringAsync();
                using var tokenDoc = JsonDocument.Parse(tokenJson);
                if (!tokenDoc.RootElement.TryGetProperty("access_token", out var accessTokenProp))
                {
                    return ApiResponse<AuthResponseDto>.Fail("Phản hồi từ Google không chứa access_token.");
                }
                var accessToken = accessTokenProp.GetString();

                var userInfoRequest = new HttpRequestMessage(HttpMethod.Get, "https://www.googleapis.com/oauth2/v2/userinfo");
                userInfoRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
                var userInfoResponse = await client.SendAsync(userInfoRequest);
                if (!userInfoResponse.IsSuccessStatusCode)
                {
                    return ApiResponse<AuthResponseDto>.Fail("Không thể lấy thông tin người dùng từ Google.");
                }

                var userInfoJson = await userInfoResponse.Content.ReadAsStringAsync();
                using var userInfoDoc = JsonDocument.Parse(userInfoJson);
                var root = userInfoDoc.RootElement;
                var googleId = root.GetProperty("id").GetString();
                var email = root.TryGetProperty("email", out var emailProp) ? emailProp.GetString() : null;
                var name = root.TryGetProperty("name", out var nameProp) ? nameProp.GetString() : null;
                var picture = root.TryGetProperty("picture", out var picProp) ? picProp.GetString() : null;

                if (string.IsNullOrEmpty(email) || string.IsNullOrEmpty(googleId))
                {
                    return ApiResponse<AuthResponseDto>.Fail("Google không cung cấp thông tin tài khoản hợp lệ.");
                }

                // 1. Kiểm tra xem user đã liên kết Google Login chưa
                var user = await _userManager.FindByLoginAsync("Google", googleId);
                if (user == null)
                {
                    // 2. Kiểm tra xem đã có user nào dùng email này chưa
                    user = await _userManager.FindByEmailAsync(email);
                    if (user != null)
                    {
                        // Đã có tài khoản với email này -> liên kết thêm Google login
                        await _userManager.AddLoginAsync(user, new UserLoginInfo("Google", googleId, "Google"));
                    }
                    else
                    {
                        // Tạo tài khoản mới với vai trò Learner
                        var role = UserRoles.Learner;
                        if (!await _roleManager.RoleExistsAsync(role))
                        {
                            await _roleManager.CreateAsync(new IdentityRole(role));
                        }

                        user = new ApplicationUser
                        {
                            UserName = email,
                            Email = email,
                            FullName = !string.IsNullOrWhiteSpace(name) ? name : email.Split('@')[0],
                            ProfilePictureUrl = picture,
                            Role = role,
                            EmailConfirmed = true,
                            IsActive = true,
                            CreatedAt = DateTime.UtcNow
                        };

                        var createResult = await _userManager.CreateAsync(user);
                        if (!createResult.Succeeded)
                        {
                            var errors = createResult.Errors.Select(e => e.Description).ToList();
                            return ApiResponse<AuthResponseDto>.Fail("Không thể tạo tài khoản từ Google.", errors);
                        }

                        await _userManager.AddToRoleAsync(user, role);
                        await _userManager.AddLoginAsync(user, new UserLoginInfo("Google", googleId, "Google"));
                    }
                }

                if (!user.IsActive)
                {
                    return ApiResponse<AuthResponseDto>.Fail("Tài khoản của bạn đã bị khóa.");
                }

                // Cập nhật ProfilePictureUrl nếu user chưa có
                if (string.IsNullOrEmpty(user.ProfilePictureUrl) && !string.IsNullOrEmpty(picture))
                {
                    user.ProfilePictureUrl = picture;
                    await _userManager.UpdateAsync(user);
                }

                var roles = await _userManager.GetRolesAsync(user);
                var userRole = roles.FirstOrDefault() ?? user.Role;

                var (jwtToken, expiresAt) = GenerateJwtToken(user, userRole);

                var response = new AuthResponseDto
                {
                    Token = jwtToken,
                    UserId = user.Id,
                    Email = user.Email!,
                    FullName = user.FullName ?? string.Empty,
                    Role = userRole,
                    ExpiresAt = expiresAt
                };

                return ApiResponse<AuthResponseDto>.Ok(response, "Đăng nhập Google thành công.");
            }
            catch (Exception ex)
            {
                return ApiResponse<AuthResponseDto>.Fail($"Đã xảy ra lỗi khi xử lý đăng nhập Google: {ex.Message}");
            }
        }

        private (string Token, DateTime ExpiresAt) GenerateJwtToken(ApplicationUser user, string role)
        {
            var jwtKey = _configuration["Jwt:Key"] ?? throw new InvalidOperationException("Jwt:Key chưa được cấu hình.");
            var issuer = _configuration["Jwt:Issuer"];
            var audience = _configuration["Jwt:Audience"];
            var durationInMinutes = double.Parse(_configuration["Jwt:DurationInMinutes"] ?? "1440");

            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));
            var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var claims = new List<Claim>
            {
                new Claim(ClaimTypes.NameIdentifier, user.Id),
                new Claim(ClaimTypes.Email, user.Email ?? string.Empty),
                new Claim(ClaimTypes.Name, user.FullName ?? user.UserName ?? string.Empty),
                new Claim(ClaimTypes.Role, role),
                new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
            };

            var expiresAt = DateTime.UtcNow.AddMinutes(durationInMinutes);

            var tokenDescriptor = new SecurityTokenDescriptor
            {
                Subject = new ClaimsIdentity(claims),
                Expires = expiresAt,
                Issuer = issuer,
                Audience = audience,
                SigningCredentials = credentials
            };

            var tokenHandler = new JwtSecurityTokenHandler();
            var token = tokenHandler.CreateToken(tokenDescriptor);

            return (tokenHandler.WriteToken(token), expiresAt);
        }
    }
}

