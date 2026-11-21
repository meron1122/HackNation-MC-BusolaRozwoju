using Busola.Api.Authorization;
using Busola.Api.Models;
using Busola.Database.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace Busola.Api.Controllers;

[ApiController]
[Route("api/auth")]
[AllowAnonymous]
public sealed class AuthController(UserManager<User> userManager, SignInManager<User> signInManager, TokenService tokens)
    : ControllerBase
{
    /// <summary>Token zawiera role i uprawnienia z chwili logowania — po zmianie ról trzeba zalogować się ponownie.</summary>
    [HttpPost("login")]
    public async Task<ActionResult<LoginResponse>> Login(LoginRequest request, CancellationToken ct)
    {
        var user = await userManager.FindByEmailAsync(request.Email);
        if (user is null)
        {
            return Unauthorized();
        }

        var result = await signInManager.CheckPasswordSignInAsync(user, request.Password, lockoutOnFailure: true);
        if (!result.Succeeded)
        {
            return Unauthorized();
        }

        return new LoginResponse(await tokens.CreateTokenAsync(user, ct));
    }
}
