using Busola.Api.Agent;
using Busola.Api.Audit;
using Busola.Api.Authorization;
using Busola.Api.Infrastructure;
using Busola.Api.Seeders;
using Busola.Api.Signatures;
using Busola.Database;
using Busola.Database.Entities;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

// Licencja Community: darmowa dla firm do 1 mln USD przychodu rocznie i projektów open source.
QuestPDF.Settings.License = QuestPDF.Infrastructure.LicenseType.Community;

var builder = WebApplication.CreateBuilder(args);

var connectionString = builder.Configuration.GetConnectionString("Busola")
    ?? throw new InvalidOperationException(
        "Brak ConnectionStrings:Busola. Ustaw przez user secrets albo zmienną środowiskową ConnectionStrings__Busola.");
connectionString = NormalizeConnectionString(connectionString);
var jwt = JwtOptions.Load(builder.Configuration);

builder.Services.AddSingleton<AuditContext>();
builder.Services.AddSingleton<AuditInterceptor>();
builder.Services.AddDbContext<BusolaDbContext>((sp, options) =>
    options.UseNpgsql(connectionString).AddInterceptors(sp.GetRequiredService<AuditInterceptor>()));

builder.Services
    .AddIdentityCore<User>(options => options.User.RequireUniqueEmail = true)
    .AddRoles<Role>()
    .AddSignInManager()
    .AddEntityFrameworkStores<BusolaDbContext>()
    .AddTokenProvider<AuthenticatorTokenProvider<User>>(TokenOptions.DefaultAuthenticatorProvider)
    .AddErrorDescriber<PolishIdentityErrorDescriber>();

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
        options.Events = new JwtBearerEvents { OnTokenValidated = SecurityStampValidation.ValidateAsync };
    });

builder.Services.AddAuthorization(options =>
{
    options.FallbackPolicy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build();
    options.AddPermissionPolicies();
});

builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<AccessScopeService>();
builder.Services.AddAgent(builder.Configuration);
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddScoped<SignatureService>();
builder.Services.AddSingleton<DevSignatureStore>();
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

app.UseMiddleware<AuditMiddleware>(); // przed UseExceptionHandler: widzi ostateczny status
app.UseExceptionHandler();
app.UseHttpsRedirection();
app.UseStaticFiles(); // zbudowany frontend w wwwroot (wrzuca go Dockerfile)
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();
app.MapControllers();
app.MapFallback("api/{**path}", () => Results.NotFound()).AllowAnonymous();
app.MapFallbackToFile("index.html").AllowAnonymous();

await using (var scope = app.Services.CreateAsyncScope())
{
    await scope.ServiceProvider.GetRequiredService<BusolaDbContext>().Database.MigrateAsync();
}

await ServiceSeeder.SeedAsync(app.Services);
await SuperAdminSeeder.SeedAsync(app.Services, app.Configuration);

app.Run();

// Render podaje URL (postgresql://user:pass@host[:port]/db), a Npgsql przyjmuje tylko Host=...;Port=...
static string NormalizeConnectionString(string value)
{
    if (!value.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase)
        && !value.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase))
    {
        return value;
    }

    var uri = new Uri(value);
    var userInfo = uri.UserInfo.Split(':', 2);
    return new Npgsql.NpgsqlConnectionStringBuilder
    {
        Host = uri.Host,
        Port = uri.Port > 0 ? uri.Port : 5432,
        Database = uri.AbsolutePath.TrimStart('/'),
        Username = Uri.UnescapeDataString(userInfo[0]),
        Password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : null,
    }.ConnectionString;
}
