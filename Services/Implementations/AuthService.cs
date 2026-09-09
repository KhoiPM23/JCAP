using JCAP.DTOs.Auth;
using JCAP.DTOs.Common;
using JCAP.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace JCAP.Services.Implementations
{
    public class AuthService : Interfaces.IAuthService
    {
        private readonly UserManager<ApplicationUser> _userManager;
        private readonly RoleManager<IdentityRole> _roleManager;
        private readonly IConfiguration _configuration;

        public AuthService(
            UserManager<ApplicationUser> userManager,
            RoleManager<IdentityRole> roleManager,
            IConfiguration configuration)
        {
            _userManager = userManager;
            _roleManager = roleManager;
            _configuration = configuration;
        }

        public async Task<ApiResponse<AuthResponseDto>> RegisterAsync(RegisterDto dto)
        {
            var existingUser = await _userManager.FindByEmailAsync(dto.Email);
            if (existingUser != null)
            {
                return ApiResponse<AuthResponseDto>.Fail("Email này đã được sử dụng.");
            }

            var role = string.IsNullOrWhiteSpace(dto.Role) ? "Learner" : dto.Role;
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
                EmailConfirmed = true // Tạm thời đặt true để có thể login test ngay
            };

            var result = await _userManager.CreateAsync(user, dto.Password);
            if (!result.Succeeded)
            {
                var errors = result.Errors.Select(e => e.Description).ToList();
                return ApiResponse<AuthResponseDto>.Fail("Tạo tài khoản thất bại.", errors);
            }

            await _userManager.AddToRoleAsync(user, role);

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

            return ApiResponse<AuthResponseDto>.Ok(response, "Đăng ký tài khoản thành công.");
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

