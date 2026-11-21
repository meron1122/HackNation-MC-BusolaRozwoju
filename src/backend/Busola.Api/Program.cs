using Busola.Api.Authorization;
using Busola.Api.Infrastructure;
using Busola.Api.Seeders;
using Busola.Database;
using Busola.Database.Entities;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

var connectionString = builder.Configuration.GetConnectionString("Busola")
    ?? throw new InvalidOperationException(
        "Brak ConnectionStrings:Busola. Ustaw przez user secrets albo zmienną środowiskową ConnectionStrings__Busola.");
var jwt = JwtOptions.Load(builder.Configuration);

builder.Services.AddDbContext<BusolaDbContext>(options => options.UseNpgsql(connectionString));

builder.Services
    .AddIdentityCore<User>(options => options.User.RequireUniqueEmail = true)
    .AddRoles<Role>()
    .AddSignInManager()
    .AddEntityFrameworkStores<BusolaDbContext>();

builder.Services.AddSingleton(jwt);
builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.MapInboundClaims = false;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidIssuer = jwt.Issuer,
            ValidAudience = jwt.Audience,
            IssuerSigningKey = jwt.SigningKey,
            NameClaimType = BusolaClaims.Name,
            RoleClaimType = BusolaClaims.Role,
        };
    });

builder.Services.AddAuthorization(options =>
{
    options.FallbackPolicy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build();
    options.AddPermissionPolicies();
});

builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<AccessScopeService>();
builder.Services.AddScoped<TokenService>();
builder.Services.AddExceptionHandler<DbExceptionHandler>();
builder.Services.AddProblemDetails();

builder.Services.AddControllers().AddJsonOptions(options =>
{
    // Brak wymaganego pola w JSON = 400, a nie cicha wartość domyślna (np. data 0001-01-01).
    options.JsonSerializerOptions.RespectRequiredConstructorParameters = true;
    options.JsonSerializerOptions.RespectNullableAnnotations = true;
});
builder.Services.AddOpenApi();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi().AllowAnonymous();
}

app.UseExceptionHandler();
app.UseHttpsRedirection();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

await SuperAdminSeeder.SeedAsync(app.Services, app.Configuration);

app.Run();
