namespace Busola.Database.Entities;

/// <summary>Szablon arkusza oceny. Schema to jsonb ze strukturą — patrz EvaluationTemplates.TemplateSchema.</summary>
public class EvaluationTemplate
{
    public int Id { get; set; }

    /// <summary>first, periodic-b, periodic-c.</summary>
    public required string Code { get; set; }

    public int Version { get; set; }
    public EvaluationKind Kind { get; set; }
    public required string Title { get; set; }
    public required string Schema { get; set; }

    /// <summary>Według aktywnej wersji zakłada się nowe oceny; starsze zostają dla ocen już rozpoczętych.</summary>
    public bool IsActive { get; set; }
}
