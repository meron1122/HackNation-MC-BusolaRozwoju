using Busola.Api.Agent.Tools;
using Microsoft.Extensions.Options;

namespace Busola.Api.Agent;

public static class AgentServiceCollectionExtensions
{
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

        // Narzędzia agenta: jedna linia na narzędzie.
        services.AddScoped<IAgentTool, SearchKnowledgeTool>();
        services.AddScoped<IAgentTool, ListEmployeesTool>();
        services.AddScoped<IAgentTool, TeamOverviewTool>();

        return services;
    }
}
