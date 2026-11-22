using System.Security.Claims;
using System.Threading.RateLimiting;
using Busola.Api.Agent.Tools;
using Busola.Api.Authorization;
using Microsoft.Extensions.Options;

namespace Busola.Api.Agent;

public static class AgentServiceCollectionExtensions
{
    public const string RateLimitPolicy = "agent";

    public static IServiceCollection AddAgent(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<OpenRouterOptions>(configuration.GetSection(OpenRouterOptions.SectionName));
        void OpenRouter(IServiceProvider sp, HttpClient client)
        {
            client.BaseAddress = new Uri(sp.GetRequiredService<IOptions<OpenRouterOptions>>().Value.BaseUrl.TrimEnd('/') + "/");
            client.Timeout = TimeSpan.FromMinutes(2);
        }

        services.AddHttpClient<ILlmClient, OpenRouterClient>(OpenRouter);
        services.AddHttpClient<IEmbeddingClient, OpenRouterEmbeddingClient>(OpenRouter);

        // Baza wiedzy: przepisy i Q&A z Agent/Knowledge/*.md; wektory liczy KnowledgeIndexer po starcie.
        services.AddSingleton(sp => new VectorKnowledgeBase(
            VectorKnowledgeBase.LoadDirectory(Path.Combine(AppContext.BaseDirectory, "Agent", "Knowledge")),
            sp.GetRequiredService<IEmbeddingClient>(),
            sp.GetRequiredService<ILogger<VectorKnowledgeBase>>()));
        services.AddSingleton<IKnowledgeBase>(sp => sp.GetRequiredService<VectorKnowledgeBase>());
        services.AddHostedService<KnowledgeIndexer>();

        services.AddScoped<ScreenContextService>();
        services.AddScoped<AgentRunner>();
        services.AddSingleton<AgentGuard>();

        // Limit na użytkownika: hamuje masowe próby obejścia zasad i koszty modelu. Wymaga app.UseRateLimiter().
        services.AddRateLimiter(o =>
        {
            o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            o.OnRejected = (context, ct) => new ValueTask(context.HttpContext.Response.WriteAsJsonAsync(
                new { detail = "Za dużo pytań naraz. Odczekaj minutę i spróbuj ponownie." }, ct));
            o.AddPolicy(RateLimitPolicy, http => RateLimitPartition.GetFixedWindowLimiter(
                http.User.FindFirstValue(BusolaClaims.UserId) ?? http.Connection.RemoteIpAddress?.ToString() ?? "anon",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = 20, Window = TimeSpan.FromMinutes(1) }));
        });

        // Narzędzia agenta: jedna linia na narzędzie.
        services.AddScoped<IAgentTool, SearchKnowledgeTool>();
        services.AddScoped<IAgentTool, ListEmployeesTool>();
        services.AddScoped<IAgentTool, TeamOverviewTool>();

        return services;
    }
}
