using Microsoft.AspNetCore.Diagnostics;
using Npgsql;

namespace Busola.Api.Infrastructure;

/// <summary>Naruszenia ograniczeń bazy (unikalność, klucze obce, CHECK) zwracamy jako 409 zamiast 500.</summary>
public sealed class DbExceptionHandler(IProblemDetailsService problemDetails) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken ct)
    {
        var postgres = exception as PostgresException ?? exception.InnerException as PostgresException;
        var detail = postgres?.SqlState switch
        {
            PostgresErrorCodes.UniqueViolation => "Taki rekord już istnieje.",
            PostgresErrorCodes.ForeignKeyViolation or PostgresErrorCodes.RestrictViolation =>
                "Rekord jest powiązany z innymi danymi.",
            PostgresErrorCodes.CheckViolation => "Dane naruszają regułę spójności.",
            _ => null,
        };

        if (detail is null)
        {
            return false;
        }

        httpContext.Response.StatusCode = StatusCodes.Status409Conflict;
        return await problemDetails.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            Exception = exception,
            ProblemDetails =
            {
                Status = StatusCodes.Status409Conflict,
                Title = "Konflikt danych",
                Detail = $"{detail} ({postgres!.ConstraintName})",
            },
        });
    }
}
