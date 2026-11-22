using System.Text.Json;
using Busola.Database.Entities;
using Busola.Database.EvaluationTemplates;

namespace Busola.Api.Evaluations;

/// <summary>Odczyt właściwości pól zależnych od typu (FieldDefinition.Extra) i powiązań pól z sekcjami/etapami.</summary>
public static class FieldDefinitionExtensions
{
    public static string? ExtraString(this FieldDefinition field, string name) =>
        field.Extra?.GetValueOrDefault(name) is { ValueKind: JsonValueKind.String } value ? value.GetString() : null;

    public static bool ExtraBool(this FieldDefinition field, string name) =>
        field.Extra?.GetValueOrDefault(name) is { ValueKind: JsonValueKind.True };

    public static int? ExtraInt(this FieldDefinition field, string name) =>
        field.Extra?.GetValueOrDefault(name) is { ValueKind: JsonValueKind.Number } value ? value.GetInt32() : null;

    public static IReadOnlyList<JsonElement>? ExtraArray(this FieldDefinition field, string name) =>
        field.Extra?.GetValueOrDefault(name) is { ValueKind: JsonValueKind.Array } value ? value.EnumerateArray().ToList() : null;

    public static JsonElement? ExtraObject(this FieldDefinition field, string name) =>
        field.Extra?.GetValueOrDefault(name) is { ValueKind: JsonValueKind.Object } value ? value : null;

    public static SignatureRole? SignatureRole(this FieldDefinition field) =>
        Enum.TryParse<SignatureRole>(field.ExtraString("role"), ignoreCase: true, out var role) ? role : null;

    /// <summary>Sekcja, w której jest pole (klucze pól są unikalne w szablonie).</summary>
    public static SectionDefinition? SectionOf(this TemplateSchema schema, string fieldKey) =>
        schema.Sections.FirstOrDefault(s => s.Fields.Any(f => f.Key == fieldKey));
}
