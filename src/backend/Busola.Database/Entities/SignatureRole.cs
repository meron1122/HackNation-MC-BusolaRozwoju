namespace Busola.Database.Entities;

/// <summary>Role z pól „signature” i „person” w szablonach.</summary>
public enum SignatureRole
{
    /// <summary>Oceniany.</summary>
    Evaluated,

    /// <summary>Bezpośredni przełożony (pierwsza ocena).</summary>
    Supervisor,

    /// <summary>Kierujący komórką organizacyjną (pierwsza ocena).</summary>
    UnitHead,

    /// <summary>Oceniający (ocena okresowa).</summary>
    Evaluator,
}
