using Busola.Api.Agent.Tools;

namespace Busola.Api.Agent;

public static class AgentServiceCollectionExtensions
{
    public static IServiceCollection AddAgent(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<OpenRouterOptions>(configuration.GetSection(OpenRouterOptions.SectionName));
        services.AddHttpClient<ILlmClient, OpenRouterClient>(client =>
        {
            client.BaseAddress = new Uri("https://openrouter.ai/api/v1/");
            client.Timeout = TimeSpan.FromMinutes(2);
        });

        services.AddSingleton<IKnowledgeBase>(
            MarkdownKnowledgeBase.Load(Path.Combine(AppContext.BaseDirectory, "Agent", "Knowledge")));
        services.AddScoped<AgentRunner>();

        // Narzędzia agenta: jedna linia na narzędzie.
        services.AddScoped<IAgentTool, SearchKnowledgeTool>();
        services.AddScoped<IAgentTool, ListEmployeesTool>();

        return services;
    }
}
